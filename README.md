# 🎮 MR. GAMING by MR. Sandwich (India)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sumanthrb94-sudo/MR.GAMING)

India's premier private esports console gaming room & gourmet sandwich cafe website. Designed specifically for an exclusive **1x PlayStation 5** and **1x Xbox Series X** boutique lounge with live **INR (₹)** pricing, **Meta WhatsApp AI** booking assistant, and an **EA FC 25 FIFA India Championship** tournament hub.

---

## ⚡ Highlights

- **Tailored Console Setup**: Built around exactly **1x PS5** (Station 01) and **1x Xbox Series X** (Station 02) + Private Squad Room Takeover.
- **Indian Rupee (₹) Pricing**: Gaming rates from ₹149/hr, ₹279/hr private squad room takeover, and gourmet melts from ₹99 to ₹249.
- **Meta WhatsApp AI Concierge**: In-page interactive chat simulator (`MR. Bot`) and direct WhatsApp deep-links (`https://wa.me/...`) for instant automated pod reservations.
- **FIFA ₹25,000 Championship**: Live countdown timer, urgency meter (*28/32 slots booked*), rules breakdown, and ₹299 UPI registration modal.
- **MR. Sandwich Gourmet Fuel**: Signature Indian menu items (Makhani Paneer Melt, Spicy Tandoori Chicken Sub, Peri-Peri Cheesy Fries, Monster Shakes, Blue Lagoon Chiller).
- **Live FOMO Notifications**: Realistic real-time customer activity popups (Bangalore, Delhi NCR, Mumbai, etc.).
- **Vercel Ready**: Pre-configured with `vercel.json` for edge caching, security headers, and instant zero-config deployments.

---

## 🚀 How to Deploy to Vercel

### Option 1: Via Vercel Dashboard (Easiest)
1. Push this repository to your GitHub account (`git push origin main`).
2. Go to [vercel.com](https://vercel.com) and log in.
3. Click **"Add New..."** > **"Project"**.
4. Import your **`MR.GAMING`** repository.
5. Keep all default settings (Framework Preset: **Other** / Root Directory: `./`).
6. Click **"Deploy"**! Your website will be live with an SSL HTTPS domain in ~15 seconds.

### Option 2: Via Vercel CLI (From Terminal)
Run the following command from the project root:
```bash
npx vercel
```
Follow the quick CLI prompts to link and deploy your site immediately.

To deploy to production:
```bash
npx vercel --prod
```

---

## 💻 Local Development

Run the zero-dependency local server:
```bash
node server.js
```
Open your browser at `http://localhost:5173`.

---

## ⚙️ How to Customize Store Details

### Change WhatsApp Number
1. In `assets/js/main.js` (line 10), update:
   ```javascript
   whatsappNumber: "919876543210", // Your 10-digit Indian WhatsApp number with 91 prefix
   ```
2. In `index.html`, search for `919876543210` and replace with your phone number.

### Change Address & Operating Hours
In `index.html`, navigate to the `<section id="location">` section to update your store address and timings.

---

## 📄 License
MIT © 2026 MR. GAMING by MR. Sandwich
