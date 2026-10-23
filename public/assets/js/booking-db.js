/* Live availability for the public pages (Firestore Lite, no sign-in): which console hours are taken, never names.
   Loaded on demand by book.js and home.js (the hours left today) as window.MGDB. Saving a booking needs a verified
   mobile number, so it lives in book-account.js, which /book loads only at the fare and confirm steps.
   If Firestore is unreachable the form falls back to a plain WhatsApp request, which is not booked until we reply. */
import { initializeApp, getFirestore, collection, query, where, getDocs } from '/assets/vendor/firebase-public.2b1547c7.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';

const db = getFirestore(initializeApp(firebaseConfig));
// Old requests from before instant booking were 'pending' and stopped blocking their slot after 3 hours
// (isStalePending() in firestore.rules); 'booked' holds always count as taken.
const STALE_MS = 3 * 60 * 60 * 1000;

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

// The whole week in one read: Map of date -> Set of taken "console_hour" keys (dates as YYYY-MM-DD, inclusive)
async function takenRange(from, to) {
  const snap = await getDocs(query(collection(db, 'holds'), where('date', '>=', from), where('date', '<=', to)));
  const week = new Map();
  snap.forEach((d) => {
    const h = d.data();
    const created = h.createdAt && h.createdAt.toMillis ? h.createdAt.toMillis() : Date.now();
    if (h.status === 'pending' && Date.now() - created > STALE_MS) return;
    if (!week.has(h.date)) week.set(h.date, new Set());
    week.get(h.date).add(`${h.console}_${h.hour}`);
  });
  return week;
}

window.MGDB = { takenFor, takenRange };
window.dispatchEvent(new Event('mgdb-ready'));
