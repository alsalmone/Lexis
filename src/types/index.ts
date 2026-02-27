// ── Gutenberg API ───────────────────────────────────────────

export interface GutenbergBook {
  id: number;
  title: string;
  authors: Array<{ name: string; birth_year: number | null; death_year: number | null }>;
  subjects: string[];
  formats: Record<string, string>;
  download_count: number;
}

export interface GutenbergSearchResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutenbergBook[];
}

// ── Chapters ────────────────────────────────────────────────

export interface Chapter {
  title: string;       // e.g. "Chapter I" or "Part One"
  paragraphs: string[];
}

// ── Text processing ─────────────────────────────────────────

export interface TextSegment {
  text: string;
  lang: 'en' | 'pl';
  /** English base/dictionary form — only meaningful when lang === 'pl' */
  baseEn: string;
}

export interface ProcessedParagraph {
  index: number;
  segments: TextSegment[];
  processedAt: number;
}

// ── Vocabulary ──────────────────────────────────────────────

export interface VocabularyEntry {
  polishWord: string;
  baseEn: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

export type VocabularyStore = Record<string, VocabularyEntry>;

// ── Settings ────────────────────────────────────────────────

export interface AppSettings {
  deepseekApiKey: string;
  defaultDensity: number; // 5–50
}

// ── Misc ────────────────────────────────────────────────────

export type ProcessingStatus = 'idle' | 'loading' | 'error' | 'done';
