import { describe, expect, it, vi } from "vitest";
import { isValidEmail } from "../validation";
import { normalizeEmailValue } from "../email";
import { normalizeName, normalizeItem } from "../items";
import {
  isFamilyListName,
  normalizeListEntry,
  shouldPreferFamilyEntry,
} from "../lists";
import {
  buildUserDirectoryFromSnapshot,
  dedupeAndPreferLists,
  resolveCatalogEntriesFromSnapshotData,
  resolveItemsFromRawStore,
  resolveListEntryFromDoc,
} from "../snapshotTransforms";

describe("resolveItemsFromRawStore", () => {
  it("returns [] for null/undefined", () => {
    expect(resolveItemsFromRawStore(null, normalizeItem)).toEqual([]);
    expect(resolveItemsFromRawStore(undefined, normalizeItem)).toEqual([]);
  });

  it("normalizes array entries", () => {
    const result = resolveItemsFromRawStore([{ name: "Milk" }], normalizeItem);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("array-0");
    expect(result[0].name).toBe("Milk");
  });

  it("normalizes object-record entries using record keys", () => {
    const result = resolveItemsFromRawStore(
      {
        "id-1": { name: "Milk" },
      },
      normalizeItem
    );

    expect(result).toEqual([
      {
        id: "id-1",
        name: "Milk",
        bought: false,
        category: "Другое",
        active: true,
      },
    ]);
  });
});

describe("resolveCatalogEntriesFromSnapshotData", () => {
  it("returns [] for invalid data", () => {
    const dedupe = vi.fn();
    expect(resolveCatalogEntriesFromSnapshotData(null, dedupe)).toEqual([]);
    expect(dedupe).not.toHaveBeenCalled();
  });

  it("calls dedupe and returns its result", () => {
    const dedupe = vi.fn((entries) => entries);
    const rawData = { entries: [{ name: "Milk", category: "Dairy" }] };

    const result = resolveCatalogEntriesFromSnapshotData(rawData, dedupe);

    expect(dedupe).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ name: "Milk", category: "Dairy" }]);
  });
});

describe("buildUserDirectoryFromSnapshot", () => {
  it("filters invalid emails and builds canonical keys", () => {
    const snapshot = {
      docs: [
        {
          id: "user@example,com",
          data: () => ({ name: "User" }),
        },
        {
          id: "bad,id",
          data: () => ({ email: "not-an-email", name: "Bad" }),
        },
      ],
    };

    const result = buildUserDirectoryFromSnapshot(snapshot, {
      decodeEmailKey: (key) => key.replace(/,/g, "."),
      isValidEmail,
      normalizeEmailValue,
    });

    expect(result).toEqual({
      "user@example.com": {
        email: "user@example.com",
        name: "User",
      },
    });
  });
});

describe("resolveListEntryFromDoc", () => {
  const deps = {
    currentUser: { email: "me@example.com" },
    normalizedCurrentUserEmail: normalizeEmailValue("me@example.com"),
    normalizeListEntry,
    isFamilyListName,
    normalizeEmailValue,
    isValidEmail,
  };

  it("hides non-family lists where current user is not a member", () => {
    const listDoc = {
      id: "list-1",
      exists: () => true,
      data: () => ({ name: "Work", members: ["other@example.com"], items: {} }),
    };

    const result = resolveListEntryFromDoc(listDoc, deps);

    expect(result.entry).toBeNull();
    expect(result.shouldUpdateMembers).toBe(false);
  });

  it("keeps family list visible and requests members update when normalized differs", () => {
    const listDoc = {
      id: "family-1",
      exists: () => true,
      data: () => ({ name: "Семейный список", members: [" other@example.com "], items: {} }),
    };

    const result = resolveListEntryFromDoc(listDoc, deps);

    expect(result.entry).not.toBeNull();
    expect(result.shouldUpdateMembers).toBe(true);
    expect(result.normalizedMembers).toEqual([
      "other@example.com",
      "me@example.com",
    ]);
  });

  it("does not request update when members already canonical", () => {
    const listDoc = {
      id: "family-2",
      exists: () => true,
      data: () => ({ name: "Семейный список", members: ["me@example.com"], items: {} }),
    };

    const result = resolveListEntryFromDoc(listDoc, deps);

    expect(result.entry).not.toBeNull();
    expect(result.shouldUpdateMembers).toBe(false);
  });
});

describe("dedupeAndPreferLists", () => {
  it("dedupes non-family entries by id", () => {
    const entries = [
      { id: "1", name: "A", members: [], items: {} },
      { id: "1", name: "A-dup", members: [], items: {} },
      { id: "2", name: "B", members: [], items: {} },
    ];

    const result = dedupeAndPreferLists(entries, {
      isFamilyListName,
      shouldPreferFamilyEntry,
      normalizeName,
      preferredActiveListId: null,
    });

    expect(result.map((entry) => entry.id)).toEqual(["1", "2"]);
  });

  it("prefers active family list entry", () => {
    const entries = [
      { id: "family-a", name: "Семейный список", members: [], items: {} },
      { id: "family-b", name: "Семейный список", members: [], items: {} },
    ];

    const result = dedupeAndPreferLists(entries, {
      isFamilyListName,
      shouldPreferFamilyEntry,
      normalizeName,
      preferredActiveListId: "family-b",
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("family-b");
  });
});
