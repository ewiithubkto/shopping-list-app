import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";

const LISTS_PATH = "lists";

function getListDocRef(db, listId) {
  return doc(db, LISTS_PATH, listId);
}

export function subscribeToListDocument(db, listId, onNext, onError) {
  return onSnapshot(getListDocRef(db, listId), onNext, onError);
}

export function initializeListItemsStore(db, listId) {
  return setDoc(getListDocRef(db, listId), { items: {} }, { merge: true });
}

export function syncListItems(db, listId, itemsRecord) {
  return updateDoc(getListDocRef(db, listId), { items: itemsRecord });
}
