# AGENTS.md

Static site, no build. Serve with `node server.js` (port 5173, serves `public/`).

## Where things live
- `public/index.html`, `public/assets/css/style.css`, `public/assets/js/main.js` — MR. GAMING home
- `public/menu.html`, `public/assets/css/menu.css`, `public/assets/js/menu.js` — MR. Sandwich menu (QR target)
- `public/assets/js/menu-data.js` — the menu, single source for both pages
- MR. Sandwich meal plans — `MENU.mealPlans` in menu-data.js (home, /menu and the flyer compute from it; one meal = a Top Combo at `mealValue`); `MEALS` in admin.js mirrors it; /pass shows them as `type: 'meals'` passes
- `print/` + `scripts/make-qr-card.mjs` — printable QR table card; `print/mr-sandwich-meal-plans.html` + `scripts/make-meal-flyer.mjs` — meal plans flyer
- `brand/` — master logo files (not served)
- `public/admin.html`, `public/assets/js/admin.js`, `public/assets/css/admin.css` — owner page (no login form: owners log in on /pass, which sends `/admins` accounts here)
- `public/pass.html`, `public/assets/js/pass.js` — "My pass": customer sign-in by mobile number, or the owner's link `/pass?id=…` (styles in style.css)
- `public/assets/images/games/` — original game-card artwork (never official game art); cards in index.html `#game-cards`, `data-pick-game` feeds the booking form
- Phones: bottom `.tabbar` (index.html and pass.html), open-now status (`CONFIG.open`/`close` in main.js), `public/manifest.webmanifest` for "Add to Home screen"
- `public/assets/js/booking-db.js`, `firebase-config.js`, `public/assets/vendor/firebase-{public,account}.<hash>.js` — Firestore Lite + phone sign-in (bundled SDK; rebuild with `scripts/build-firebase.mjs`, which renames by content hash and updates references — never rename by hand)
- `firestore.rules`, `scripts/firebase_admin.py` — database access rules and one-off admin tasks

## Rules
1. Never invent prices, reviews, ratings, availability, game titles, hours or stats. Missing facts → "ask us on WhatsApp".
2. Never state how many consoles there are. Use "PS5 & Xbox" and "private room".
3. WhatsApp number lives in `CONFIG` (main.js) and `data-wa` links get their `href` from it; keep `href="https://wa.me/917337230311"` as the no-JS fallback.
4. Colours/spacing via CSS variables only. One accent per page.
5. Keep `prefers-reduced-motion` working; drop `filter` after reveals (final state `filter: none`).
6. Never commit a service-account key or print its contents. Public visitors must never be able to read names (`requests` stay owner-only). `passCards` carry first name and hours or meals only; keep phones in `passes`. A signed-in customer may read only passes whose `phoneE164` equals their sign-in number.
7. Availability must come from the database. Never show an hour as open when the database didn't answer. Booking urgency (hours left, "Full", "next free", "starts in", the 3-hour hold) must come from the database, the clock or firestore.rules: no viewer counts, fake countdowns or invented scarcity.
8. Escape anything that came from the public form before putting it in HTML (admin.js `esc`).
9. Before committing: screenshot `/` and `/menu` at 390px and 1440px (light + dark for home), check no horizontal overflow and no console errors.
10. Keep every screen under 1 s on 4G: no new third-party scripts or CDNs, no live Firestore listeners (Lite + re-read), images as sized WebP with `loading="lazy"` below the fold, nothing above the fold waiting on JavaScript to become visible.
