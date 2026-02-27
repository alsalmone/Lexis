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
