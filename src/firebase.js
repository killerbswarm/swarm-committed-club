import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { 
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
  writeBatch, serverTimestamp, arrayUnion, arrayRemove 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB2EtoDSvphgDM0Ch0XIm0RcXxHFLj5ki0",
  authDomain: "committed-club.firebaseapp.com",
  projectId: "committed-club",
  storageBucket: "committed-club.firebasestorage.app",
  messagingSenderId: "471076847529",
  appId: "1:471076847529:web:11e90e1498dae993d74eb8",
  measurementId: "G-HMGFYYTQE5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { 
  app, auth, db, signInAnonymously, onAuthStateChanged,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
  writeBatch, serverTimestamp, arrayUnion, arrayRemove 
};