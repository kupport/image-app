---
paths:
  - app/globals.css
  - app/layout.tsx
  - app/page.tsx
  - components/**
---

# Styling

The UI must closely match the reference screenshot in the repo root (`Screenshot 2026-10-11 at 12.10.08 PM.png`), a luxury department-store product-listing page. Key traits: white background, uppercase letter-spaced small labels, a black/outlined toolbar block pair, and grey product-style cards.

- All styles live in `app/globals.css` as plain global classes. There are no CSS modules or Tailwind. Colors are tokens on `:root`.
- The header wordmark "ATELIER" is a deliberate neutral placeholder. Do not use the brand shown in the screenshot.
