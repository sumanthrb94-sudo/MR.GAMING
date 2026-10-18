// Firebase pieces the public booking form needs (bundled by scripts/build-firebase.mjs).
// Firestore Lite: no live listeners, much smaller; the form re-reads slots when the day changes and before sending.
export { initializeApp } from 'firebase/app';
export { getFirestore, collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore/lite';
