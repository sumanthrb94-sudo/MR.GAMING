// Renders print/qr-card.html to a print-ready PDF (A6) and a 300 dpi PNG.
// Regenerate the QR first if the menu URL changes:
//   python3 -c "import segno; segno.make('https://<domain>/menu?src=qr', error='h').save('print/qr-menu.svg', scale=10, border=0, dark='#231F1F', light=None)"
//   (then add viewBox="0 0 W H" to the <svg> tag so it scales)
// Run: node scripts/make-qr-card.mjs   (needs Playwright + Chromium)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'print');
const url = pathToFileURL(path.join(dir, 'qr-card.html')).href;
const browser = await chromium.launch();

// A6 = 105 × 148 mm = 397 × 559 CSS px; 3.125× gives 1240 × 1748 px (300 dpi)
const page = await browser.newPage({ viewport: { width: 397, height: 559 }, deviceScaleFactor: 3.125 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(dir, 'mr-sandwich-menu-qr-a6.png') });
await page.pdf({ path: path.join(dir, 'mr-sandwich-menu-qr-a6.pdf'), width: '105mm', height: '148mm', printBackground: true });

await browser.close();
console.log('wrote print/mr-sandwich-menu-qr-a6.png and .pdf');
