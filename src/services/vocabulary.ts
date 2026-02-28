import type { TextSegment, VocabularyEntry, VocabularyStore } from '@/types';

const KEY = 'lexis_vocabulary';

export function loadVocabulary(): VocabularyStore {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VocabularyStore) : {};
  } catch {
    return {};
  }
}

function saveVocabulary(store: VocabularyStore): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function recordWords(segments: TextSegment[]): void {
  const store = loadVocabulary();
  const now = Date.now();

  for (const seg of segments) {
    if (seg.lang !== 'pl') continue;
    const key = seg.text.toLowerCase();
    const existing = store[key];
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
    } else {
      store[key] = {
        polishWord: seg.text,
        baseEn: seg.baseEn,
        count: 1,
        firstSeen: now,
        lastSeen: now,
      };
    }
  }

  saveVocabulary(store);
}

export function getVocabulary(): VocabularyEntry[] {
  const store = loadVocabulary();
  return (Object.values(store) as VocabularyEntry[]).sort((a, b) =>
    a.polishWord.localeCompare(b.polishWord, 'pl'),
  );
}

export function clearVocabulary(): void {
  localStorage.removeItem(KEY);
}

/**
 * Returns the top N most-seen words for reinforcement in the prompt.
 * Deduplicates by English base form, keeping the highest-count Polish form.
 * Only includes words seen at least twice.
 */
export function getTopWords(limit = 20): Array<{ en: string; pl: string }> {
  const store = loadVocabulary();
  const byEn = new Map<string, { pl: string; count: number }>();
  for (const entry of Object.values(store) as VocabularyEntry[]) {
    if (!entry.baseEn) continue;
    const existing = byEn.get(entry.baseEn);
    if (!existing || entry.count > existing.count) {
      byEn.set(entry.baseEn, { pl: entry.polishWord, count: entry.count });
    }
  }
  return [...byEn.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([en, v]) => ({ en, pl: v.pl }));
}
