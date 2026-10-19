/* Booking database for the public form (Firestore Lite).
   Loaded on demand by main.js as window.MGDB. If Firestore is unreachable the form still works
   as a plain WhatsApp request; it just cannot show or reserve taken slots. */
import { initializeApp, getFirestore, collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from '/assets/vendor/firebase-public.2b1547c7.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';

const db = getFirestore(initializeApp(firebaseConfig));
const STALE_MS = 3 * 60 * 60 * 1000;   // matches isStalePending() in firestore.rules

// Set of "console_hour" keys that are taken on a day, e.g. "ps5_19"
async function takenFor(date) {
  const snap = await getDocs(query(collection(db, 'holds'), where('date', '==', date)));
  const taken = new Set();
  snap.forEach((d) => {
    const h = d.data();
    const created = h.createdAt && h.createdAt.toMillis ? h.createdAt.toMillis() : Date.now();
    if (h.status === 'pending' && Date.now() - created > STALE_MS) return;
    taken.add(`${h.console}_${h.hour}`);
  });
  return taken;
}

// Saves the request and one hold per console per hour in one batch. A slot someone already holds fails the batch.
async function reserve(b) {
  const consoles = b.station === 'squad' ? ['ps5', 'xbox'] : [b.station];
  const hours = Array.from({ length: b.hours }, (_, i) => b.start + i);
  const batch = writeBatch(db);
  batch.set(doc(db, 'requests', b.id), {
    id: b.id, name: b.name, date: b.date, start: b.start, hours: b.hours, station: b.station,
    players: b.players, plan: b.plan, game: b.game, food: b.food, total: b.total,
    status: 'pending', createdAt: serverTimestamp()
  });
  consoles.forEach((c) => hours.forEach((h) => batch.set(doc(db, 'holds', `${b.date}_${c}_${h}`), {
    date: b.date, console: c, hour: h, requestId: b.id, status: 'pending', createdAt: serverTimestamp()
  })));
  try {
    await batch.commit();
    return { ok: true };
  } catch (err) {
    // A clash shows up as permission-denied: check whether the slot really is held now
    try {
      const taken = await takenFor(b.date);
      if (consoles.some((c) => hours.some((h) => taken.has(`${c}_${h}`)))) return { ok: false, reason: 'taken', taken };
    } catch (e) { /* fall through */ }
    console.warn('Booking database unavailable, sending on WhatsApp only:', err && err.code);
    return { ok: false, reason: 'offline' };
  }
}

window.MGDB = { takenFor, reserve };
window.dispatchEvent(new Event('mgdb-ready'));
