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
| Owner | `public/admin.html` | Owner dashboard. No login of its own: owners use the same "Log in" as customers and are sent here. Not indexed |
| 404 | `public/404.html` | |

Home sections: hero → stations (PS5 / Xbox) + game cards → prices → availability board + booking request → birthday package → food highlights → FIFA Cup waitlist → visit.

**Game cards** (Stations section): one card per installed game, plus GTA VI (pre-ordered, not bookable), "And more on PS Plus" (asks on WhatsApp) and "3–4 players, one console" (links to those rates). A sideways-scrolling row on phones, five across on desktop. Tapping a game picks it in the booking form and scrolls there; the form's game choices are read from the cards. Artwork is original (made in Manus from our prompt: no official game art, logos or characters) in `public/assets/images/games/` as `{game}-360/600/900.webp`, loaded lazily with `srcset` so each screen downloads one size. To add a game: add a card in `index.html` with `data-pick-game="Name"` and its three images.

**On phones it works like an app:** a bottom tab bar (Home · Book · Birthdays · Food · My pass; the tab for the section on screen lights up, and /pass has the same bar), a slim header with a lime "Log in" button (to My pass) and the theme switch, an "Open now · till 11 pm" status worked out from the opening hours in Indian time, four quick tiles under the hero (Book a slot, Birthday party, Food menu, My pass), a trust row (private room, 100% pure veg, UPI / cash / card), prices as compact list cards and day chips in one sideways-scrolling row. `public/manifest.webmanifest` lets visitors add it to the home screen ("Add to Home screen"), where it opens full-screen with shortcuts to Book, My pass and the food menu. Desktop is unchanged.

**Pricing:** per console per hour, solo ₹199, duo (2 players on one console) ₹320, 3 players on one console ₹420, 4 players on one console ₹499 (games with couch play; passes are for 1–2 players). The whole room (both consoles, "Whole room" everywhere on the site) adds up both: 2 players ₹398, 3 ₹519, 4 ₹640 (min 2 hours). Passes, 6 hours within 30 days: solo ₹899, duo ₹1,499. **Member rate:** once a pass's 6 hours are used, until its 30 days end, ₹169/hr solo and ₹279/hr duo ("Pass used up" in the form; My pass shows it and links to it). 10% off food for console bookers.

