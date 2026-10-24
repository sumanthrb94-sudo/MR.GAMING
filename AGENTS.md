# AGENTS.md

Static site, no build. Serve with `node server.js` (port 5173, serves `public/`).

## Where things live
- Customer app = separate screens sharing `public/assets/css/shell.css` (top bar, tab bar, transitions): `/` index.html + home.js, `/book` book.html + book.js, `/birthdays` birthdays.html + birthday.js, `/menu`, `/pass`. `main.js` is the shared core (CONFIG, WhatsApp links, open-now, theme, reveals); `style.css` styles the screens. index.html's head script redirects old one-page anchors (`/#book`, `/?slot=`, `/#birthday`…)
- Online gaming bookings are saved as `booked` (no advance, pay at the venue); only old `pending` holds go stale after 3 h. Max 2 players per console; 3–4 players = Whole room
- `public/menu.html`, `public/assets/css/menu.css`, `public/assets/js/menu.js` — MR. Sandwich menu (QR target)
- `public/assets/js/menu-data.js` — the menu, single source for both pages; live price / sold-out / hidden changes from the console are `menuOverrides` docs applied by `menu-live.js` (ids from `idsFor`/`docIds`)
- MR. Sandwich meal plans — `MENU.mealPlans` in menu-data.js (home, /menu and the flyer compute from it; one meal = a Top Combo at `mealValue`); `MEALS` in admin.js mirrors it; /pass shows them as `type: 'meals'` passes
- `print/` + `scripts/make-qr-card.mjs` — printable QR table card; `print/mr-sandwich-meal-plans.html` + `scripts/make-meal-flyer.mjs` — meal plans flyer
- `brand/` — master logo files (not served)
- `public/admin.html`, `public/assets/js/admin.js`, `public/assets/css/admin.css` — MR. Console, the manager app (Orders with pop-up for new bookings, Schedule, Passes & meal plans, Birthdays, Menu overrides, Stock alerts) (no login form: owners log in on /pass, which sends `/admins` accounts here)
- `public/stock.html`, `public/assets/js/stock.js`, `public/assets/css/stock.css` — MR. Sandwich stock (batches by expiry, first expiry first out; `stockProducts`/`stockBatches`/`stockMoves`). Owners and `/stockStaff` accounts only; /pass sends stock staff here
- `public/pass.html`, `public/assets/js/pass.js` — "My pass": customer sign-in by mobile number, or the owner's link `/pass?id=…` (styles in style.css)
- `public/assets/images/games/` — original game-card artwork (never official game art); cards in index.html `#game-cards`, `data-pick-game` feeds the booking form
- Phones: bottom `.tabbar` (index.html and pass.html), open-now status (`CONFIG.open`/`close` in main.js), `public/manifest.webmanifest` for "Add to Home screen"
- `public/assets/js/book-account.js` — /book's sign-in (via account.js) (number + SMS code inline at step 3) and the booking write (request with `uid` + verified `phone`, plus holds); loaded only from step 2. Bookings need a verified sign-in (firestore.rules)
- Customer accounts: `public/assets/js/profile.js` — welcome form after a first sign-in (no `users/{uid}` yet: full name, email, WhatsApp opt-in), Edit profile, and the account sheet behind the top bar's name (Sign out). main.js labels the bar from the cached `mg-profile` / `mg-auth` (account.js keeps them) and imports profile.js only on tap. Console > Customers lists `users`
- Food ordering on /menu: `public/assets/js/order.js` (+ on each dish, cart bar, checkout / tracking sheet; loaded by menu.js only after the live prices load), `shop.js` (settings/shop, haversine distance, `billMath` GST, financial year), `account.js` (the shared phone + SMS sign-in; book-account.js uses it too). Orders go to `foodOrders/{id}` with their lines repeated as `parts/0..4` (6 lines each) in the same batch so firestore.rules can check every line (1,000-expression limit per document). Delivery free within `settings/shop.freeRadiusKm` of the shop location, none beyond; orders only 11 am–11 pm IST; pay on delivery / at pickup (`payment: {method, status}` is the gateway hook)
- `settings/shop` — shop location (set from the console with the phone's GPS), radius, delivery on/off, GSTIN, legal name, food / gaming GST %, prices exclusive. GST appears on bills only when a GSTIN is set; never compute tax without one
- Bills: `public/assets/js/admin-shop.js` (console food orders, Bill dialog, Bills screen with today's takings + CSV, Settings screen; admin.js passes it its helpers), `public/bill.html` + `bill.js` + `assets/css/bill.css` (public `/bill?id=`, A4 and 80 mm print). `bills/{random id}` numbered `MS-<FY>-0001` from `counters/bills-<FY>` in one transaction; first name only, never a phone; immutable except an owner's void
- `public/assets/js/booking-db.js`, `firebase-config.js`, `public/assets/vendor/firebase-{public,account}.<hash>.js` — Firestore Lite + phone sign-in (bundled SDK; rebuild with `scripts/build-firebase.mjs`, which renames by content hash and updates references — never rename by hand)
- `firestore.rules`, `scripts/firebase_admin.py` — database access rules and one-off admin tasks

## Rules
1. Never invent prices, reviews, ratings, availability, game titles, hours or stats. Missing facts → "ask us on WhatsApp".
2. Never state how many consoles there are. Use "PS5 & Xbox" and "private room".
3. WhatsApp number lives in `CONFIG` (main.js) and `data-wa` links get their `href` from it; keep `href="https://wa.me/917337230311"` as the no-JS fallback.
4. Colours/spacing via CSS variables only. One accent per page.
5. Keep `prefers-reduced-motion` working; drop `filter` after reveals (final state `filter: none`).
6. Never commit a service-account key or print its contents. Public visitors must never be able to read names (`requests` stay owner-only; a signed-in customer may read only requests whose `uid` is theirs — My bookings on /pass). `passCards` carry first name and hours or meals only; keep phones in `passes`. A signed-in customer may read only passes whose `phoneE164` equals their sign-in number.
7. Availability must come from the database. Never show an hour as open when the database didn't answer. Booking urgency (hours left, "Full", "next free", "starts in", the 3-hour hold) must come from the database, the clock or firestore.rules: no viewer counts, fake countdowns or invented scarcity.
8. Escape anything that came from the public form before putting it in HTML (admin.js `esc`).
9. Before committing: screenshot `/` and `/menu` at 390px and 1440px (light + dark for home), check no horizontal overflow and no console errors.
10. Keep every screen under 1 s on 4G: no new third-party scripts or CDNs, no live Firestore listeners (Lite + re-read), images as sized WebP with `loading="lazy"` below the fold, nothing above the fold waiting on JavaScript to become visible.
