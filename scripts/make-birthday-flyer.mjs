// Renders print/birthday-flyer.html (853 × 1280) to the birthday package flyer in the Birthdays section:
// public/assets/images/birthday-package.jpg, birthday-package-853.webp and birthday-package-560.webp.
// The page paints the price burst and the food band over the owner's artwork, print/birthday-flyer-source.jpg,
// so every run starts from that source, never from an earlier output. Its prices must match CONFIG.birthday in main.js.
// When the package changes again, give the outputs new names: browsers keep images for 7 days.
// Run: node scripts/make-birthday-flyer.mjs   (needs Playwright + Chromium, and python3 with Pillow for the WebP files)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const images = path.join(root, 'public', 'assets', 'images');
const W = 853, H = 1280;

// what the flyer must say: the prices the booking form charges
const cfg = fs.readFileSync(path.join(root, 'public', 'assets', 'js', 'main.js'), 'utf8').match(/birthday:\s*\{([^}]*)\}/)?.[1] || '';
const conf = k => Number(cfg.match(new RegExp(k + ':\\s*(\\d+)'))?.[1]);
const want = { hours: conf('hours'), perChild: conf('perChild'), perAdult: conf('perAdult') };
if (Object.values(want).some(v => !v)) throw new Error('CONFIG.birthday not found in public/assets/js/main.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'birthday-flyer-'));
try {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => errors.push('could not load ' + r.url()));
  await page.goto(pathToFileURL(path.join(root, 'print', 'birthday-flyer.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const check = await page.evaluate(([W, H]) => {
    const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
    const box = e => e.getBoundingClientRect();
    const num = s => Number($(s).textContent.replace(/\D/g, ''));
    const base = $('.base'), splash = $('.splash');
    // the band's cover runs from y 865 to 1030: below that is the original icon row
    const band = { top: 865, bottom: 1030 };
    return {
      base: base.complete && base.naturalWidth === W && base.naturalHeight === H,
      font: document.fonts.check('900 20px Archivo'),
      said: { hours: num('.price .hrs'), perChild: num('.price b'), perAdult: num('.adults b') },
      // a dish name on more than two lines, or wider than its column
      labels: $$('.items p').filter(p => p.scrollWidth > p.clientWidth || box(p).height > 2.2 * parseFloat(getComputedStyle(p).lineHeight)).map(p => p.textContent),
      out: $$('.food li, .food p').filter(e => { const b = box(e); return b.top < band.top || b.bottom > band.bottom || b.left < 0 || b.right > W; }).map(e => e.textContent.trim().slice(0, 30)),
      // text over the yellow splash on the right
      splash: $$('.food p').filter(p => { const b = box(p); return [[b.left, b.top], [b.right, b.top], [b.right, b.bottom], [b.left, b.bottom]].some(([x, y]) => splash.isPointInFill(new DOMPoint(x, y))); }).map(p => p.textContent),
      wide: $$('body *').filter(e => !e.closest('svg') && box(e).right > W + .5).map(e => e.className || e.tagName),
    };
  }, [W, H]);
  if (errors.length) throw new Error('page error: ' + errors.join('; '));
  if (!check.base) throw new Error('print/birthday-flyer-source.jpg is missing or not 853 × 1280');
  if (!check.font) throw new Error('Archivo did not load');
  for (const k in want) if (check.said[k] !== want[k]) throw new Error(`the flyer says ${k} ${check.said[k]}, main.js says ${want[k]}: fix print/birthday-flyer.html`);
  if (check.labels.length) throw new Error('dish name too long for its column: ' + check.labels.join(' | '));
  if (check.out.length) throw new Error('food band text spills out of the band: ' + check.out.join(' | '));
  if (check.splash.length) throw new Error('text over the yellow splash: ' + check.splash.join(' | '));
  if (check.wide.length) throw new Error('content wider than the flyer: ' + check.wide.join(', '));
  await page.screenshot({ path: path.join(tmp, 'flyer.png') });
  await page.screenshot({ path: path.join(tmp, 'flyer.jpg'), type: 'jpeg', quality: 86 });
  // two masks for the burst check below: the price text alone, then the area inside the stitching
  const text = await page.addStyleTag({ content: 'body { background: #000 } .base, .art, .food { visibility: hidden } .price, .price * { color: #fff }' });
  await page.screenshot({ path: path.join(tmp, 'text.png') });
  await text.evaluate(s => s.remove());
  await page.addStyleTag({ content: 'body { background: #000 } .base, .art *, .price, .food { visibility: hidden } .art .stitch { visibility: visible; fill: #fff; stroke: none }' });
  await page.screenshot({ path: path.join(tmp, 'inside.png') });
  await browser.close();

  // the price must sit inside the stitching (2 px clear) and end before the page edge; then the WebPs, as small as they stay sharp
  execFileSync('python3', ['-c', `
import os, sys
from PIL import Image, ImageChops, ImageFilter
tmp, out = sys.argv[1:3]
text = Image.open(os.path.join(tmp, 'text.png')).convert('L').point(lambda v: 255 if v > 96 else 0)
inside = Image.open(os.path.join(tmp, 'inside.png')).convert('L').point(lambda v: 255 if v > 128 else 0).filter(ImageFilter.MinFilter(5))
stray, ink = ImageChops.subtract(text, inside).getbbox(), text.getbbox()
if not ink: sys.exit('no price text in the burst')
if stray: sys.exit('the price crosses the burst stitching around %s: make it smaller in print/birthday-flyer.html' % (stray,))
if ink[2] > text.width - 6: sys.exit('the price runs off the right edge of the flyer')
im = Image.open(os.path.join(tmp, 'flyer.png')).convert('RGB')
for w, limit in ((853, 260000), (560, 150000)):
    v = im if w == im.width else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    dest = os.path.join(out, 'birthday-package-%d.webp' % w)
    for q in (84, 80, 76, 72):
        v.save(dest, 'WEBP', quality=q, method=6)
        if os.path.getsize(dest) < limit: break
    print('wrote public/assets/images/birthday-package-%d.webp (%d x %d, q%d, %d KB)' % (w, v.width, v.height, q, os.path.getsize(dest) // 1024))
`, tmp, images], { stdio: ['ignore', 'inherit', 'inherit'] });
  fs.copyFileSync(path.join(tmp, 'flyer.jpg'), path.join(images, 'birthday-package.jpg'));
  console.log(`wrote public/assets/images/birthday-package.jpg (${Math.round(fs.statSync(path.join(images, 'birthday-package.jpg')).size / 1024)} KB)`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
