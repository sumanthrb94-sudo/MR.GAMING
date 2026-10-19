// Firebase pieces for signed-in pages, shared by "My pass" (/pass) and the owner page (/admin) so the
// owner's redirect from /pass reuses the cached file (bundled by scripts/build-firebase.mjs).
// Auth: mobile number + SMS code. initializeAuth (not getAuth) leaves out the popup/redirect sign-in code we never use.
// Firestore Lite: plain HTTPS reads and writes, no live listeners; pages re-read on a timer instead.
import { getApp, _getProvider } from 'firebase/app';
export { initializeApp } from 'firebase/app';
export { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged } from 'firebase/auth';
export { getFirestore, collection, query, where, orderBy, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction, serverTimestamp, Timestamp, increment } from 'firebase/firestore/lite';
// The page's auth instance (after the page called initializeAuth); used by the test scripts
export const currentAuth = () => _getProvider(getApp(), 'auth').getImmediate();
