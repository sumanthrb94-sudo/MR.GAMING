/* Sign-in and booking for /book: a booking is saved only by someone signed in with their mobile number (SMS code).
   Loaded by book.js when the visitor reaches the fare or confirm step, so the first paint never waits for it.
   The sign-in itself is account.js (shared with food orders on /menu): same Firebase app and auth persistence as
   /pass (pass.js), so one sign-in serves every page.
   firestore.rules accepts a website request only with uid == the caller and phone == the verified number, and each
   hold only next to a request of the caller's. */
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from '/assets/vendor/firebase-account.0e285128.js';
import { db, ready, onUser, sendCode, confirmCode, forgetCode, signOut, currentUser } from '/assets/js/account.js';

// Taken "console_hour" keys on a day (holds are public; no names)
async function takenFor(date) {
  const snap = await getDocs(query(collection(db, 'holds'), where('date', '==', date)));
  const taken = new Set();
  snap.forEach((d) => {
    const h = d.data(), created = h.createdAt && h.createdAt.toMillis ? h.createdAt.toMillis() : Date.now();
    if (h.status === 'pending' && Date.now() - created > 3 * 60 * 60 * 1000) return;   // old unconfirmed holds lapse (firestore.rules)
    taken.add(`${h.console}_${h.hour}`);
  });
  return taken;
}

// Books it: the request (with the caller's uid and verified number) and one hold per console per hour in one batch,
// both 'booked'. A slot someone already holds fails the batch.
async function reserve(b) {
  const user = currentUser();
  if (!user) return { ok: false, reason: 'signed-out' };
  const consoles = b.station === 'squad' ? ['ps5', 'xbox'] : [b.station];
  const hours = Array.from({ length: b.hours }, (_, i) => b.start + i);
  const batch = writeBatch(db);
  batch.set(doc(db, 'requests', b.id), {
    id: b.id, uid: user.uid, name: b.name, phone: user.phoneNumber, date: b.date, start: b.start, hours: b.hours, station: b.station,
    players: b.players, plan: b.plan, game: b.game, food: b.food, total: b.total,
    status: 'booked', createdAt: serverTimestamp()
  });
  consoles.forEach((c) => hours.forEach((h) => batch.set(doc(db, 'holds', `${b.date}_${c}_${h}`), {
    date: b.date, console: c, hour: h, requestId: b.id, status: 'booked', createdAt: serverTimestamp()
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
    console.warn('Booking not saved:', err && err.code);
    return { ok: false, reason: 'offline' };
  }
}

export { ready, onUser, sendCode, confirmCode, forgetCode, signOut, currentUser, reserve };
