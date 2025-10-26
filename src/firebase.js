import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBygwUCci65CGex9mAk7SFEM6_HHdZzXK8",
  authDomain: "shopping-sync.firebaseapp.com",
  projectId: "shopping-sync",
  databaseURL: "https://shopping-sync-default-rtdb.europe-west1.firebasedatabase.app",
  storageBucket: "shopping-sync.firebasestorage.app",
  messagingSenderId: "338784265061",
  appId: "1:338784265061:web:b22c1a350330d2f6a6778c"
};

// init
const app = initializeApp(firebaseConfig);

// export Firestore DB
export const db = getFirestore(app);

// export Realtime DB
export const rtdb = getDatabase(app);