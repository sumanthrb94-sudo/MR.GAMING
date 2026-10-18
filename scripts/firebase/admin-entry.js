// Firebase pieces the owner page needs (bundled by scripts/build-firebase.mjs). Sign-in is by mobile number + SMS code.
export { initializeApp } from 'firebase/app';
export { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged } from 'firebase/auth';
export { getFirestore, collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction, serverTimestamp, Timestamp, increment } from 'firebase/firestore';
