import type { TextSegment } from '@/types';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
/** Approx token limit per paragraph chunk (~600 words) */
const MAX_PARA_CHARS = 3000;

interface DeepSeekResponse {
  segments: TextSegment[];
}

function buildMessages(paragraphText: string, density: number) {
  const system = `You are a language-learning text processor. Your task is to substitute actual Polish words into an English paragraph.

For approximately ${density}% of content words (nouns, verbs, adjectives, adverbs), you MUST:
1. REMOVE the English word entirely
2. WRITE the actual Polish word/inflected form in its place

The "text" field for a Polish segment must contain a real Polish word written in Polish — never the original English word.

Rules:
- Only replace content words. Never replace: proper nouns, numbers, punctuation, function words (the, a, an, of, to, that, which, was, is, are, be, been, by, with, at, from, in, on, for, and, but, or, not, etc.), dialogue attribution words (said, asked, replied), or words inside quoted speech.
- Choose the inflected Polish form correct in context (correct case, gender, number, tense).
- Do not add spaces around substituted words beyond what was in the original.
- Return only valid JSON with no markdown fences.
- Each segment must have a maximum of 5 words. (Modified by Oscar)

CORRECT example — input: "The dog runs fast."
{"segments":[{"text":"The ","lang":"en","baseEn":""},{"text":"pies","lang":"pl","baseEn":"dog"},{"text":" ","lang":"en","baseEn":""},{"text":"biegnie","lang":"pl","baseEn":"run"},{"text":" fast.","lang":"en","baseEn":""}]}

WRONG example (do NOT do this — English words kept in pl segments):
{"segments":[{"text":"The ","lang":"en","baseEn":""},{"text":"dog","lang":"pl","baseEn":"dog"},{"text":" ","lang":"en","baseEn":""},{"text":"runs","lang":"pl","baseEn":"run"},{"text":" fast.","lang":"en","baseEn":""}]}`;

  const user = `Replace approximately ${density}% of content words in the paragraph below with actual Polish words. Write the Polish word in the "text" field — not the English word.

Return a JSON object: { "segments": [ { "text": string, "lang": "en" | "pl", "baseEn": string } ] }
- "baseEn" is the English base form for Polish segments (e.g. "dog"); empty string for English segments.
- For English segments, "text" is copied verbatim from the original (preserving spaces and punctuation).
- For Polish segments, "text" is the actual Polish word/phrase replacing the English word.
- The English segments must together preserve all spacing and punctuation from the original.

Paragraph:
"""
${paragraphText}
"""`;

  return [
    { role: 'system', content: system },
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
  console.log('[DeepSeek raw response]', content.slice(0, 500));
  console.log('[DeepSeek raw response]', content.slice(0, 2000)); // Added by Oscar for debugging longer responses
  const parsed = JSON.parse(content) as DeepSeekResponse;
  console.log('[DeepSeek segments]', parsed?.segments?.slice(0, 5));
  return parsed;
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
      console.error('[DeepSeek] validation failed, segments:', response.segments);
      throw new Error('Invalid segments from DeepSeek');
    }
    return response.segments;
  };

  try {
    return await attempt();
  } catch (err) {
    console.error('[DeepSeek] attempt 1 failed:', err);
    // One retry after 2 s
    await new Promise((r) => setTimeout(r, 2000));
    try {
      return await attempt();
    } catch (err2) {
      console.error('[DeepSeek] attempt 2 failed, using fallback:', err2);
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
