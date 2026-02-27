import { useState, useCallback } from 'react';
import { getVocabulary } from '@/services/vocabulary';
import type { VocabularyEntry } from '@/types';

export function useVocabulary() {
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>(getVocabulary);

  const refresh = useCallback(() => {
    setVocabulary(getVocabulary());
  }, []);

  return { vocabulary, refresh };
}
