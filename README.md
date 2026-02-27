# Lexis

A language-learning reader that helps you absorb Polish vocabulary through context. It fetches public-domain books from [Project Gutenberg](https://www.gutenberg.org/) and replaces a configurable percentage of English words with their correct inflected Polish equivalents — inline, as you read.

No hover-to-translate. No flashcards. Just read.

## How it works

1. Search for any English book from Project Gutenberg
2. Open it in the reader
3. As you scroll, paragraphs are processed by the DeepSeek LLM, which substitutes a portion of content words (nouns, verbs, adjectives, adverbs) with grammatically correct Polish forms
4. Polish words appear in amber italics inline with the English text
5. Adjust the **Polish density** slider (5–50%) to control how many words are substituted

Words you encounter are tracked in a vocabulary log, accessible from the Settings page.

## Tech stack

- **React 19 + TypeScript** via Vite
- **react-router-dom v7** for client-side routing
- **DeepSeek API** (`deepseek-chat`) for LLM-powered word substitution
- **Project Gutenberg** via [Gutendex](https://gutendex.com/) (metadata) and corsproxy.io (book text)
- No backend — everything runs in the browser
- Settings and vocabulary stored in `localStorage`; processed paragraphs cached in `sessionStorage`

## Setup

### Prerequisites

- Node.js 18+
- A [DeepSeek API key](https://platform.deepseek.com/)

### Install and run

```bash
git clone https://github.com/alsalmone/Lexis.git
cd Lexis
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), go to **Settings**, and enter your DeepSeek API key.

### Build

```bash
npm run build
```

The output is a static site in `dist/` — deploy anywhere (Vercel, Netlify, GitHub Pages, etc.).

## Notes

- Your API key is stored only in your browser's `localStorage` and is never sent anywhere except directly to the DeepSeek API
- Processing costs are very low — roughly $0.001–0.002 per paragraph at typical density settings
- The app processes paragraphs lazily as you scroll, so you only pay for what you read
