import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: firestoreMocks.doc,
  onSnapshot: firestoreMocks.onSnapshot,
  setDoc: firestoreMocks.setDoc,
  updateDoc: firestoreMocks.updateDoc,
}));

import {
  initializeListItemsStore,
  subscribeToListDocument,
  syncListItems,
} from "../itemsService";

describe("itemsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes to a list document", () => {
    const db = { kind: "db" };
    const listId = "list-1";
    const onNext = vi.fn();
    const onError = vi.fn();
    const docRef = { path: "lists/list-1" };
    const unsubscribe = vi.fn();

    firestoreMocks.doc.mockReturnValue(docRef);
    firestoreMocks.onSnapshot.mockReturnValue(unsubscribe);

    const result = subscribeToListDocument(db, listId, onNext, onError);

    expect(firestoreMocks.doc).toHaveBeenCalledWith(db, "lists", listId);
    expect(firestoreMocks.onSnapshot).toHaveBeenCalledWith(
      docRef,
      onNext,
      onError
    );
    expect(result).toBe(unsubscribe);
  });

  it("initializes the items store with merge=true", () => {
    const db = { kind: "db" };
    const listId = "list-1";
    const docRef = { path: "lists/list-1" };

    firestoreMocks.doc.mockReturnValue(docRef);

    initializeListItemsStore(db, listId);

    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      docRef,
      { items: {} },
      { merge: true }
    );
  });

  it("syncs items by replacing the items field via updateDoc", () => {
    const db = { kind: "db" };
    const listId = "list-1";
    const docRef = { path: "lists/list-1" };
    const itemsRecord = {
      "item-1": { id: "item-1", name: "Milk", active: true, bought: false },
    };

    firestoreMocks.doc.mockReturnValue(docRef);

    syncListItems(db, listId, itemsRecord);

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(docRef, {
      items: itemsRecord,
    });
    expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
  });
});
