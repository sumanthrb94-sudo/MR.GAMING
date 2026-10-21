// Renders print/mr-sandwich-meal-plans.html (A5) to a print PDF, a 300 dpi PNG and a 1080px JPG for WhatsApp.
// Plans, prices and the ₹300 combos come from public/assets/js/menu-data.js: re-run this after changing them.
// Regenerate the QR first if the site URL changes (print/qr-menu.svg is the table card's, keep it separate):
//   python3 -c "import segno; segno.make('https://mr-gaming-rho.vercel.app/menu?src=meal-flyer#meal-plans', error='q').save('print/qr-meal-plans.svg', scale=10, border=0, dark='#231F1F', light=None)"
//   (then add viewBox="0 0 W H" to the <svg> tag so it scales; 'q' keeps this long URL at 41 modules, 'h' would need 45)
// Run: node scripts/make-meal-flyer.mjs   (needs Playwright + Chromium)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'print');
const url = pathToFileURL(path.join(dir, 'mr-sandwich-meal-plans.html')).href;
const browser = await chromium.launch();
const errors = [];
// A5 = 148 × 210 mm = 559 × 794 CSS px; 3.13× gives 1750 × 2485 px (300 dpi)
const page = await browser.newPage({ viewport: { width: 559, height: 794 }, deviceScaleFactor: 3.13 });
page.on('pageerror', e => errors.push(e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const check = await page.evaluate(() => {
  const els = [...document.body.querySelectorAll('*')];
  // smallest text on the sheet: 7pt = 9.33 CSS px
  const tiny = els.filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 9.3);
  return {
    plans: document.querySelectorAll('.plan').length, want: window.MENU?.mealPlans?.plans.length,
    combos: document.querySelectorAll('#combos li').length,
    // the copy says "save on every one": every plan must cost less a meal than mealValue
    dearer: (window.MENU?.mealPlans?.plans || []).filter(p => p.price >= p.meals * window.MENU.mealPlans.mealValue).map(p => p.meals + ' meals'),
    // the address line is last; keep the page's bottom margin clear
    bottom: Math.round(document.querySelector('.base').getBoundingClientRect().bottom + parseFloat(getComputedStyle(document.body).paddingBottom)),
    wide: els.filter(e => e.getBoundingClientRect().right > 559.5).map(e => e.className || e.tagName),
    // a longer price or name spilling out of its card or row (nowrap pills don't wrap), or past the round stamp
    spill: els.filter(e => { const box = e.parentElement?.closest('.plan, .qr, .valid, li'); if (!box) return false; const r = e.getBoundingClientRect(), b = box.getBoundingClientRect(); return r.right > b.right + .5 || r.left < b.left - .5; }).map(e => e.className || e.tagName)
      .concat([...document.querySelectorAll('.stamp > *')].some(e => e.offsetWidth > .8 * e.parentElement.offsetWidth) ? ['stamp'] : []),
    tiny: tiny.map(e => e.textContent.trim().slice(0, 30))
  };
});
if (errors.length) throw new Error('page error: ' + errors.join('; '));
if (!check.want || check.plans !== check.want || !check.combos) throw new Error('plans or combos missing: is menu-data.js loading?');
if (check.bottom > 794) throw new Error(`flyer overflows A5 by ${check.bottom - 794}px: shorten the copy`);
if (check.dearer.length) throw new Error('no saving on ' + check.dearer.join(', ') + ': fix menu-data.js or the copy');
if (check.wide.length) throw new Error('content wider than A5: ' + check.wide.join(', '));
if (check.spill.length) throw new Error('text spills out of its box: ' + check.spill.join(', '));
if (check.tiny.length) throw new Error('text under 7pt: ' + check.tiny.join(' | '));
await page.screenshot({ path: path.join(dir, 'mr-sandwich-meal-plans-a5.png') });
await page.pdf({ path: path.join(dir, 'mr-sandwich-meal-plans-a5.pdf'), width: '148mm', height: '210mm', printBackground: true });
// WhatsApp size
const p2 = await browser.newPage({ viewport: { width: 559, height: 794 }, deviceScaleFactor: 1080 / 559 });
await p2.goto(url, { waitUntil: 'networkidle' }); await p2.evaluate(() => document.fonts.ready);
await p2.screenshot({ path: path.join(dir, 'mr-sandwich-meal-plans-whatsapp.jpg'), type: 'jpeg', quality: 90 });
await browser.close();
console.log('wrote print/mr-sandwich-meal-plans-a5.pdf, -a5.png and -whatsapp.jpg');
