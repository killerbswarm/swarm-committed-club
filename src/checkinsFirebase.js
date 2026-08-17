import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, query, where } from "firebase/firestore";

const checkinsConfig = {
  apiKey: import.meta.env.VITE_CHECKINS_API_KEY,
  authDomain: import.meta.env.VITE_CHECKINS_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_CHECKINS_PROJECT_ID,
  storageBucket: import.meta.env.VITE_CHECKINS_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_CHECKINS_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_CHECKINS_APP_ID
};

const checkinsApp = initializeApp(checkinsConfig, "checkins");
export const checkinsDb = getFirestore(checkinsApp);
export { collection, onSnapshot, query, where };