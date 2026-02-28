import type { TextSegment } from '@/types';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
/** Approx token limit per paragraph chunk (~600 words) */
const MAX_PARA_CHARS = 3000;

interface DeepSeekResponse {
  segments: TextSegment[];
}

// Static system prompt — never changes, so DeepSeek can prefix-cache it
// across all requests in a session (cached tokens process ~10× faster).
const SYSTEM_PROMPT = `You are a language-learning text processor. Substitute Polish words into English paragraphs.

Word selection guidelines:
- Prefer high-frequency, common everyday vocabulary (CEFR A1–B2 level) over rare, literary, or uncommon words. Prioritise words a beginner would encounter most often.
- You MAY replace common function words in addition to content words:
  Prepositions: in→w, on→na, to→do, from→z/od, for→dla, through→przez, after→po, about→o, without→bez, before→przed
  Conjunctions: but→ale, that→że, because→bo, so→więc, or→lub
- Never replace: proper nouns, numbers, punctuation, dialogue attribution words (said, asked, replied), words inside quoted speech.

For each word you replace:
- Write the actual Polish word in the "text" field — NEVER keep the English word in a "pl" segment.
- Choose the inflected form correct in context (case, gender, number, tense).

Return only valid JSON, no markdown fences.

Example — input: "The dog runs fast."
{"segments":[{"text":"The ","lang":"en","baseEn":""},{"text":"pies","lang":"pl","baseEn":"dog"},{"text":" ","lang":"en","baseEn":""},{"text":"biegnie","lang":"pl","baseEn":"run"},{"text":" fast.","lang":"en","baseEn":""}]}`;

function buildMessages(
  paragraphText: string,
  density: number,
  reinforceWords: Array<{ en: string; pl: string }>,
) {
  const reinforceLine = reinforceWords.length > 0
    ? `Reinforce list — always replace these English words with the given Polish equivalents whenever they appear: ${reinforceWords.map((w) => `${w.en}→${w.pl}`).join(', ')}\n\n`
    : '';

  const user = `${reinforceLine}Replace approximately ${density}% of words (prioritising common vocabulary and function words from the guidelines) with Polish equivalents.

Return JSON: {"segments":[{"text":string,"lang":"en"|"pl","baseEn":string}]}
- "pl" segments: "text" = the Polish word, "baseEn" = English base form.
- "en" segments: "text" copied verbatim from original; "baseEn" = "".

Paragraph:
"""
${paragraphText}
"""`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

async function callDeepSeek(
  paragraphText: string,
  density: number,
  apiKey: string,
  reinforceWords: Array<{ en: string; pl: string }>,
): Promise<DeepSeekResponse> {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: buildMessages(paragraphText, density, reinforceWords),
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DeepSeek API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  return JSON.parse(content) as DeepSeekResponse;
}

function validateSegments(
  segments: unknown,
  _original: string,
): segments is TextSegment[] {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  for (const s of segments) {
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof s.text !== 'string' ||
      (s.lang !== 'en' && s.lang !== 'pl')
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Send a paragraph to DeepSeek and return the processed segments.
 * Falls back to a single English segment on unrecoverable failure.
 */
export async function processChunk(
  paragraphText: string,
  density: number,
  apiKey: string,
  reinforceWords: Array<{ en: string; pl: string }> = [],
): Promise<TextSegment[]> {
  const fallback: TextSegment[] = [{ text: paragraphText, lang: 'en', baseEn: '' }];

  // Trim very long paragraphs to avoid context overflow
  const text =
    paragraphText.length > MAX_PARA_CHARS
      ? paragraphText.slice(0, MAX_PARA_CHARS)
      : paragraphText;

  const attempt = async (): Promise<TextSegment[]> => {
    const response = await callDeepSeek(text, density, apiKey, reinforceWords);
    if (!validateSegments(response.segments, text)) {
      throw new Error('Invalid segments from DeepSeek');
    }
    return response.segments;
  };

  try {
    return await attempt();
  } catch {
    // One retry after 1 s
    await new Promise((r) => setTimeout(r, 1000));
    try {
      return await attempt();
    } catch {
      return fallback;
    }
  }
}

/** Minimal connectivity test — sends a tiny paragraph at 10% density. */
export async function testConnection(apiKey: string): Promise<void> {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: 'Reply with valid JSON: {"ok":true}' }],
      response_format: { type: 'json_object' },
      max_tokens: 20,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body}`);
  }
}
