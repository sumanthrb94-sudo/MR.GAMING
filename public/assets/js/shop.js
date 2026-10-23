/* MR. Sandwich shop settings and the sums shared by food ordering (/menu, order.js) and the console's bills
   (admin-shop.js). No dependencies until loadShop() is called.
   settings/shop (public read, owner write from the console's Settings screen):
     lat, lng, accuracy (m), cosLat, locatedAt   the shop's location, captured once at the shop (cosLat lets
                                                firestore.rules check the delivery distance without trigonometry)
     freeRadiusKm (default 4), deliveryOn        free delivery within this straight-line distance; none beyond it
     gstin, legalName, foodGst (5), gamingGst (0), pricesExclusive (true: the menu says "GST extra as applicable")
   GST appears only once a GSTIN is set. Without one, bills are titled "Bill", carry no tax lines and the total is the
   plain sum. Tax is never worked out without a GSTIN. */

export const SHOP_DEFAULTS = { freeRadiusKm: 4, deliveryOn: true, gstin: '', legalName: '', foodGst: 5, gamingGst: 0, pricesExclusive: true };
export const withDefaults = (s) => ({ ...SHOP_DEFAULTS, ...(s || {}) });
export const hasLocation = (s) => !!s && Number.isFinite(s.lat) && Number.isFinite(s.lng);
// Delivery is offered once the owner has set the location and left delivery on
export const deliveryOpen = (s) => hasLocation(s) && s.deliveryOn !== false && +s.freeRadiusKm > 0;
// 15 characters: state code, PAN, entity number, Z, check character
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Straight-line distance in km (haversine)
export function distanceKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const paise = (n) => Math.round(n * 100) / 100;
// lines: [{ qty, price, tax: 'food' | 'gaming' }] (price may be negative for a discount line).
// Returns { lines (with amount, and gst % when GST applies), subtotal, taxes: [{ label, rate, taxable, cgst, sgst, tax }],
//           tax, roundOff, total, gst: null | { gstin, legalName, pricesExclusive } }.
// Exclusive prices: tax is added on top. Inclusive: the tax is the part of the price above the taxable value.
// CGST and SGST are half each (the shop and its customers are in Telangana). The total is rounded to the rupee.
export function billMath(lines, shop) {
  const s = withDefaults(shop), gst = !!s.gstin;
  const rate = { food: +s.foodGst || 0, gaming: +s.gamingGst || 0 };
  const out = lines.map((l) => ({ ...l, amount: paise((+l.qty || 0) * (+l.price || 0)), ...(gst ? { gst: rate[l.tax] || 0 } : {}) }));
  const subtotal = paise(out.reduce((t, l) => t + l.amount, 0));
  if (!gst) return { lines: out, subtotal, taxes: [], tax: 0, roundOff: 0, total: Math.round(subtotal), gst: null };
  const taxes = ['food', 'gaming'].map((k) => {
    const base = paise(out.filter((l) => l.tax === k).reduce((t, l) => t + l.amount, 0)), r = rate[k];
    if (!r || !base) return null;
    const taxable = s.pricesExclusive ? base : paise((base * 100) / (100 + r)), tax = s.pricesExclusive ? paise((base * r) / 100) : paise(base - taxable);
    return { label: k === 'food' ? 'Food' : 'Gaming', rate: r, taxable, cgst: paise(tax / 2), sgst: paise(tax - paise(tax / 2)), tax };
  }).filter(Boolean);
  const tax = paise(taxes.reduce((t, x) => t + x.tax, 0)), raw = paise(subtotal + (s.pricesExclusive ? tax : 0)), total = Math.round(raw);
  return { lines: out, subtotal, taxes, tax, roundOff: paise(total - raw), total, gst: { gstin: s.gstin, legalName: s.legalName || '', pricesExclusive: !!s.pricesExclusive } };
}

// Indian financial year (April to March) of a moment, in India time: '2026-27'
export function fyOf(ms = Date.now()) {
  const d = new Date(ms + 330 * 60000), y = d.getUTCFullYear(), start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

// One read of settings/shop with the public Firestore Lite bundle (no sign-in). Resolves to the fields, or null when
// the owner hasn't saved any yet; rejects if Firestore can't be reached.
let pub = null;
export async function loadShop() {
  const [{ initializeApp, getFirestore, doc, getDoc }, { firebaseConfig }] = await Promise.all([
    import('/assets/vendor/firebase-public.2b1547c7.js'), import('/assets/js/firebase-config.js')
  ]);
  pub = pub || getFirestore(initializeApp(firebaseConfig, 'shop'));
  const snap = await getDoc(doc(pub, 'settings', 'shop'));
  return snap.exists() ? snap.data() : null;
}
