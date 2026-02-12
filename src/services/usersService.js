import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { encodeEmailKey } from "../utils/email";

const USERS_PATH = "users";

export function subscribeToUsers(db, onNext, onError) {
  const usersRef = collection(db, USERS_PATH);
  return onSnapshot(usersRef, onNext, onError);
}

export function upsertUserProfile(db, profile) {
  const email = (profile?.email ?? "").toString().trim();
  const userRef = doc(db, USERS_PATH, encodeEmailKey(email));

  return setDoc(
    userRef,
    {
      email,
      name: (profile?.name ?? "").toString().trim(),
      updatedAt: profile?.updatedAt ?? Date.now(),
    },
    { merge: true }
  );
}
