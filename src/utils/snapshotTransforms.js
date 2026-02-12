export function resolveCatalogEntriesFromSnapshotData(rawData, dedupeCatalog) {
  const rawEntries =
    rawData && typeof rawData === "object"
      ? rawData.entries ?? rawData
      : null;

  if (Array.isArray(rawEntries)) {
    return dedupeCatalog(rawEntries);
  }

  if (rawEntries && typeof rawEntries === "object") {
    return dedupeCatalog(Object.values(rawEntries));
  }

  return [];
}

export function resolveListEntryFromDoc(listDoc, deps) {
  const {
    currentUser,
    normalizedCurrentUserEmail,
    normalizeListEntry,
    isFamilyListName,
    normalizeEmailValue,
  } = deps;

  if (!listDoc?.exists?.()) {
    return {
      entry: null,
      docId: listDoc?.id ?? null,
      shouldUpdateMembers: false,
      normalizedMembers: [],
    };
  }

  const value = listDoc.data();
  if (!value) {
    return {
      entry: null,
      docId: listDoc.id ?? null,
      shouldUpdateMembers: false,
      normalizedMembers: [],
    };
  }

  const rawMembers = Array.isArray(value.members) ? value.members : [];
  const trimmedRawMembers = rawMembers
    .map((member) => (member ?? "").toString().trim())
    .filter(Boolean);
  const normalizedRawMembers = trimmedRawMembers
    .map((member) => normalizeEmailValue(member))
    .filter(Boolean);
  const isFamilyList = isFamilyListName(value.name);

  const hasCurrentInRaw =
    normalizedCurrentUserEmail &&
    normalizedRawMembers.some((member) => member === normalizedCurrentUserEmail);

  if (!isFamilyList && !hasCurrentInRaw) {
    return {
      entry: null,
      docId: listDoc.id ?? null,
      shouldUpdateMembers: false,
      normalizedMembers: [],
    };
  }

  const entry = normalizeListEntry(listDoc.id, value, currentUser);
  if (!entry) {
    return {
      entry: null,
      docId: listDoc.id ?? null,
      shouldUpdateMembers: false,
      normalizedMembers: [],
    };
  }

  const shouldUpdateMembers =
    entry.members.length !== trimmedRawMembers.length ||
    entry.members.some(
      (member, index) =>
        normalizeEmailValue(member) !== normalizeEmailValue(trimmedRawMembers[index])
    );

  return {
    entry,
    docId: listDoc.id ?? null,
    shouldUpdateMembers,
    normalizedMembers: entry.members,
  };
}

export function dedupeAndPreferLists(entries, deps) {
  const {
    isFamilyListName,
    shouldPreferFamilyEntry,
    normalizeName,
    preferredActiveListId,
  } = deps;

  const uniqueById = [];
  const seenIds = new Set();
  let familyListIndex = null;

  entries.forEach((entry) => {
    if (!entry) return;

    if (isFamilyListName(entry.name)) {
      if (familyListIndex === null) {
        uniqueById.push(entry);
        familyListIndex = uniqueById.length - 1;
      } else if (
        shouldPreferFamilyEntry(
          uniqueById[familyListIndex],
          entry,
          preferredActiveListId
        )
      ) {
        uniqueById[familyListIndex] = entry;
      }
      return;
    }

    const key = entry.id ?? normalizeName(entry.name) ?? `list-${uniqueById.length}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);
    uniqueById.push(entry);
  });

  return uniqueById;
}

export function resolveItemsFromRawStore(raw, normalizeItem) {
  if (Array.isArray(raw)) {
    return raw
      .map((item, index) => normalizeItem(item, `array-${index}`))
      .filter(Boolean);
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw)
      .map(([itemId, item]) => normalizeItem(item, itemId))
      .filter(Boolean);
  }

  return [];
}

export function buildUserDirectoryFromSnapshot(snapshot, options) {
  const { decodeEmailKey, isValidEmail, normalizeEmailValue } = options;
  const directory = {};

  snapshot.docs.forEach((userDoc) => {
    const value = userDoc.data();
    if (!value || typeof value !== "object") return;
    const rawEmail =
      (value.email ?? decodeEmailKey(userDoc.id))?.toString().trim() ?? "";
    const rawName = (value.name ?? value.displayName ?? "")
      .toString()
      .trim();
    if (!isValidEmail(rawEmail)) return;

    const normalizedEmail = normalizeEmailValue(rawEmail);
    directory[normalizedEmail] = {
      email: rawEmail,
      name: rawName,
    };
  });

  return directory;
}
