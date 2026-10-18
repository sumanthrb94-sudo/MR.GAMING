// Firebase pieces the customer "My pass" page needs (bundled by scripts/build-firebase.mjs):
// sign-in by mobile number + SMS code, and Firestore Lite reads of the customer's own passes.
export { initializeApp } from 'firebase/app';
export { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged } from 'firebase/auth';
export { getFirestore, collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore/lite';
