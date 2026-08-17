import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, query, where } from "firebase/firestore";

const checkinsConfig = {
  apiKey: "AIzaSyAw_6kK6yCNsNajjhPZODP3ESi-_bTxAWE",
  authDomain: "swarm-checkins-5436d.firebaseapp.com",
  projectId: "swarm-checkins-5436d",
  storageBucket: "swarm-checkins-5436d.firebasestorage.app",
  messagingSenderId: "340687259774",
  appId: "1:340687259774:web:6ec47937954538519f702f"
};

const checkinsApp = initializeApp(checkinsConfig, "checkins");
export const checkinsDb = getFirestore(checkinsApp);
export { collection, onSnapshot, query, where };
