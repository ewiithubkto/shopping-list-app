import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBywgUCci65CGex9mAk7SFEM6_HHdZzXK8",
  authDomain: "shopping-sync.firebaseapp.com",
  projectId: "shopping-sync",
  storageBucket: "shopping-sync.firebasestorage.app",
  messagingSenderId: "338784265061",
  appId: "1:338784265061:web:b22c1a50330d02f6a6778c"
};

// init
const app = initializeApp(firebaseConfig);

// Firestore
export const db = getFirestore(app);

// Auth (анонимная авторизация)
const auth = getAuth(app);
signInAnonymously(auth).catch((error) => {
  console.error("Auth error:", error);
});