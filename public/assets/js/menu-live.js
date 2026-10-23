/* Live menu changes from the owner console: Firestore `menuOverrides`, one doc per menu item (or per price column).
   Doc id = slug of the item name ('Paneer Pizza' -> 'paneer-pizza'). A slug that occurs more than once in the
   whole MENU (today only "Chocolate Shake") becomes `${section.id}-${slug}` for every occurrence. Two-price items
   (`prices: [a, b]`) have one doc per column: `${id}-0`, `${id}-1`. Fields: price (int 1..10000), soldOut, hidden.
   Shared by /menu (menu.js), /book (book.js) and the owner console. menu-data.js stays the source; an override
   only changes what is shown, and if Firestore can't be read the pages simply keep menu-data.js. */

export const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Map of item object -> doc id (for a two-price item, the base id: its docs are `${id}-0` and `${id}-1`)
export function idsFor(MENU) {
  const all = [];
  MENU.sections.forEach((s) => s.groups.forEach((g) => g.items.forEach((it) => all.push([s, it]))));
  const seen = new Map();
  all.forEach(([, it]) => { const b = slug(it.name); seen.set(b, (seen.get(b) || 0) + 1); });
  return new Map(all.map(([s, it]) => { const b = slug(it.name); return [it, seen.get(b) > 1 ? `${s.id}-${b}` : b]; }));
}
// Every doc id an item can have: [id] or [`${id}-0`, `${id}-1`]
export const docIds = (it, id) => (it.prices ? it.prices.map((_, i) => `${id}-${i}`) : [id]);

const okPrice = (p) => Number.isInteger(p) && p >= 1 && p <= 10000;
// What to show for one item, given the overrides Map (doc id -> fields):
// { price | prices, cols?: [{ price, soldOut, hidden }], soldOut, hidden }
export function liveItem(it, id, ov) {
  if (!it.prices) {
    const o = ov.get(id) || {};
    return { price: okPrice(o.price) ? o.price : it.price, soldOut: o.soldOut === true, hidden: o.hidden === true };
  }
  const cols = it.prices.map((p, i) => { const o = ov.get(`${id}-${i}`) || {}; return { price: okPrice(o.price) ? o.price : p, soldOut: o.soldOut === true, hidden: o.hidden === true }; });
  const shown = cols.filter((c) => !c.hidden);
  return { prices: cols.map((c) => c.price), cols, hidden: !shown.length, soldOut: shown.length > 0 && shown.every((c) => c.soldOut) };
}

// One read of the whole collection (Firestore Lite, loaded only when called). Resolves to Map(doc id -> fields);
// rejects if Firestore can't be reached (callers keep menu-data.js).
let db = null;
export async function loadOverrides() {
  const [{ initializeApp, getFirestore, collection, getDocs }, { firebaseConfig }] = await Promise.all([
    import('/assets/vendor/firebase-public.2b1547c7.js'), import('/assets/js/firebase-config.js')
  ]);
  db = db || getFirestore(initializeApp(firebaseConfig, 'menu-live'));
  const snap = await getDocs(collection(db, 'menuOverrides'));
  const ov = new Map();
  snap.forEach((d) => ov.set(d.id, d.data()));
  return ov;
}
