---
description: Build the app, start it, and verify the /api/generate security checks and a real generation
allowed-tools: Bash
---

Run an end-to-end smoke test of this app. Use Node 22 (`source ~/.nvm/nvm.sh && nvm use`) for every npm/npx command.

1. `npm run build`. Stop and report if it fails.
2. Start `npx next start -p 3123` in the background and wait until `http://localhost:3123` responds.
3. Create test fixtures in the scratchpad directory: a small valid PNG (copy the screenshot in the repo root) and a fake `fake.png` containing plain text.
4. Check and report each result:
   - `GET /` without a session → 307 redirect to `/login`, and `GET /login` → 200. Both include a `Content-Security-Policy` header with a nonce, plus `X-Frame-Options: DENY`.
   - POST to `/api/generate` with no `Origin` header → 403.
   - POST with `Origin: https://evil.example` → 403.
   - POST with `Origin: http://localhost:3123` and no session cookie → 401.
   - The remaining checks need a logged-in session. Ask the user for their `sb-*-auth-token` cookie(s) and pass them with `-b`. If none are provided, skip them and say so.
   - POST with `Origin: http://localhost:3123` and `image1=fake.png` → 400.
   - POST with a missing `image2` → 400.
   - POST with two valid images → 200 with an `image/*` content type (this calls the real n8n webhook and takes about 10–30s; skip it if $ARGUMENTS contains "offline").
   - The webhook host does not appear in `.next/static` (grep for `n8n.cloud`).
5. Stop the server (`pkill -f "next start -p 3123"`).

Keep in mind the rate limit is 5 requests per minute per IP. Restart the server if you hit a 429 before you expect one. Report a pass/fail table.
