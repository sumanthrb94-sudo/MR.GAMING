/* Customer sign-in shared by the screens that save something: /book (book-account.js, the booking write) and food
   orders on /menu (order.js). Mobile number + SMS code (Firebase Phone Auth), with the same Firebase app and auth
   persistence as /pass (pass.js), so one sign-in serves every page. Loaded only when a visitor is about to book or
   opens the cart, so no first paint waits for it.
   firestore.rules accept a booking or a food order only with uid == the caller and phone == the verified number. */
import {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence,
  RecaptchaVerifier, signInWithPhoneNumber, signOut as fbSignOut, onAuthStateChanged, getFirestore
} from '/assets/vendor/firebase-account.0e285128.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
auth.languageCode = 'en';

let user = null, verifier = null, confirmation = null;
const listeners = new Set();
// The header's "Log in" button reads this hint (main.js) without loading Firebase
const hint = (u) => { try { if (u) localStorage.setItem('mg-auth', '1'); else localStorage.removeItem('mg-auth'); } catch (e) {} };
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
export const signOut = () => fbSignOut(auth);
