# Virtual Try-On

A single-page Next.js app for AI virtual try-on. Upload a photo of a person and a photo of a garment, and an n8n workflow generates an image of the person wearing it.

Built with Next.js 16 (App Router), React 19 and TypeScript.

## Requirements

- Node.js 20.9 or newer. `.nvmrc` pins Node 22, so with nvm run `nvm use`.
- An n8n workflow with a Webhook trigger that:
  - accepts `multipart/form-data` with two files, `image1` (person) and `image2` (clothing)
  - responds with the generated image as binary (`image/jpeg`, `image/png` or `image/webp`)

## Setup

```bash
nvm use
npm install
cp .env.example .env.local
```

Then fill in `.env.local`:

| Variable | Required | Description |
|---|---|---|
| `N8N_WEBHOOK_URL` | Yes | The n8n webhook URL that performs the generation. |
| `N8N_WEBHOOK_SECRET` | No (recommended) | Sent to n8n as the `X-Webhook-Secret` header. Set up Header Auth on the n8n Webhook node with the same name and value, so only this app can call the webhook. |

These are server-only variables. Never prefix them with `NEXT_PUBLIC_`, because that would expose them to the browser. `.env*` files are git-ignored, except `.env.example`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server at http://localhost:3000 |
| `npm run build` | Production build, including the TypeScript check |
| `npm start` | Serve the production build |

## How it works

```
Browser ──POST /api/generate──▶ Next.js route handler ──POST──▶ n8n webhook
        ◀──── image ──────────                        ◀── image ──
```

The browser never talks to n8n directly. `app/api/generate/route.ts` holds the webhook URL and does the following:

- Only accepts requests from the app's own origin.
- Rate-limits each IP to 5 generations per minute.
- Rejects request bodies over about 20 MB, and images over 10 MB each.
- Checks the actual file contents (magic bytes) to confirm each upload is a real JPEG, PNG or WEBP.
- Times out the n8n call after 120 seconds.
- Returns only a real image of 20 MB or less. Error details from n8n are logged on the server and never sent to the client.

The page also sends a per-request nonce Content-Security-Policy (`proxy.ts`) and standard security headers (`next.config.ts`).

## Project structure

```
app/
  api/generate/route.ts   Server proxy to the n8n webhook (validation, rate limit)
  layout.tsx              Fonts and metadata
  page.tsx                Page shell
  globals.css             All styles
components/
  TryOn.tsx               Upload, generate and result UI with its state
  SiteHeader.tsx          Header, navigation and info bar
  Icons.tsx               SVG icons
lib/
  images.ts               Shared upload rules and image-type detection
  rateLimit.ts            In-memory rate limiter
proxy.ts                  Content-Security-Policy
```

## Deployment notes

- Set `N8N_WEBHOOK_URL` (and `N8N_WEBHOOK_SECRET`) in your host's environment settings.
- The rate limiter keeps its counts in memory, so each server instance counts separately. For serverless or multi-instance hosting, back it with a shared store such as Redis or Upstash.
- The rate limit identifies clients by `x-forwarded-for`. That is only trustworthy behind a proxy that sets the header itself, such as Vercel or a properly configured nginx.
- Generation usually takes 10–30 seconds. Make sure your host's function timeout allows at least 120 seconds.
