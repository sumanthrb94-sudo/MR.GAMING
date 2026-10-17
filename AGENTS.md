# AGENTS.md

Static site, no build. Serve with `node server.js` (port 5173, serves `public/`).

## Where things live
- `public/index.html`, `public/assets/css/style.css`, `public/assets/js/main.js` — MR. GAMING home
- `public/menu.html`, `public/assets/css/menu.css`, `public/assets/js/menu.js` — MR. Sandwich menu (QR target)
- `public/assets/js/menu-data.js` — the menu, single source for both pages
- `print/` + `scripts/make-qr-card.mjs` — printable QR table card
- `brand/` — master logo files (not served)

## Rules
1. Never invent prices, reviews, ratings, availability, game titles, hours or stats. Missing facts → "ask us on WhatsApp".
2. Never state how many consoles there are. Use "PS5 & Xbox" and "private room".
3. WhatsApp number lives in `CONFIG` (main.js) and `data-wa` links get their `href` from it; keep `href="https://wa.me/917337230311"` as the no-JS fallback.
4. Colours/spacing via CSS variables only. One accent per page.
5. Keep `prefers-reduced-motion` working; drop `filter` after reveals (final state `filter: none`).
6. Before committing: screenshot `/` and `/menu` at 390px and 1440px (light + dark for home), check no horizontal overflow and no console errors.
