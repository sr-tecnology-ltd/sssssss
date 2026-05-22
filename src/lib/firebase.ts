import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
// @ts-ignore
import firebaseConfig from '../../firebase-applet-config.json';

const configAny = firebaseConfig as any;
const app = initializeApp(firebaseConfig);
console.log('Firebase Init - Database ID:', configAny.firestoreDatabaseId || '(default)');
export const db = getFirestore(app, configAny.firestoreDatabaseId || undefined);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);

export { createUserWithEmailAndPassword, signInWithEmailAndPassword };
