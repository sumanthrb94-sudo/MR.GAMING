/* Customer sign-in shared by every screen that needs it: /pass (pass.js), /book (book-account.js), food orders on /menu
   (order.js) and the account sheet behind the top bar's name (profile.js). Mobile number + SMS code (Firebase Phone
   Auth), one Firebase app and one auth persistence, so one sign-in serves every page. Loaded only when a visitor signs
   in, opens the cart or taps their name, so no first paint waits for it.
   The profile (users/{uid}: name, email, phone, WhatsApp opt-in) is read and written here too; profile.js has the
   welcome form and the account sheet. firestore.rules accept a booking, a food order or a profile only with
   uid == the caller and phone == the verified number. */
import {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence,
  RecaptchaVerifier, signInWithPhoneNumber, signOut as fbSignOut, onAuthStateChanged, getFirestore,
  doc, getDoc, setDoc, serverTimestamp
} from '/assets/vendor/firebase-account.0e285128.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
auth.languageCode = 'en';

/* ---------- what the top bar reads without loading Firebase (main.js paintLogin) ----------
   mg-auth  '1' while this browser is signed in
   mg-profile  { uid, name, phone, email } of the signed-in customer, once their profile is known
   mg-name / mg-phone  the name and number last typed in a booking or order form (prefill only) */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
export const cachedProfile = () => { try { return JSON.parse(store.get('mg-profile') || 'null'); } catch (e) { return null; } };
export function cacheProfile(uid, p) {
  if (!p) store.del('mg-profile');
  else { store.set('mg-profile', JSON.stringify({ uid, name: p.name || '', phone: p.phone || '', email: p.email || '' })); if (p.name) store.set('mg-name', p.name); }
  repaint();
}
const repaint = () => { if (window.MG && window.MG.paintLogin) window.MG.paintLogin(); };
const hint = (u) => {
  if (u) {
    store.set('mg-auth', '1');
    const c = cachedProfile();
    if (c && c.uid !== u.uid) { store.del('mg-profile'); store.del('mg-name'); }   // another number signed in on this browser
  } else { store.del('mg-auth'); store.del('mg-profile'); }
  repaint();
};

let user = null, verifier = null, confirmation = null;
const listeners = new Set();
// Resolves once Firebase knows whether this phone is already signed in
export const ready = new Promise((resolve) => onAuthStateChanged(auth, (u) => {
  user = u && u.phoneNumber ? u : null; hint(user);
  listeners.forEach((cb) => cb(user)); resolve(user);
}));
export const onUser = (cb) => { listeners.add(cb); ready.then(() => cb(user)); };
export const currentUser = () => user;

const resetVerifier = () => { if (verifier) { verifier.clear(); verifier = null; } };
// phoneE164: "+91" and 10 digits. el: the element the invisible reCAPTCHA goes into
export async function sendCode(phoneE164, el) {
  resetVerifier();
  try {
    verifier = new RecaptchaVerifier(auth, el, { size: 'invisible' });
    confirmation = await signInWithPhoneNumber(auth, phoneE164, verifier);
    return { ok: true };
  } catch (err) {
    resetVerifier();
    if (err && err.code) console.warn('Sign-in code not sent:', err.code);
    return { ok: false, code: (err && err.code) || '' };
  }
}
export async function confirmCode(code) {
  if (!confirmation) return { ok: false, code: 'no-code' };
  try { const cred = await confirmation.confirm(code); confirmation = null; resetVerifier(); return { ok: true, user: cred.user }; }
  catch (err) { return { ok: false, code: (err && err.code) || '' }; }
}
export const forgetCode = () => { confirmation = null; resetVerifier(); };
// Signs this browser out everywhere on the site: Firebase, the top bar's hint and profile, and the typed name and number
export async function signOut() {
  await fbSignOut(auth);
  ['mg-auth', 'mg-profile', 'mg-name', 'mg-phone'].forEach((k) => store.del(k));
  repaint();
}

/* ---------- the profile: users/{uid} ---------- */
// The saved profile, or null when this customer hasn't filled in the welcome form yet. Throws if it can't be read.
export async function getProfile(u = user) {
  if (!u) return null;
  const snap = await getDoc(doc(db, 'users', u.uid));
  const p = snap.exists() ? snap.data() : null;
  cacheProfile(u.uid, p);
  return p;
}
// Creates or updates the profile. prev: the saved profile when editing (its createdAt stays as it was)
export async function saveProfile(u, { name, email, waOptIn }, prev) {
  const p = {
    name: String(name).trim().slice(0, 40), email: email ? String(email).trim().toLowerCase().slice(0, 100) : null, phone: u.phoneNumber,
    waOptIn: !!waOptIn, createdAt: prev && prev.createdAt ? prev.createdAt : serverTimestamp(), updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, 'users', u.uid), p);
  cacheProfile(u.uid, p);
  return p;
}
