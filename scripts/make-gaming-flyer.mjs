// Renders print/mr-gaming-flyer.html (A5) to a print PDF, a 300 dpi PNG and a 1080px JPG for WhatsApp.
// Regenerate the QR first if the site URL changes:
//   python3 -c "import segno; segno.make('https://mr-gaming-rho.vercel.app/book?src=flyer', error='h').save('print/qr-site.svg', scale=10, border=0, dark='#0B0B0A', light=None)"
//   (then add viewBox="0 0 W H" to the <svg> tag so it scales; the QR opens /book, the booking screen, not the home page)
// Run: node scripts/make-gaming-flyer.mjs   (needs Playwright + Chromium; PIL for the JPG is optional: see the end)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'print');
const url = pathToFileURL(path.join(dir, 'mr-gaming-flyer.html')).href;
const browser = await chromium.launch();
// A5 = 148 × 210 mm = 559 × 794 CSS px; 3.13× gives 1750 × 2485 px (300 dpi)
const page = await browser.newPage({ viewport: { width: 559, height: 794 }, deviceScaleFactor: 3.13 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const bottom = await page.evaluate(() => Math.round(document.querySelector('.foot').getBoundingClientRect().bottom));
if (bottom > 794) throw new Error(`flyer overflows A5 by ${bottom - 794}px: shorten the copy`);
await page.screenshot({ path: path.join(dir, 'mr-gaming-flyer-a5.png') });
await page.pdf({ path: path.join(dir, 'mr-gaming-flyer-a5.pdf'), width: '148mm', height: '210mm', printBackground: true });
// WhatsApp size
const p2 = await browser.newPage({ viewport: { width: 559, height: 794 }, deviceScaleFactor: 1080 / 559 });
await p2.goto(url, { waitUntil: 'networkidle' }); await p2.evaluate(() => document.fonts.ready);
await p2.screenshot({ path: path.join(dir, 'mr-gaming-flyer-whatsapp.jpg'), type: 'jpeg', quality: 90 });
await browser.close();
console.log('wrote print/mr-gaming-flyer-a5.pdf, -a5.png and -whatsapp.jpg');
