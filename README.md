# MR. GAMING · Gachibowli

Website for **MR. GAMING**, a private PS5 & Xbox gaming room inside **MR. Sandwich (100% pure veg)**, 110, My Home Vihanga Rd, Gachibowli, Hyderabad 500032.

Live: https://mr-gaming-rho.vercel.app · Menu: https://mr-gaming-rho.vercel.app/menu

Visitors do one thing here: **book on WhatsApp** (+91 73372 30311). The food menu page is what the table QR code opens.

## What's in it

| Page | File | Look |
|---|---|---|
| Home | `public/index.html` | MR. GAMING: near-black, one lime accent from the logo, Archivo (wide/black for headlines), light + dark mode |
| Food menu | `public/menu.html` | MR. Sandwich "The Hungry Times" newspaper style from the printed menu: cream paper, double rules, Playfair, blackletter masthead, logo yellow |
| My pass | `public/pass.html` | Customers sign in with their mobile number + SMS code and see every pass on that number (hours left, valid till), or open the link the owner sends. Linked from the header ("My pass"), the prices section and the footer. Not indexed. |
| Owner | `public/admin.html` | "Owner login" in the footer. Not indexed |
| 404 | `public/404.html` | |

Home sections: hero → stations (PS5 / Xbox) + installed games → prices → availability board + booking request → birthday package → food highlights → FIFA Cup waitlist → visit.

**Pricing:** per console per hour, solo ₹199, duo (2 players on one console) ₹320. Squad room adds up both consoles: 2 players ₹398, 3 ₹519, 4 ₹640 (min 2 hours). Passes, 6 hours within 30 days: solo ₹899, duo ₹1,499. 10% off food for console bookers.

