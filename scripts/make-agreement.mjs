// Renders print/party-booking-agreement.html to an A4 print PDF with page numbers.
// Run: node scripts/make-agreement.mjs   (needs Playwright + Chromium)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'print');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(dir, 'party-booking-agreement.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: path.join(dir, 'party-booking-agreement.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true,
  displayHeaderFooter: true, headerTemplate: '<span></span>',
  // the footer has no access to the page's fonts or variables
  footerTemplate: '<div style="width:100%;padding:0 15mm;font:8px Archivo,Inter,sans-serif;color:#57524C;display:flex;justify-content:space-between"><span>MR. Sandwich · Party Booking Agreement</span><span>Initials: ________ &nbsp; Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
});
await browser.close();
console.log('wrote print/party-booking-agreement.pdf');
