# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

The system default Node is v16, which Next.js 16 does not support. Run `nvm use` first (`.nvmrc` pins Node 22) before any npm/npx command.

- First-time setup: `cp .env.example .env.local`, then set `N8N_WEBHOOK_URL`
- `npm run build` — production build; also runs the TypeScript check (no separate lint or test setup exists)

Testing the API route with curl: it rejects requests without a same-origin `Origin` header (403), so pass one explicitly:

```bash
curl -X POST -H "Origin: http://localhost:3000" http://localhost:3000/api/generate \
  -F image1=@person.jpg -F image2=@garment.jpg -o out.jpg
```

The rate limit is 5 requests per minute per IP and is kept in memory, so restart the server if repeated testing trips it (429).

`/smoke-test` (`.claude/commands/smoke-test.md`) runs the full build-and-verify pass for the security checks. Pass `offline` to skip the real n8n call. `.claude/settings.json` denies reading `.env*` secrets, so ask the user to check env values rather than trying to read them.

User-facing setup and deployment docs are in `README.md`. Keep it in sync when changing env vars, limits or scripts.

## What this is

A single-page Next.js 16 (App Router, React 19, TypeScript) "virtual try-on" frontend. The user uploads a person image and a clothing image. The app POSTs both to an n8n webhook, which returns a generated image.

## Architecture

Request flow: browser (`components/TryOn.tsx`) → `POST /api/generate` (`app/api/generate/route.ts`) → n8n webhook → binary image back the same way.

- **The webhook URL is server-only.** It is read from `N8N_WEBHOOK_URL` in `.env.local` (template: `.env.example`), and the optional `N8N_WEBHOOK_SECRET` is sent as the `X-Webhook-Secret` header. Never give these a `NEXT_PUBLIC_` prefix, and never call n8n from client code.
- `app/api/generate/route.ts` is the security boundary. Keep its checks in place when editing:
  - It requires a same-origin `Origin` header.
  - It applies a per-IP rate limit (`lib/rateLimit.ts`). The limit is in-memory, so it only holds within one instance.
  - It enforces a `Content-Length` cap before parsing.
  - It validates both files, including their magic bytes, and re-sends them to n8n with server-chosen names and types.
  - It enforces an upstream timeout, then sniffs and size-caps the response before returning it.
  - Upstream error details are logged on the server; the client only gets generic `{ error }` JSON.
  - The limits (rate limit, body and response caps, upstream timeout) are constants at the top of the route file. The client timeout in `TryOn.tsx` is deliberately a bit longer than the upstream timeout, so the server's 504 reaches the user first.
- Multipart field names are `image1` (person) and `image2` (clothing). Do not set `Content-Type` manually, because the multipart boundary must be generated automatically.
- `lib/images.ts` holds the shared upload rules (JPEG/PNG/WEBP, 10 MB each). The client uses them for early feedback and the API route uses them for enforcement.
- `proxy.ts` (Next 16's renamed middleware) sets a per-request nonce-based CSP. That only works with dynamic rendering, which is why `app/page.tsx` calls `await connection()`. Don't remove it, and don't add inline scripts or styles or third-party origins without updating the CSP. Static security headers live in `next.config.ts`.

UI and styling rules are in `.claude/rules/styling.md` (they load when you edit UI files).
