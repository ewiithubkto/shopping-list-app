import { doc, onSnapshot, setDoc } from "firebase/firestore";

const CATALOG_COLLECTION = "shopping";
const CATALOG_DOCUMENT = "catalog";

function getCatalogDocRef(db) {
  return doc(db, CATALOG_COLLECTION, CATALOG_DOCUMENT);
}

export function subscribeToCatalog(db, onNext, onError) {
  return onSnapshot(getCatalogDocRef(db), onNext, onError);
}

export function setCatalogEntries(db, entries) {
  return setDoc(getCatalogDocRef(db), { entries });
}
