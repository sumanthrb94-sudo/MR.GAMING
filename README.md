# MR. GAMING · Gachibowli

Website for **MR. GAMING**, a private PS5 & Xbox gaming room inside **MR. Sandwich (100% pure veg)**, 110, My Home Vihanga Rd, Gachibowli, Hyderabad 500032.

Live: https://mr-gaming-rho.vercel.app · Menu: https://mr-gaming-rho.vercel.app/menu

Visitors do one thing here: **book on WhatsApp** (+91 73372 30311). The food menu page is what the table QR code opens.

## What's in it

| Page | File | Look |
|---|---|---|
| Home | `public/index.html` | MR. GAMING: near-black, one lime accent from the logo, Archivo (wide/black for headlines), light + dark mode |
| Food menu | `public/menu.html` | MR. Sandwich "The Hungry Times" newspaper style from the printed menu: cream paper, double rules, Playfair, blackletter masthead, logo yellow |
| 404 | `public/404.html` | |

Home sections: hero → stations (PS5 / Xbox) + installed games → prices → booking request → food highlights → FIFA Cup waitlist → visit.

**Pricing:** per console per hour, solo ₹199, duo (2 players on one console) ₹320. Squad room adds up both consoles: 2 players ₹398, 3 ₹519, 4 ₹640 (min 2 hours). Passes, 6 hours within 30 days: solo ₹899, duo ₹1,499. 10% off food for console bookers.

**Booking (no database):** the visitor picks console, players, length, pay with (hourly / buy a pass / use my pass), day (next 7 days), start time (inside 11 am–11 pm, past times hidden, Indian time), game and food, then enters a name. "Request on WhatsApp" opens a chat to the owner with a request ID and an itemised bill. The owner confirms in that chat and sends the UPI QR for the advance. The site cannot show which slots are taken; add a database later for live availability.

Plain HTML/CSS/JS. No build step and no dependencies. Fonts and images are self-hosted in `public/assets/`.

## Editing content

| What | Where |
|---|---|
| Phone / WhatsApp number, solo and duo rates, solo and duo pass prices, squad-room minimum hours, opening and closing hour, food perk %, booking food options | `CONFIG` at the top of `public/assets/js/main.js` (prices also appear as text in `public/index.html`) |
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

## Run locally

```bash
node server.js          # http://localhost:5173  (serves public/, clean URLs like Vercel)
```

## Deploy

Vercel, connected to this repo. `vercel.json` serves `public/` with clean URLs (`/menu` → `menu.html`), security headers and font caching. Pushing to `main` deploys production.

Built with [Brand Mint](https://brandmintstudios.in).
