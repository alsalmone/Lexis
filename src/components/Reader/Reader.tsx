import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSettings } from '@/hooks/useSettings';
import { useBookReader } from '@/hooks/useBookReader';
import type { GutenbergBook } from '@/types';
import { DensityControl } from './DensityControl';
import { TextRenderer } from './TextRenderer';
import styles from './Reader.module.css';

export function Reader() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();

  const [density, setDensity] = useState(settings.defaultDensity);
  const [debouncedDensity, setDebouncedDensity] = useState(settings.defaultDensity);
  const [book, setBook] = useState<GutenbergBook | null>(null);
  const [bookError, setBookError] = useState('');

  const {
    paragraphs,
    fetchStatus,
    enqueue,
    chapterCount,
    currentChapterIdx,
    navigateToChapter,
    chapterTitles,
  } = useBookReader(book, debouncedDensity, settings.deepseekApiKey);

  // Fetch book metadata from gutendex
  useEffect(() => {
    if (!bookId) return;
    fetch(`https://gutendex.com/books/${bookId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Book not found');
        return r.json();
      })
      .then((data: GutenbergBook) => setBook(data))
      .catch(() => setBookError('Could not load book metadata.'));
  }, [bookId]);

  // Debounce density slider (1 s) before triggering re-processing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDensity(density), 1000);
    return () => clearTimeout(t);
  }, [density]);

  // IntersectionObserver: lazily process paragraphs as they scroll into view
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRefs = useRef<Map<number, HTMLElement>>(new Map());

  const registerSentinel = useCallback((idx: number, el: HTMLElement | null) => {
    if (el) {
      sentinelRefs.current.set(idx, el);
      observerRef.current?.observe(el);
    } else {
      const existing = sentinelRefs.current.get(idx);
      if (existing) observerRef.current?.unobserve(existing);
      sentinelRefs.current.delete(idx);
    }
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.idx);
          if (!isNaN(idx)) {
            enqueue(idx);
            enqueue(idx + 1);
            enqueue(idx + 2);
          }
        }
      },
      { rootMargin: '200px 0px' },
    );
    sentinelRefs.current.forEach((el) => observerRef.current!.observe(el));
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [enqueue]);

  if (!settings.deepseekApiKey) {
    return (
      <div className={styles.gate}>
        <p>You need a DeepSeek API key to use the reader.</p>
        <button className="btn btn-primary" onClick={() => navigate('/settings')}>
          Go to settings
        </button>
      </div>
    );
  }

  if (bookError) {
    return (
      <div className={styles.gate}>
        <p>{bookError}</p>
        <button className="btn" onClick={() => navigate('/')}>Back to library</button>
      </div>
    );
  }

  const author = book?.authors[0]?.name ?? '';
  const hasPrev = currentChapterIdx > 0;
  const hasNext = currentChapterIdx < chapterCount - 1;

  return (
    <div className={styles.page}>
      {/* Sticky bar: density slider + chapter nav */}
      <div className={styles.stickyBar}>
        <DensityControl density={density} onChange={setDensity} />
        {chapterCount > 1 && (
          <div className={styles.chapterNav}>
            <button
              className="btn btn-ghost"
              onClick={() => navigateToChapter(currentChapterIdx - 1)}
              disabled={!hasPrev}
              aria-label="Previous chapter"
            >
              ←
            </button>
            <span className={styles.chapterLabel}>
              {chapterTitles[currentChapterIdx] ?? `Chapter ${currentChapterIdx + 1}`}
              <span className={styles.chapterCount}> {currentChapterIdx + 1} / {chapterCount}</span>
            </span>
            <button
              className="btn btn-ghost"
              onClick={() => navigateToChapter(currentChapterIdx + 1)}
              disabled={!hasNext}
              aria-label="Next chapter"
            >
              →
            </button>
          </div>
        )}
      </div>

      <article className={styles.article}>
        {book && currentChapterIdx === 0 && (
          <header className={styles.bookHeader}>
            <h1 className={styles.bookTitle}>{book.title}</h1>
            {author && <p className={styles.bookAuthor}>{author}</p>}
          </header>
        )}

        {fetchStatus === 'loading' && paragraphs.length === 0 && (
          <p className={`${styles.status} shimmer`}>Loading book…</p>
        )}
        {fetchStatus === 'error' && paragraphs.length === 0 && (
          <p className={styles.statusError}>Failed to load book text.</p>
        )}

        {paragraphs.map((para, idx) => (
          <section
            key={`${currentChapterIdx}-${idx}`}
            className={styles.para}
            ref={(el) => registerSentinel(idx, el)}
            data-idx={idx}
          >
            {para.status === 'done' && para.segments ? (
              <TextRenderer segments={para.segments} />
            ) : (
              <p className={`reading-text ${para.status === 'loading' ? 'shimmer' : ''}`}>
                {para.raw}
              </p>
            )}
          </section>
        ))}

        {/* Chapter navigation at bottom of content */}
        {chapterCount > 1 && paragraphs.length > 0 && (
          <div className={styles.bottomNav}>
            <button
              className="btn"
              onClick={() => navigateToChapter(currentChapterIdx - 1)}
              disabled={!hasPrev}
            >
              ← Previous chapter
            </button>
            <button
              className="btn"
              onClick={() => navigateToChapter(currentChapterIdx + 1)}
              disabled={!hasNext}
            >
              Next chapter →
            </button>
          </div>
        )}
      </article>
    </div>
  );
}
