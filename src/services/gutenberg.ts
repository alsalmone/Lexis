import type { GutenbergBook, GutenbergSearchResult, Chapter } from '@/types';

const GUTENDEX = 'https://gutendex.com';

// Matches common chapter/part/section headings at the start of a trimmed line
const CHAPTER_RE =
  /^(chapter|part|book|section|act|scene|prologue|epilogue|introduction|preface|foreword)\b[\s.:IVXLCDM0-9—-]*/i;

// Emit a chunk every N paragraphs during streaming so content appears
// progressively even in books with no chapter headings.
const STREAM_CHUNK_SIZE = 30;

export async function searchBooks(
  query: string,
  page = 1,
): Promise<GutenbergSearchResult> {
  const params = new URLSearchParams({ languages: 'en', page: String(page) });
  if (query.trim()) params.set('search', query.trim());
  const res = await fetch(`${GUTENDEX}/books/?${params}`);
  if (!res.ok) throw new Error(`Gutendex error: ${res.status}`);
  return res.json() as Promise<GutenbergSearchResult>;
}

export function getPlainTextUrl(book: GutenbergBook): string | null {
  return (
    book.formats['text/plain; charset=utf-8'] ??
    book.formats['text/plain; charset=us-ascii'] ??
    book.formats['text/plain'] ??
    null
  );
}

/**
 * Stream a book's text and call `onChapter` progressively.
 *
 * For books with chapter headings: each chapter is emitted as soon as the
 * next heading is encountered.
 *
 * For books without headings: a chunk is emitted every STREAM_CHUNK_SIZE
 * paragraphs so content appears quickly without waiting for a full download.
 */
export async function streamBookChapters(
  book: GutenbergBook,
  onChapter: (chapter: Chapter, index: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const rawUrl = getPlainTextUrl(book);
  if (!rawUrl) throw new Error('No plain text format available for this book.');

  const canonicalUrl = rawUrl.replace(/^http:\/\//, 'https://');
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(canonicalUrl)}`;

  const res = await fetch(proxyUrl, { signal });
  if (!res.ok || !res.body) throw new Error(`Fetch failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let inBook = false;
  let chapterIndex = 0;
  let currentTitle = '';
  let currentParagraphs: string[] = [];
  let pendingLine = '';

  const emitChunk = (title: string, paragraphs: string[]) => {
    if (paragraphs.length === 0) return;
    onChapter({ title, paragraphs }, chapterIndex);
    chapterIndex++;
  };

  const flushParagraph = () => {
    const p = pendingLine.replace(/  +/g, ' ').trim();
    pendingLine = '';
    if (p.length <= 15) return; // skip page numbers, headings echoed as short lines, etc.
    currentParagraphs.push(p);

    // Emit progressively — don't wait for a chapter heading that may never come
    if (currentParagraphs.length >= STREAM_CHUNK_SIZE) {
      const title = currentTitle || `Part ${chapterIndex + 1}`;
      emitChunk(title, [...currentParagraphs]);
      currentParagraphs = [];
      currentTitle = ''; // consumed
    }
  };

  const flushChapterBoundary = (newTitle: string) => {
    flushParagraph();
    if (currentParagraphs.length > 0) {
      emitChunk(currentTitle || `Part ${chapterIndex + 1}`, [...currentParagraphs]);
      currentParagraphs = [];
    }
    currentTitle = newTitle;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const newlineIdx = buffer.lastIndexOf('\n');
      if (newlineIdx === -1) continue;

      const complete = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);

      for (const raw of complete.split('\n')) {
        const line = raw.trimEnd();

        if (!inBook) {
          if (/\*{3}\s*START OF/i.test(line)) inBook = true;
          continue;
        }

        if (/\*{3}\s*END OF/i.test(line)) {
          flushParagraph();
          if (currentParagraphs.length > 0) {
            emitChunk(currentTitle || `Part ${chapterIndex + 1}`, [...currentParagraphs]);
          }
          return;
        }

        const trimmed = line.trim();

        if (trimmed === '') {
          flushParagraph();
          continue;
        }

        // Chapter heading: short line matching the pattern, no trailing comma
        if (
          CHAPTER_RE.test(trimmed) &&
          trimmed.length < 80 &&
          !trimmed.endsWith(',')
        ) {
          flushChapterBoundary(trimmed);
          continue;
        }

        pendingLine += (pendingLine ? ' ' : '') + trimmed;
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Flush remainder
  flushParagraph();
  if (currentParagraphs.length > 0) {
    emitChunk(currentTitle || `Part ${chapterIndex + 1}`, [...currentParagraphs]);
  }
}
