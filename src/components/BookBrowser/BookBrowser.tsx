import { useState, useEffect, useRef } from 'react';
import { searchBooks } from '@/services/gutenberg';
import type { GutenbergBook } from '@/types';
import { BookCard } from './BookCard';
import styles from './BookBrowser.module.css';

export function BookBrowser() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [books, setBooks] = useState<GutenbergBook[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      doSearch(query, 1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    doSearch(query, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function doSearch(q: string, p: number) {
    setLoading(true);
    setError('');
    try {
      const result = await searchBooks(q, p);
      setBooks(result.results);
      setTotal(result.count);
      setHasNext(Boolean(result.next));
      setHasPrev(Boolean(result.previous));
    } catch {
      setError('Failed to load books. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Find a book</h1>
        <p className={styles.sub}>
          Browse free classics from Project Gutenberg
        </p>
        <input
          className={`input ${styles.search}`}
          type="search"
          placeholder="Search by title or author…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      ) : (
        <>
          {total > 0 && (
            <p className={styles.count}>
              {total.toLocaleString()} book{total !== 1 ? 's' : ''} found
            </p>
          )}
          <div className={styles.grid}>
            {books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </>
      )}

      {(hasPrev || hasNext) && (
        <div className={styles.pagination}>
          <button
            className="btn"
            onClick={() => setPage((p) => p - 1)}
            disabled={!hasPrev}
          >
            ← Previous
          </button>
          <span className={styles.pageNum}>Page {page}</span>
          <button
            className="btn"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
