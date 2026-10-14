# Virtual Try-On

A Next.js app for AI virtual try-on. Users sign up with their name, email and password (Supabase Auth), subscribe for $9.99/month (Stripe), then upload a photo of a person and a photo of a garment, and an n8n workflow generates an image of the person wearing it.

Built with Next.js 16 (App Router), React 19 and TypeScript.

## Requirements

- Node.js 20.9 or newer. `.nvmrc` pins Node 22, so with nvm run `nvm use`.
- A Supabase project (for accounts). See [Supabase setup](#supabase-setup).
- A Stripe account (for the subscription). See [Stripe setup](#stripe-setup).
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
| `SUPABASE_URL` | Yes | The Supabase project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | The Supabase publishable key (`sb_publishable_…`). |
| `N8N_WEBHOOK_SECRET` | No (recommended) | Sent to n8n as the `X-Webhook-Secret` header. Set up Header Auth on the n8n Webhook node with the same name and value, so only this app can call the webhook. |
| `STRIPE_PAYMENT_LINK_URL` | Yes | The Stripe Payment Link for the subscription (`https://buy.stripe.com/…`). |
| `STRIPE_CUSTOMER_PORTAL_URL` | No (recommended) | The Stripe customer portal login link (`https://billing.stripe.com/p/login/…`), shown as "Subscription" in the header. |

These are server-only variables: the browser never talks to Supabase or n8n directly. The app needs no Supabase service role key or Stripe API key. Never prefix them with `NEXT_PUBLIC_`, because that would expose them to the browser. `.env*` files are git-ignored, except `.env.example`.

## Supabase setup

The database migration (`create_profiles`) has been applied to the project. It creates a `public.profiles` table (`id`, `full_name`) with row-level security, and a trigger that fills it from the name given at sign-up.

In the Supabase dashboard:

1. **Authentication → URL Configuration**:
   - Set **Site URL** to your production domain, e.g. `https://your-app.vercel.app`.
   - Add **Redirect URLs** `http://localhost:3000/**` and, for preview deployments, `https://*-<your-team>.vercel.app/**`.
2. **Authentication → Email Templates → Confirm signup**: change the link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
3. Keep **Confirm email** turned on (the default). New users must click the email link before they can log in.
4. Recommended: set up custom SMTP. Supabase's built-in mailer only sends a few emails per hour.

A second migration (`create_subscriptions`) creates `public.subscriptions`, which mirrors each user's Stripe subscription (`status`, `current_period_end`, `cancel_at_period_end`, Stripe ids). Users can read only their own rows and cannot write any. Only the `stripe-webhook` Edge Function writes, using the service role key that Supabase provides to Edge Functions automatically.

## Stripe setup

The sandbox is already set up: product "Virtual Try-On subscription" at $9.99/month, a Payment Link, a customer portal, and a webhook endpoint. To set it up again, for example in live mode:

1. **Product:** create a recurring price of $9.99 per month.
2. **Payment Link:** create one for that price. After payment, redirect to `https://<your-domain>/pay?status=success`. Put its URL in `STRIPE_PAYMENT_LINK_URL`.
3. **Customer portal** (Settings → Billing → Customer portal): allow cancelling and updating the payment method, set the return URL to `https://<your-domain>/`, and enable the login link. Put the login link in `STRIPE_CUSTOMER_PORTAL_URL`.
4. **Webhook endpoint:** `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`, for the events `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`.
5. **Restricted API key** with **Subscriptions: Read** only.
6. **Supabase → Edge Functions → Secrets:**

   | Secret | Value |
   |---|---|
   | `STRIPE_WEBHOOK_SECRET` | The webhook endpoint's signing secret (`whsec_…`) |
   | `STRIPE_PAYMENT_LINK_ID` | The Payment Link id (`plink_…`). Checkouts from other links are ignored. |
   | `STRIPE_API_KEY` | The restricted key (`rk_…`) |

The function source is in `supabase/functions/stripe-webhook/index.ts`. Deploy it with JWT verification turned off, because Stripe authenticates with its signature instead: `supabase functions deploy stripe-webhook --no-verify-jwt`.

Test payments in the sandbox use card `4242 4242 4242 4242`, any future expiry and any CVC.

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

All pages except `/login`, `/signup` and `/auth/confirm` require a signed-in user. `proxy.ts` refreshes the Supabase session cookie and redirects signed-out visitors to `/login`. Sign-up, login and logout are Server Actions in `app/auth/actions.ts`, and they are rate-limited per IP.

### Subscription

```
/pay ──Payment Link (?client_reference_id=<user id>)──▶ Stripe Checkout
Stripe ──webhook──▶ Supabase Edge Function stripe-webhook ──▶ public.subscriptions
```

1. A signed-in user without an active subscription is sent from `/` to `/pay`, which links to the Payment Link with their user id and email.
2. After payment, the webhook function checks the Stripe signature, fetches the subscription's current state from Stripe, and saves it for that user. Stripe sends the user back to `/pay?status=success`, which reloads every 3 seconds until the subscription shows up, then continues to `/`.
3. Renewals, failed payments and cancellations reach the same function as subscription updates or deletions, and it updates the row.

A user has access while a subscription has status `active` or `trialing` and its paid period hasn't ended (with a 1-day grace for late renewal webhooks). Any other status (`past_due`, `unpaid`, `canceled` and so on) sends them back to `/pay`. If they cancel through the portal, access lasts until the end of the period they paid for. How long a failed renewal stays `past_due` before Stripe cancels it is set in Stripe's retry settings, but access stops as soon as a renewal fails.

### Generation

The browser never talks to n8n directly. `app/api/generate/route.ts` holds the webhook URL and does the following:

- Only accepts requests from the app's own origin.
- Requires a signed-in user (otherwise 401).
- Requires an active subscription (otherwise 402).
- Rate-limits each IP to 5 generations per minute.
- Rejects request bodies over about 20 MB, and images over 10 MB each.
- Checks the actual file contents (magic bytes) to confirm each upload is a real JPEG, PNG or WEBP.
- Times out the n8n call after 120 seconds.
- Returns only a real image of 20 MB or less. Error details from n8n are logged on the server and never sent to the client.

The page also sends a per-request nonce Content-Security-Policy (`proxy.ts`) and standard security headers (`next.config.ts`).

## Project structure

```
app/
  api/generate/route.ts   Server proxy to the n8n webhook (auth, validation, rate limit)
  auth/actions.ts         Sign-up, login and logout Server Actions
  auth/confirm/route.ts   Email confirmation link handler
  login/, signup/         Auth pages
  pay/page.tsx            Subscription paywall
  layout.tsx              Fonts and metadata
  page.tsx                Page shell
  globals.css             All styles
components/
  TryOn.tsx               Upload, generate and result UI with its state
  SiteHeader.tsx          Header, navigation, account and info bar
  AuthForm.tsx            Login and sign-up form
  Icons.tsx               SVG icons
lib/
  images.ts               Shared upload rules and image-type detection
  rateLimit.ts            In-memory rate limiter
  clientIp.ts             Client IP from proxy headers
  supabase/server.ts      Server-side Supabase client (cookie session)
  access.ts               Subscription access check
proxy.ts                  Content-Security-Policy, session refresh and login redirect
supabase/functions/
  stripe-webhook/         Edge Function syncing Stripe subscriptions (Deno, excluded from the Next build)
```

## Deployment notes

- Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `N8N_WEBHOOK_URL`, `STRIPE_PAYMENT_LINK_URL` and `STRIPE_CUSTOMER_PORTAL_URL` (and `N8N_WEBHOOK_SECRET`) in your host's environment settings. On Vercel, add them for Production and Preview, then redeploy.
- The sandbox Payment Link redirects to `https://image-app-gray.vercel.app/pay?status=success`, and the portal returns to `https://image-app-gray.vercel.app/`. Change both if the production domain changes.
- Going live: repeat [Stripe setup](#stripe-setup) in live mode, then update the three Edge Function secrets and the two `STRIPE_*` variables.
- The rate limiter keeps its counts in memory, so each server instance counts separately. For serverless or multi-instance hosting, back it with a shared store such as Redis or Upstash.
- The rate limit identifies clients by `x-forwarded-for`. That is only trustworthy behind a proxy that sets the header itself, such as Vercel or a properly configured nginx.
- Generation usually takes 10–30 seconds. Make sure your host's function timeout allows at least 120 seconds.
