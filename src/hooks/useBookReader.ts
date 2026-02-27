import { useState, useEffect, useCallback, useRef } from 'react';
import { streamBookChapters } from '@/services/gutenberg';
import { processChunk } from '@/services/deepseek';
import { recordWords } from '@/services/vocabulary';
import type { GutenbergBook, Chapter, TextSegment, ProcessingStatus } from '@/types';

const MAX_CONCURRENT = 2;

export interface ParagraphState {
  raw: string;
  segments: TextSegment[] | null;
  status: ProcessingStatus;
}

// ── sessionStorage cache ────────────────────────────────────

const cacheKey = (bookId: number, chIdx: number, pIdx: number, density: number) =>
  `lexis_chunk_${bookId}_${chIdx}_${pIdx}_${density}`;

function pruneCache() {
  if (sessionStorage.length <= 200) return;
  const keys: Array<{ key: string; ts: number }> = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i)!;
    if (!k.startsWith('lexis_chunk_')) continue;
    try { keys.push({ key: k, ts: (JSON.parse(sessionStorage.getItem(k)!).processedAt as number) ?? 0 }); }
    catch { keys.push({ key: k, ts: 0 }); }
  }
  keys.sort((a, b) => a.ts - b.ts).slice(0, 50).forEach(({ key }) => sessionStorage.removeItem(key));
}

function readCache(bookId: number, chIdx: number, idx: number, density: number): TextSegment[] | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(bookId, chIdx, idx, density));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Array.isArray(p.segments) ? (p.segments as TextSegment[]) : null;
  } catch { return null; }
}

function writeCache(bookId: number, chIdx: number, idx: number, density: number, segs: TextSegment[]) {
  try {
    pruneCache();
    sessionStorage.setItem(cacheKey(bookId, chIdx, idx, density), JSON.stringify({ segments: segs, processedAt: Date.now() }));
  } catch { /* full */ }
}

// ── Hook ────────────────────────────────────────────────────

