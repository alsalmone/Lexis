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

For each word you replace:
- Write the actual Polish word in the "text" field — NEVER keep the English word.
- Choose the inflected form correct in context (case, gender, number, tense).

Never replace: proper nouns, numbers, punctuation, function words (the, a, an, of, to, that, which, was, is, are, be, been, by, with, at, from, in, on, for, and, but, or, not), dialogue attribution words (said, asked, replied), words inside quoted speech.

Return only valid JSON, no markdown fences.

Example — input: "The dog runs fast."
{"segments":[{"text":"The ","lang":"en","baseEn":""},{"text":"pies","lang":"pl","baseEn":"dog"},{"text":" ","lang":"en","baseEn":""},{"text":"biegnie","lang":"pl","baseEn":"run"},{"text":" fast.","lang":"en","baseEn":""}]}`;

function buildMessages(paragraphText: string, density: number) {
  const user = `Replace approximately ${density}% of content words (nouns, verbs, adjectives, adverbs) with Polish equivalents.

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
): Promise<DeepSeekResponse> {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: buildMessages(paragraphText, density),
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
): Promise<TextSegment[]> {
  const fallback: TextSegment[] = [{ text: paragraphText, lang: 'en', baseEn: '' }];

  // Trim very long paragraphs to avoid context overflow
  const text =
    paragraphText.length > MAX_PARA_CHARS
      ? paragraphText.slice(0, MAX_PARA_CHARS)
      : paragraphText;

  const attempt = async (): Promise<TextSegment[]> => {
    const response = await callDeepSeek(text, density, apiKey);
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
