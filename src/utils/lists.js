import { normalizeEmailValue } from "./email";
import { normalizeName } from "./items";

const FAMILY_LIST_NAME = "Семейный список";

export function isFamilyListName(name) {
  return normalizeName(name ?? "") === normalizeName(FAMILY_LIST_NAME);
}

export function getListItemsCount(entry) {
  if (!entry || !entry.items) return 0;
  if (Array.isArray(entry.items)) {
    return entry.items.length;
  }
  if (typeof entry.items === "object") {
    return Object.keys(entry.items).length;
  }
  return 0;
}

export function shouldPreferFamilyEntry(existingEntry, candidateEntry, activeListId) {
  if (!candidateEntry) return false;
  if (!existingEntry) return true;

  if (candidateEntry.id === activeListId && existingEntry.id !== activeListId) {
    return true;
  }
  if (existingEntry.id === activeListId && candidateEntry.id !== activeListId) {
    return false;
  }

  const candidateItems = getListItemsCount(candidateEntry);
  const existingItems = getListItemsCount(existingEntry);
  if (candidateItems !== existingItems) {
    return candidateItems > existingItems;
  }

  const candidateMembers = Array.isArray(candidateEntry.members)
    ? candidateEntry.members.length
    : 0;
  const existingMembers = Array.isArray(existingEntry.members)
    ? existingEntry.members.length
    : 0;
  if (candidateMembers !== existingMembers) {
    return candidateMembers > existingMembers;
  }

  return false;
}

export function normalizeListEntry(id, value, currentUser) {
  if (!value) return null;

  const name = (value.name ?? "").toString().trim();
  const rawMembers = Array.isArray(value.members) ? value.members : [];
  const memberSet = new Map();
  rawMembers
    .map((member) => (member ?? "").toString().trim())
    .filter(Boolean)
    .forEach((member) => {
      const key = normalizeEmailValue(member);
      if (!key) return;
      if (!memberSet.has(key)) {
        memberSet.set(key, member);
      }
    });

  const currentEmail = (currentUser?.email ?? "").toString().trim();
  const normalizedCurrentEmail = normalizeEmailValue(currentEmail);

  if (normalizedCurrentEmail && !memberSet.has(normalizedCurrentEmail)) {
    memberSet.set(normalizedCurrentEmail, currentEmail);
  }

  const members = Array.from(memberSet.values());
  const items =
    value.items && typeof value.items === "object" ? value.items : {};

  const resolvedId =
    (value.id ?? id ?? "").toString().trim() || `list-${String(id)}`;

  return {
    id: resolvedId,
    name: name || "Без названия",
    members,
    items,
  };
}