export function useBookReader(book: GutenbergBook | null, density: number, apiKey: string) {
  const chaptersRef = useRef<Chapter[]>([]);
  const [chapterCount, setChapterCount] = useState(0);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);

  const [paragraphs, setParagraphsState] = useState<ParagraphState[]>([]);
  const [fetchStatus, setFetchStatus] = useState<ProcessingStatus>('idle');

  const abortRef = useRef<AbortController | null>(null);

  // ── Live refs — updated synchronously during render ────────
  // (never stale inside async callbacks)
  const bookRef = useRef(book);
  const apiKeyRef = useRef(apiKey);
  const densityRef = useRef(density);
  const chapterIdxRef = useRef(0);
  const paragraphsRef = useRef<ParagraphState[]>([]);

  // Update synchronously at render time (not in useEffect)
  bookRef.current = book;
  apiKeyRef.current = apiKey;
  densityRef.current = density;

  // ── Processing refs ─────────────────────────────────────────
  const concurrentRef = useRef(0);
  const queueRef = useRef<number[]>([]);
  const inFlightRef = useRef<Set<number>>(new Set());

  // ── Paragraph update helper ─────────────────────────────────
  // Updates ref immediately (so async reads are always fresh),
  // then schedules the React re-render.
  const patchParagraph = useCallback((idx: number, patch: Partial<ParagraphState>) => {
    const prev = paragraphsRef.current;
    if (!prev[idx]) return;
    const next = [...prev];
    next[idx] = { ...prev[idx], ...patch };
    paragraphsRef.current = next;
    setParagraphsState(next);
  }, []);

  const setAllParagraphs = useCallback((paras: ParagraphState[]) => {
    paragraphsRef.current = paras;
    setParagraphsState(paras);
  }, []);

  // ── Engine: stable object, created once, reads refs at call-time ──
  // Using a ref ensures drain/process always call each other's
  // latest version — no stale-closure problem.
  const engineRef = useRef<{
    enqueue: (idx: number) => void;
    drain: () => void;
    process: (idx: number) => Promise<void>;
    reset: () => void;
  } | null>(null);

  if (!engineRef.current) {
    const engine = {
      reset() {
        queueRef.current = [];
        inFlightRef.current.clear();
        concurrentRef.current = 0;
      },

      enqueue(idx: number) {
        const para = paragraphsRef.current[idx];
        if (!para || para.status !== 'idle') return;
        if (inFlightRef.current.has(idx)) return;
        if (queueRef.current.includes(idx)) return;
        queueRef.current.push(idx);
        engine.drain();
      },

      drain() {
        while (concurrentRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
          const idx = queueRef.current.shift()!;
          if (inFlightRef.current.has(idx)) continue;
          const para = paragraphsRef.current[idx];
          if (!para || para.status !== 'idle') continue;
          inFlightRef.current.add(idx);
          concurrentRef.current++;
          void engine.process(idx);
        }
      },

      async process(idx: number) {
        const book = bookRef.current;
        const apiKey = apiKeyRef.current;
        const density = densityRef.current;
        const chIdx = chapterIdxRef.current;

        const done = () => {
          inFlightRef.current.delete(idx);
          concurrentRef.current = Math.max(0, concurrentRef.current - 1);
          engine.drain();
        };

        try {
          if (!book || !apiKey) { done(); return; }

          const cached = readCache(book.id, chIdx, idx, density);
          if (cached) {
            patchParagraph(idx, { segments: cached, status: 'done' });
            done();
            return;
          }

          patchParagraph(idx, { status: 'loading' });

          const rawText = paragraphsRef.current[idx]?.raw ?? '';
          if (!rawText) { done(); return; }

          const segments = await processChunk(rawText, density, apiKey);
          writeCache(book.id, chIdx, idx, density, segments);
          recordWords(segments);
          patchParagraph(idx, { segments, status: 'done' });
        } catch {
          patchParagraph(idx, { status: 'error' });
        } finally {
          done();
        }
      },
    };
    engineRef.current = engine;
  }

  // ── Public enqueue (stable ref, safe to use as effect dep) ──
  const enqueue = useCallback((idx: number) => {
    engineRef.current!.enqueue(idx);
  }, []);

  // ── Stream book ─────────────────────────────────────────────
  useEffect(() => {
    if (!book) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    chaptersRef.current = [];
    setChapterCount(0);
    setCurrentChapterIdx(0);
    chapterIdxRef.current = 0;
    setAllParagraphs([]);
    engineRef.current!.reset();
    setFetchStatus('loading');

    let firstShown = false;

    streamBookChapters(
      book,
      (chapter) => {
        chaptersRef.current.push(chapter);
        setChapterCount(chaptersRef.current.length);

        // Show first chunk immediately — don't wait for full download
        if (!firstShown) {
          firstShown = true;
          setAllParagraphs(
            chapter.paragraphs.map((r) => ({ raw: r, segments: null, status: 'idle' as const })),
          );
          setFetchStatus('done');
        }
      },
      abortRef.current.signal,
    ).catch((err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      setFetchStatus((prev) => (prev === 'loading' ? 'error' : prev));
    });

    return () => { abortRef.current?.abort(); };
  }, [book, setAllParagraphs]);

  // ── Navigate to chapter ─────────────────────────────────────
  const navigateToChapter = useCallback(
    (idx: number) => {
      const chapter = chaptersRef.current[idx];
      if (!chapter) return;
      engineRef.current!.reset();
      chapterIdxRef.current = idx;
      setCurrentChapterIdx(idx);
      setAllParagraphs(
        chapter.paragraphs.map((r) => ({ raw: r, segments: null, status: 'idle' as const })),
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setAllParagraphs],
  );

  return {
    paragraphs,
    fetchStatus,
    enqueue,
    chapterCount,
    currentChapterIdx,
    navigateToChapter,
    chapterTitles: chaptersRef.current.map((c) => c.title),
  };
}
