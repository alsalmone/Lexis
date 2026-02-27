import type { TextSegment } from '@/types';

interface Props {
  segments: TextSegment[];
}

export function TextRenderer({ segments }: Props) {
  return (
    <p className="reading-text">
      {segments.map((seg, i) =>
        seg.lang === 'pl' ? (
          <span key={i} className="polish">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}