**Birthday package** (from the owner's flyer): 3 hours, ₹599 per child and ₹299 per adult, food included per child (2 pizza slices, 1 snack of choice, French fries, 1 scoop of ice cream), PS5 & Xbox, board games. Minimum 10 guests; adults are welcome at ₹299 each and count towards the 10. Up to 15 guests get the game room to themselves; more than 15 get the whole restaurant. ₹3,000 advance to book; on cancellation ₹1,000 is kept and ₹2,000 refunded. The owner's flyer (real photos from the venue) is shown in the section (`public/assets/images/birthday-flyer*`). The planner (`#birthday`) takes children and adults (at least 10 in total), date, time (ends by 11 pm) and name, shows the space, children × ₹600 + adults × ₹299 and the advance, and sends the enquiry on WhatsApp. Once agreed, the owner adds it on /admin with "Add a booking" → Birthday party (children and adults, 3 hours fixed), which holds both consoles so the website shows the game room booked. The full birthday terms and the cancellation policy (22 points, same as the quote PDF) sit in a collapsible "Terms & conditions" panel at the end of the section (`#birthday-terms`; links to that anchor open it). The menu page links to it.

**Booking** (`#book`): three short steps, like booking a flight. A step bar (Slot · Fare · Confirm) sits on top (sticky on phones); the phone's back button goes back a step.
1. **Slot**: a search card (players with prices, 7 day chips with real "3 hrs left" / "Full") and filter chips (1 / 2 / 3 hrs; Any / PS5 / Xbox / Whole room for 2–4 players, 2 hrs minimum). Below, the open slots as result cards grouped Afternoon / Evening / Night: "6:00 PM → 7:00 PM · 1 hr · Xbox · ₹199", tagged "Last console" (only one console free) and "Starts in 2 hr 8 min" when true. Tapping a card goes to step 2.
2. **Fare** (the upsell): the slot (with a PS5 / Xbox switch for free consoles) and fare cards: **Pay per hour** vs **6-hr pass** marked Best value with the real maths (₹150/hr, save ₹295 vs hourly for solo; ₹250/hr, save ₹421 for duo), "today uses N hrs · the rest for 30 days" and the member rate after. Hourly is the default; when it's chosen it shows "Play 6 hrs this month? The pass saves you ₹295." Groups of 3–4 and the whole room see hourly only, with the reason. "Already have a pass?" offers Use my pass / Pass used up. Food to your seat with 10% off.
3. **Confirm**: a boarding-pass style ticket (times, date, console, players, fare, total), your name (remembered on that phone), an optional game, then **Hold my slot**: the hours are held in Firestore, WhatsApp opens with the request ID and bill, and the ticket shows HELD with the ID ("Held for you for 3 hours. Confirm on WhatsApp to lock it in"). The button then reopens WhatsApp without holding twice.
- **Phones**: a full-width bottom bar shows the price and the next step (Continue / Hold my slot) and replaces the tab bar during checkout. **Laptops**: a fare summary card sits beside the steps.
- **Urgency, all real**: slots left, "already booked", free hours per console and "Last console" from the database; "starts in" from the clock; "Only 3 hours left today" under the hero buttons; the 3-hour hold from `firestore.rules`. No viewer counts, fake timers or invented scarcity.
- **Availability**: one read for the whole week (`MGDB.takenRange`), re-read every minute and when the tab comes back. Today, hours that have started (or start within 15 minutes) are left off. If the database can't be reached there are no scarcity claims, every hour can be requested, and requests still go to WhatsApp. If someone else holds the slot first, step 1 comes back with "Someone just booked that time".
- Arriving from My pass (`/?pass=duo`, `&rate=member`) offers "My duo pass" (₹0) or the member rate on the fare step; tapping a game card carries that game to step 3; "See when it's free" on a console card sets the console filter.

**Owner page** (`/admin`, not indexed): one login for everyone. The owner taps "Log in" (or "My pass") like a customer and signs in with their mobile number + SMS code; if that number's account is on the owner list (`/admins` in Firestore) the site opens the dashboard instead of the passes. Opening `/admin` signed out goes to the login; a signed-in number that isn't an owner sees "Not an owner yet". **Upcoming** lists every live booking from today on, all days. Pick a day (chips for the next week, or any date) to see its requests and confirm / mark done / no-show / cancel (cancel frees the hours). **Add a booking** records phone and walk-in bookings, confirmed straight away, and refuses an hour that's already taken. Block or free hours on the PS5/Xbox schedule. **Passes:** add a pass with any number of hours, use 1 or 2 hrs, **Add hours** (also renews it for 30 days from today), **Send link** (opens WhatsApp to the customer with their pass link). An unconfirmed hold stops blocking its slot after 3 hours.

**My pass** (`/pass`): the customer signs in with the mobile number saved on their pass (SMS code) and sees all their passes, or opens the link the owner sends (`/pass?id=…`, no sign-in). Hours left and valid-till update within 30 seconds of any change; "Book with my pass" opens the form on Use my pass. The owner's pass form saves the mobile as `+91…` (`phoneE164`); a pass without a mobile is link-only.

**Database:** Firebase project `mrgaming-cd566`, Firestore collections `requests` (owner-only), `holds` (public read, no names), `passes` (owner, plus a signed-in customer for passes whose `phoneE164` is their number), `passCards` (public read one at a time by link id: first name and hours only, never listed), `admins` (owner uids, written only with the admin key). Phone sign-in SMS is allowed to India only (Firebase Auth SMS region policy). All access is enforced by `firestore.rules`. Firebase SDK 12.19.0 is bundled into `public/assets/vendor/` (`scripts/build-firebase.mjs`), no CDN: `firebase-public.<hash>.js` for the booking form (Firestore Lite) and `firebase-account.<hash>.js` shared by My pass and the owner page (phone sign-in + Firestore Lite). The hash in the name changes with the contents, so browsers keep these files for a year (`vercel.json`); the build script renames them and updates every reference. Never rename them by hand.

**Speed** (lab test, 390px phone, typical 4G; database replies timed as from Hyderabad to Google's Mumbai region): every screen shows content in under 0.65 s and is fully loaded (availability board, passes, owner dashboard with its data) in under 0.85 s, first visit or repeat. How:
- The owner page uses Firestore Lite (plain HTTPS reads) instead of live listeners. Bookings re-read every 20 s and passes every minute while it's on screen; everything re-reads when you come back to the tab and right after any change. A website request shows up on the dashboard within 20 s.
- One login and one shared Firebase file: an owner sent from /pass to /admin already has it cached. A device that has signed in as an owner shows the dashboard straight away while the data loads (the database rules still decide what it can read).
- My pass reads the passes and checks the owner list at the same time; the owner page starts its reads alongside the owner check.
- Pages preload their Firebase file and open the connections to Google's servers while the page is still loading.
- The hero's fade-in is pure CSS from the first frame, so the headline area is never held back by scripts.
- Fonts are trimmed to the characters and weights the site uses (Archivo 66 KB, JetBrains Mono 27 KB); the menu logo is WebP (8–15 KB); game art is lazy-loaded WebP sized per screen.
On slow 4G the screens show content in about 0.7–1.0 s; data takes 1.1–1.9 s, set by the network's round trips.

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
- [x] Games: FC 27, Call of Duty (latest), GTA V, God of War, Tekken, Rocket League, WWE 2K, AO Tennis, Spider-Man, Forza, Fortnite, Minecraft; GTA VI pre-ordered (shown, not bookable). Owner to confirm exact editions (FC 27 = "FIFA 27", WWE 2K = "SmackDown")
- [x] PlayStation Plus subscription on the PS5 (tier not stated on the site)
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

Owners sign in through "Log in" (`/pass`) with their mobile number and an SMS code (Firebase Phone Auth); an account listed in `/admins` is taken to `/admin`. To add an owner: `python3 scripts/firebase_admin.py KEY.json add-owner +91XXXXXXXXXX`. The site's domain must be listed in Firebase > Authentication > Settings > Authorized domains.

## Run locally

```bash
node server.js          # http://localhost:5173  (serves public/, clean URLs like Vercel)
```

## Deploy

Vercel, connected to this repo. `vercel.json` serves `public/` with clean URLs (`/menu` → `menu.html`), security headers and font caching. Pushing to `main` deploys production.

Built with [Brand Mint](https://brandmintstudios.in).
