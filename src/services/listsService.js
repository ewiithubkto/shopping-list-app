import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";

const LISTS_PATH = "lists";

export function subscribeToLists(db, onNext, onError) {
  const listsRef = collection(db, LISTS_PATH);
  return onSnapshot(listsRef, onNext, onError);
}

export function createList(db, payload) {
  const listsRef = collection(db, LISTS_PATH);
  return addDoc(listsRef, payload);
}

export function updateList(db, listId, payload) {
  const listRef = doc(db, LISTS_PATH, listId);
  return updateDoc(listRef, payload);
}

export function deleteListById(db, listId) {
  const listRef = doc(db, LISTS_PATH, listId);
  return deleteDoc(listRef);
}
