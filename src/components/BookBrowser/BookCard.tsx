import { useNavigate } from 'react-router-dom';
import { getPlainTextUrl } from '@/services/gutenberg';
import type { GutenbergBook } from '@/types';
import styles from './BookCard.module.css';

interface Props {
  book: GutenbergBook;
}

export function BookCard({ book }: Props) {
  const navigate = useNavigate();
  const hasText = Boolean(getPlainTextUrl(book));
  const coverUrl = book.formats['image/jpeg'];
  const author = book.authors[0]?.name ?? 'Unknown author';

  return (
    <article
      className={`${styles.card} ${!hasText ? styles.unavailable : ''}`}
      onClick={() => hasText && navigate(`/read/${book.id}`)}
      role={hasText ? 'button' : undefined}
      tabIndex={hasText ? 0 : undefined}
      onKeyDown={(e) => {
        if (hasText && (e.key === 'Enter' || e.key === ' ')) navigate(`/read/${book.id}`);
      }}
      aria-label={hasText ? `Read ${book.title}` : `${book.title} — text unavailable`}
    >
      <div className={styles.cover}>
        {coverUrl ? (
          <img src={coverUrl} alt={`Cover of ${book.title}`} loading="lazy" />
        ) : (
          <div className={styles.placeholder}>
            <span>{book.title[0]}</span>
          </div>
        )}
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{book.title}</h3>
        <p className={styles.author}>{author}</p>
        {!hasText && <p className={styles.badge}>Text unavailable</p>}
      </div>
    </article>
  );
}