**Birthday package** (from the owner's flyer): 3 hours, ₹600 per child and ₹299 per adult, food included per child (2 pizza slices, 1 snack of choice, French fries, 1 scoop of ice cream), PS5 & Xbox, board games. Minimum 10 guests; adults are welcome at ₹299 each and count towards the 10. Up to 15 guests get the game room to themselves; more than 15 get the whole restaurant. ₹3,000 refundable advance to book; a refund depends on filling the slot from the game room waitlist. The owner's flyer (real photos from the venue) is shown in the section (`public/assets/images/birthday-flyer*`). The planner (`#birthday`) takes children and adults (at least 10 in total), date, time (ends by 11 pm) and name, shows the space, children × ₹600 + adults × ₹299 and the advance, and sends the enquiry on WhatsApp. Once agreed, the owner adds it on /admin with "Add a booking" → Birthday party (children and adults, 3 hours fixed), which holds both consoles so the website shows the game room booked. The menu page links to it.

**Availability:** the Book section opens with a live board, PS5 and Xbox by hour for any of the next 7 days. Booked hours (website requests, the owner's phone / walk-in bookings, blocked hours) show as Booked; tapping an open hour fills the form. It re-reads every minute and when the tab comes back. If the database can't be reached it says so instead of showing anything as open.

**Booking:** the visitor picks console, players, length, pay with (hourly / buy a pass / use my pass), day (next 7 days), start time (11 am–11 pm, past times hidden, Indian time), game and food, then a name. Times already held are crossed out. "Request on WhatsApp" saves the request and holds those hours in Firestore, then opens WhatsApp with a request ID and an itemised bill. If Firestore can't be reached, the request still goes to WhatsApp (just without holding the slot).

**Owner page** (`/admin`, footer "Owner login", not indexed): sign in with mobile number + SMS code. **Upcoming** lists every live booking from today on, all days. Pick a day (chips for the next week, or any date) to see its requests and confirm / mark done / no-show / cancel (cancel frees the hours). **Add a booking** records phone and walk-in bookings, confirmed straight away, and refuses an hour that's already taken. Block or free hours on the PS5/Xbox schedule. **Passes:** add a pass with any number of hours, use 1 or 2 hrs, **Add hours** (also renews it for 30 days from today), **Send link** (opens WhatsApp to the customer with their pass link). An unconfirmed hold stops blocking its slot after 3 hours.

**My pass** (`/pass`): the customer signs in with the mobile number saved on their pass (SMS code) and sees all their passes, or opens the link the owner sends (`/pass?id=…`, no sign-in). Hours left and valid-till update within 30 seconds of any change; "Book with my pass" opens the form on Use my pass. The owner's pass form saves the mobile as `+91…` (`phoneE164`); a pass without a mobile is link-only.

**Database:** Firebase project `mrgaming-cd566`, Firestore collections `requests` (owner-only), `holds` (public read, no names), `passes` (owner, plus a signed-in customer for passes whose `phoneE164` is their number), `passCards` (public read one at a time by link id: first name and hours only, never listed), `admins` (owner uids, written only with the admin key). Phone sign-in SMS is allowed to India only (Firebase Auth SMS region policy). All access is enforced by `firestore.rules`. Firebase SDK 12.19.0 is bundled into `public/assets/vendor/` (`scripts/build-firebase.mjs`), no CDN.

Plain HTML/CSS/JS. No build step and no dependencies. Fonts and images are self-hosted in `public/assets/`.

## Editing content

| What | Where |
|---|---|
| Phone / WhatsApp number, birthday price per child and hours, solo and duo rates, solo and duo pass prices, squad-room minimum hours, opening and closing hour, food perk %, booking food options | `CONFIG` at the top of `public/assets/js/main.js` (prices also appear as text in `public/index.html`) |
| Full food menu and prices | `public/assets/js/menu-data.js`. Items marked `featured: true` also show on the homepage. |
| Installed games | The "Installed" list in `public/index.html`; the booking form copies its game choices from it |
| Address, Maps link | `public/index.html` (Visit section + JSON-LD), `public/menu.html` footer |
| Room photo | Replace `public/assets/images/room-800.webp` and `room-1376.webp` (16:7 crop works best), then delete the "Representative image" caption in `index.html` |

## Table QR card (MR. Sandwich menu)

`print/mr-sandwich-menu-qr-a6.pdf` (print-ready A6) and `.png` (300 dpi). The QR opens `https://mr-gaming-rho.vercel.app/menu?src=qr`.

To change the design, edit `print/qr-card.html` and run `node scripts/make-qr-card.mjs` (needs Playwright). If the domain changes, regenerate `print/qr-menu.svg` first (command in the script header). Reprint the cards whenever the URL changes.

## Rules

- **Honest content only.** Every price, offer and claim comes from the owner or the printed menu. No invented reviews, ratings, "live" status or fake activity.
- **Don't count consoles.** Say "PS5 & Xbox" / "private room", never "1 PS5, 1 Xbox".
- **One accent per page.** Lime on MR. GAMING, yellow on MR. Sandwich. PS blue / Xbox green only mark which console a card is about.
- **Tokens, not hex.** Colours, spacing (4px scale) and radii are CSS variables at the top of each stylesheet.
- **Motion:** fade-in-blur reveals (once), word-by-word headline, rolling digits, sliding selectors, spring presses. Everything turns off under `prefers-reduced-motion`.

## Before launch: owner to confirm

- [x] Opening hours: 11 am – 11 pm daily
- [x] Games: GTA V, Fortnite, Minecraft, Forza, Spider-Man (Call of Duty to be added)
- [x] Payment: UPI, cash, card · not GST registered
- [ ] Real photos of the room (replace the representative image)
- [ ] FIFA Cup date, entry fee and prizes
- [x] MR. Sandwich food is served in the gaming room
- [ ] EA FC, needed before the FIFA Cup can run
- [ ] A custom domain (then regenerate and reprint the QR)

## Firebase setup and maintenance

The admin service-account key stays outside the repo (`.gitignore` blocks `*firebase-adminsdk*.json`).

```bash
pip install google-auth requests
python3 scripts/firebase_admin.py /path/to/key.json deploy-rules        # after editing firestore.rules
python3 scripts/firebase_admin.py /path/to/key.json add-owner +917337230311
```

Owners sign in at `/admin` with their mobile number and an SMS code (Firebase Phone Auth). The site's domain must be listed in Firebase > Authentication > Settings > Authorized domains.

## Run locally

```bash
node server.js          # http://localhost:5173  (serves public/, clean URLs like Vercel)
```

## Deploy

Vercel, connected to this repo. `vercel.json` serves `public/` with clean URLs (`/menu` → `menu.html`), security headers and font caching. Pushing to `main` deploys production.

Built with [Brand Mint](https://brandmintstudios.in).
