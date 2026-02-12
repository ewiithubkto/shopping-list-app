import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Form from "./components/Form";
import List from "./components/List";
import MembersPanel from "./components/MembersPanel";
import ConfirmModal from "./components/ConfirmModal";
import UserSetup from "./components/UserSetup";
import { ToastProvider, useToast } from "./components/ToastProvider";
import baseCatalog from "./data/products.json";
import { db } from "./firebase";
import { useCatalogSubscription } from "./hooks/useCatalog";
import { useActiveListItemsSubscription } from "./hooks/useActiveListItems";
import { useListsSubscription } from "./hooks/useLists";
import { useMembersData } from "./hooks/useMembersData";
import { useUserProfileSync } from "./hooks/useUserProfileSync";
import { useUsersSubscription } from "./hooks/useUsers";
import { setCatalogEntries } from "./services/catalogService";
import {
  createList,
  deleteListById,
  updateList,
} from "./services/listsService";
import {
  initializeListItemsStore,
  syncListItems,
} from "./services/itemsService";
import { itemsArrayToRecord, normalizeItem, normalizeName } from "./utils/items";
import {
  isFamilyListName,
  normalizeListEntry,
  shouldPreferFamilyEntry,
} from "./utils/lists";
import { isValidEmail } from "./utils/validation";
import { decodeEmailKey, normalizeEmailValue } from "./utils/email";
import {
  areCatalogCollectionsEqual,
  areItemsCollectionsEqual,
} from "./utils/compare";
import {
  dedupeAndPreferLists,
  buildUserDirectoryFromSnapshot,
  resolveListEntryFromDoc,
  resolveItemsFromRawStore,
  resolveCatalogEntriesFromSnapshotData,
} from "./utils/snapshotTransforms";
import { dedupeCatalog, normalizeCatalogItem } from "./utils/catalog";
import "./styles/app.css";

const DEFAULT_CATEGORY = "Другое";
const FAMILY_LIST_NAME = "Семейный список";
const EMPTY_ITEMS = Object.freeze([]);
const USER_STORAGE_KEY = "shoppingListApp.currentUser";

function generateItemId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeUser(raw) {
  if (!raw || typeof raw !== "object") return null;

  const name = (raw.name ?? "").toString().trim();
  const email = (raw.email ?? "").toString().trim();

  if (!name || !email) return null;
  if (!isValidEmail(email)) return null;

  return {
    name,
    email,
  };
}

function loadStoredUser() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeUser(parsed);
  } catch (error) {
    console.warn("Failed to load stored user", error);
    return null;
  }
}

function persistUser(user) {
  if (typeof window === "undefined") return;

  try {
    const normalized = normalizeUser(user);
    if (!normalized) {
      window.localStorage.removeItem(USER_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify(normalized)
    );
  } catch (error) {
    console.warn("Failed to persist user", error);
  }
}

const INITIAL_CATALOG = dedupeCatalog(baseCatalog, {
  normalizeName,
  defaultCategory: DEFAULT_CATEGORY,
});

function AppContent() {
  const { showToast } = useToast();
  const [currentUser, setCurrentUser] = useState(() => loadStoredUser());
  const [itemsState, setItemsState] = useState({ listId: null, data: [] });
  const [catalog, setCatalog] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState(null);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListMembers, setNewListMembers] = useState("");
  const [isSubmittingList, setIsSubmittingList] = useState(false);
  const [isRenamingList, setIsRenamingList] = useState(false);
  const [renameListValue, setRenameListValue] = useState("");
  const [isRenamingSubmitting, setIsRenamingSubmitting] = useState(false);
  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [userDirectory, setUserDirectory] = useState({});
  const [pendingMemberRemoval, setPendingMemberRemoval] = useState(null);

  const activeList =
    lists.find((list) => list.id === activeListId) ?? null;
  const isFamilyList = isFamilyListName(activeList?.name);
  const activeMembers = Array.isArray(activeList?.members)
    ? activeList.members
    : EMPTY_ITEMS;
  const items = useMemo(() => {
    if (itemsState.listId !== activeListId) {
      return EMPTY_ITEMS;
    }
    return itemsState.data;
  }, [itemsState, activeListId]);
  const isSyncedRef = useRef(false);
  const lastSyncedRef = useRef([]);
  const isCatalogSyncedRef = useRef(false);
  const lastCatalogSyncedRef = useRef([]);
  const hasSeededCatalogRef = useRef(false);
  const hasSeededDefaultListRef = useRef(false);
  const currentItemsListIdRef = useRef(null);
  const activeListIdRef = useRef(null);
  const listsRef = useRef([]);
  const normalizedCurrentUserEmail = useMemo(() => {
    const email = (currentUser?.email ?? "").toString().trim();
    return normalizeEmailValue(email);
  }, [currentUser]);

  const allKnownUserEmails = useMemo(() => {
    const entries = Object.values(userDirectory ?? {});
    const normalizedSet = new Set();
    const resolved = [];

    entries.forEach((profile) => {
      if (!profile) return;
      const rawEmail = (profile.email ?? "").toString().trim();
      if (!isValidEmail(rawEmail)) return;
      const normalized = normalizeEmailValue(rawEmail);
      if (!normalized || normalizedSet.has(normalized)) return;
      normalizedSet.add(normalized);
      resolved.push(rawEmail);
    });

    const currentEmail = (currentUser?.email ?? "").toString().trim();
    if (isValidEmail(currentEmail)) {
      const normalized = normalizeEmailValue(currentEmail);
      if (normalized && !normalizedSet.has(normalized)) {
        normalizedSet.add(normalized);
        resolved.push(currentEmail);
      }
    }

    return resolved;
  }, [userDirectory, currentUser]);

  const membersForDisplay = isFamilyList ? allKnownUserEmails : activeMembers;
  const currentUserName = (currentUser?.name ?? "").toString().trim();

  const {
    memberEntries,
    availableInviteOptions,
    totalMembersCount,
    normalizedMemberSet,
  } = useMembersData({
    members: membersForDisplay,
    currentUserEmail: currentUser?.email ?? "",
    userDirectory,
  });

  const totalKnownUsersCount = useMemo(() => {
    const directoryKeys = Object.keys(userDirectory ?? {});
    if (!normalizedCurrentUserEmail) {
      return directoryKeys.length;
    }

    return directoryKeys.includes(normalizedCurrentUserEmail)
      ? directoryKeys.length
      : directoryKeys.length + 1;
  }, [userDirectory, normalizedCurrentUserEmail]);

  const displayedMembersCount = isFamilyList
    ? totalKnownUsersCount
    : totalMembersCount;

  useEffect(() => {
    persistUser(currentUser);
  }, [currentUser]);

  useEffect(() => {
    activeListIdRef.current = activeListId;
  }, [activeListId]);

  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);

  useUserProfileSync({ db, currentUser });

  function updateActiveListItems(updater) {
    if (!activeListId) return;

    setItemsState((prev) => {
      const prevData =
        prev.listId === activeListId ? prev.data : [];
      const nextData =
        typeof updater === "function" ? updater(prevData) : updater;

      if (!Array.isArray(nextData)) {
        return prev;
      }

      if (
        prev.listId === activeListId &&
        (nextData === prevData || areItemsCollectionsEqual(prevData, nextData))
      ) {
        return prev;
      }

      return {
        listId: activeListId,
        data: nextData,
      };
    });
  }

  function handleUserSetupSubmit(user) {
    const normalized = normalizeUser(user);
    if (!normalized) return;

    setCurrentUser(normalized);
    hasSeededDefaultListRef.current = false;
    setLists([]);
    setActiveListId(null);
    setItemsState({ listId: null, data: [] });
    isSyncedRef.current = false;
    lastSyncedRef.current = [];
    currentItemsListIdRef.current = null;
  }

  useEffect(() => {
    if (!activeList) {
      setIsRenamingList(false);
      setRenameListValue("");
      return;
    }
    setRenameListValue(activeList.name || "");
  }, [activeListId, activeList]);

  useEffect(() => {
    setIsInvitingMember(false);
    setPendingMemberRemoval(null);
  }, [activeListId]);

  function upsertCatalogEntry(name, category = DEFAULT_CATEGORY) {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const resolvedCategory = category || DEFAULT_CATEGORY;
    const normName = normalizeName(trimmedName);

    const normalizedEntry = normalizeCatalogItem(
      {
        name: trimmedName,
        category: resolvedCategory,
      },
      DEFAULT_CATEGORY
    );
    if (!normalizedEntry) return;

    setCatalog((prev) => {
      const index = prev.findIndex(
        (entry) => normalizeName(entry.name) === normName
      );

      if (index === -1) {
        return [...prev, normalizedEntry];
      }

      const existingEntry = prev[index];
      if (
        existingEntry.name === normalizedEntry.name &&
        existingEntry.category === normalizedEntry.category
      ) {
        return prev;
      }

      const next = [...prev];
      next[index] = normalizedEntry;
      return next;
    });
  }

  function removeCatalogEntry(
    name,
    category = DEFAULT_CATEGORY,
    linkedItemId = null
  ) {
    const normName = normalizeName(name);
    const normCategory = normalizeName(category || DEFAULT_CATEGORY);

    setCatalog((prev) => {
      const next = prev.filter(
        (entry) =>
          !(
            normalizeName(entry.name) === normName &&
            normalizeName(entry.category || DEFAULT_CATEGORY) === normCategory
          )
      );

      return next.length === prev.length ? prev : next;
    });

    if (!activeListId) return;

    updateActiveListItems((prev) => {
      const next = prev.filter((item) => {
        if (linkedItemId && item.id === linkedItemId) {
          return false;
        }

        return !(
          normalizeName(item.name) === normName &&
          normalizeName(item.category || DEFAULT_CATEGORY) === normCategory
        );
      });

      return next.length === prev.length ? prev : next;
    });
  }

  function deleteEntry(entry) {
    if (!entry) return;

    const entryName = (entry.name ?? "").toString().trim();
    if (!entryName) return;

    const entryCategory =
      entry.category ?? entry.linkedItem?.category ?? DEFAULT_CATEGORY;
    const linkedItemId =
      entry.linkedItem?.id ??
      (typeof entry.id === "number" ? entry.id : null);

    removeCatalogEntry(entryName, entryCategory, linkedItemId);
  }

  async function handleCreateListSubmit(event) {
    event.preventDefault();
    if (isSubmittingList) return;
    if (!currentUser || !currentUser.email) return;

    const trimmedName = newListName.trim();
    if (!trimmedName) return;

    const additionalMembers = newListMembers
      .split(",")
      .map((email) => email.trim())
      .filter((email) => isValidEmail(email));

    const primaryEmail = (currentUser.email ?? "").toString().trim();

    const uniqueMembers = [];
    const seenMembers = new Set();
    [primaryEmail, ...additionalMembers].forEach((email) => {
      const normalized = email.trim();
      if (!normalized) return;
      if (!isValidEmail(normalized)) return;
      const key = normalizeEmailValue(normalized);
      if (seenMembers.has(key)) return;
      seenMembers.add(key);
      uniqueMembers.push(normalized);
    });

    const payload = {
      name: trimmedName,
      members: uniqueMembers,
      items: {},
    };

    try {
      setIsSubmittingList(true);
      const newListRef = await createList(db, payload);
      const newId = newListRef.id;

      const normalized = normalizeListEntry(newId, payload, currentUser);
      if (normalized) {
        setLists((prev) => {
          const exists = prev.some((list) => list.id === normalized.id);
          if (exists) {
            return prev.map((list) =>
              list.id === normalized.id ? normalized : list
            );
          }
          return [...prev, normalized];
        });
      }

      if (newId) {
        setActiveListId(newId);
      }

      setIsCreatingList(false);
      setNewListName("");
      setNewListMembers("");
      showToast({
        type: "success",
        message: `Список "${trimmedName}" создан.`,
      });
    } catch (error) {
      console.error("Failed to create list", error);
      showToast({
        type: "error",
        message: "Не удалось создать список. Попробуйте ещё раз.",
      });
    } finally {
      setIsSubmittingList(false);
    }
  }

  async function handleRenameListSubmit(event) {
    event.preventDefault();
    if (!activeListId || !activeList) {
      setIsRenamingList(false);
      return;
    }
    if (isRenamingSubmitting) return;

    const trimmed = renameListValue.trim();
    if (!trimmed) return;
    if (trimmed === activeList.name) {
      setIsRenamingList(false);
      return;
    }

    try {
      setIsRenamingSubmitting(true);
      await updateList(db, activeListId, { name: trimmed });
      setLists((prev) =>
        prev.map((list) =>
          list.id === activeListId ? { ...list, name: trimmed } : list
        )
      );
      setIsRenamingList(false);
      showToast({
        type: "success",
        message: "Название списка обновлено.",
      });
    } catch (error) {
      console.error("Failed to rename list", error);
      showToast({
        type: "error",
        message: "Не удалось переименовать список.",
      });
    } finally {
      setIsRenamingSubmitting(false);
    }
  }

  function handleRenameCancel() {
    setIsRenamingList(false);
    if (activeList) {
      setRenameListValue(activeList.name || "");
    }
  }

  async function handleDeleteList() {
    if (!activeListId) return;
    const listName = activeList?.name ?? "Список";
    const confirmDelete =
      typeof window === "undefined" ||
      window.confirm("Удалить текущий список?");

    if (!confirmDelete) return;

    try {
      await deleteListById(db, activeListId);
      showToast({
        type: "success",
        message: `Список "${listName}" удалён.`,
      });
    } catch (error) {
      console.error("Failed to delete list", error);
      showToast({
        type: "error",
        message: "Не удалось удалить список. Попробуйте ещё раз.",
      });
      return;
    }

    setIsRenamingList(false);
    setRenameListValue("");
    setItemsState({ listId: null, data: [] });
    isSyncedRef.current = false;
    lastSyncedRef.current = [];
    currentItemsListIdRef.current = null;
    setLists((prev) => prev.filter((list) => list.id !== activeListId));
    setActiveListId((prevActiveId) => {
      if (prevActiveId !== activeListId) return prevActiveId;
      const nextLists = listsRef.current.filter((list) => list.id !== activeListId);
      return nextLists[0]?.id ?? null;
    });
  }

  async function handleInviteMember(email) {
    if (!activeListId || !activeList) {
      throw new Error("Сначала выберите список.");
    }

    const trimmed = (email ?? "").toString().trim();
    if (!trimmed) {
      throw new Error("Выберите участника из списка.");
    }
    if (!isValidEmail(trimmed)) {
      throw new Error("Проверьте формат email.");
    }

    const normalized = normalizeEmailValue(trimmed);
    if (normalizedMemberSet.has(normalized)) {
      throw new Error("Этот участник уже в списке.");
    }

    const existingMembers = Array.isArray(activeList.members)
      ? activeList.members
      : [];
    const nextMembers = [...existingMembers, trimmed];

    try {
      setIsInvitingMember(true);
      await updateList(db, activeListId, { members: nextMembers });
      setLists((prev) =>
        prev.map((list) =>
          list.id === activeListId ? { ...list, members: nextMembers } : list
        )
      );
      const displayName =
        (userDirectory[normalized]?.name ?? "").toString().trim() || trimmed;
      showToast({
        type: "success",
        message: `Приглашение отправлено: ${displayName}.`,
      });
      return trimmed;
    } catch (error) {
      console.error("Failed to invite member", error);
      const message = "Не удалось пригласить участника. Попробуйте ещё раз.";
      showToast({ type: "error", message });
      throw new Error(message);
    } finally {
      setIsInvitingMember(false);
    }
  }

  function requestMemberRemoval(memberEmail, memberName = "") {
    const trimmedEmail = (memberEmail ?? "").toString().trim();
    if (!trimmedEmail) return;

    const normalizedEmail = normalizeEmailValue(trimmedEmail);
    if (
      !normalizedEmail ||
      normalizedEmail === normalizedCurrentUserEmail ||
      !isValidEmail(trimmedEmail)
    ) {
      return;
    }

    const displayName =
      (memberName ?? "").toString().trim() || trimmedEmail;

    setPendingMemberRemoval({
      email: trimmedEmail,
      normalizedEmail,
      displayName,
    });
  }

  async function removeMember(memberEmail, memberName = "") {
    if (!activeListId || !activeList) return;

    const trimmed = (memberEmail ?? "").toString().trim();
    if (!trimmed) return;

    const normalizedTarget = normalizeEmailValue(trimmed);
    if (!normalizedTarget || normalizedTarget === normalizedCurrentUserEmail) {
      return;
    }

    const existingMembers = Array.isArray(activeList.members)
      ? activeList.members
      : [];
    const nextMembers = existingMembers.filter(
      (member) => normalizeEmailValue(member) !== normalizedTarget
    );

    if (nextMembers.length === existingMembers.length) {
      return;
    }

    try {
      setIsInvitingMember(true);
      await updateList(db, activeListId, { members: nextMembers });
      setLists((prev) =>
        prev.map((list) =>
          list.id === activeListId ? { ...list, members: nextMembers } : list
        )
      );
      const display = memberName || trimmed;
      showToast({
        type: "success",
        message: `Участник ${display} удалён.`,
      });
    } catch (error) {
      console.error("Failed to remove member", error);
      showToast({
        type: "error",
        message: "Не удалось удалить участника. Попробуйте ещё раз.",
      });
    } finally {
      setIsInvitingMember(false);
    }
  }

  async function handleConfirmRemoveMember() {
    if (!pendingMemberRemoval) return;
    try {
      await removeMember(
        pendingMemberRemoval.email,
        pendingMemberRemoval.displayName
      );
    } finally {
      setPendingMemberRemoval(null);
    }
  }

  function handleCancelRemoveMember() {
    if (isInvitingMember) return;
    setPendingMemberRemoval(null);
  }

  function addItem(name, category = DEFAULT_CATEGORY) {
    if (!activeListId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const resolvedCategory = category || DEFAULT_CATEGORY;
    const norm = normalizeName(trimmed);
    const resolvedCategoryNorm = normalizeName(resolvedCategory);

    upsertCatalogEntry(trimmed, resolvedCategory);

    const existing =
      items.find(
        (it) =>
          normalizeName(it.name) === norm &&
          normalizeName(it.category || DEFAULT_CATEGORY) ===
            resolvedCategoryNorm
      ) ?? items.find((it) => normalizeName(it.name) === norm);

    if (existing) {
      if (
        existing.bought ||
        !existing.active ||
        existing.category !== resolvedCategory
      ) {
        updateActiveListItems((prev) =>
          prev.map((it) =>
            it.id === existing.id
              ? {
                  ...it,
                  bought: false,
                  active: true,
                  category: resolvedCategory,
                }
              : it
          )
        );
      }
      return;
    }

    updateActiveListItems((prev) => [
      ...prev,
      {
        id: generateItemId(),
        name: trimmed,
        bought: false,
        category: resolvedCategory,
        active: true,
      },
    ]);
  }

  function handleActiveChange(name, category, shouldBeActive) {
    if (!activeListId) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const resolvedCategory = category || DEFAULT_CATEGORY;
    const resolvedCategoryNorm = normalizeName(resolvedCategory);
    const norm = normalizeName(trimmed);

    if (shouldBeActive) {
      upsertCatalogEntry(trimmed, resolvedCategory);
    }

    updateActiveListItems((prev) => {
      const existing =
        prev.find(
          (it) =>
            normalizeName(it.name) === norm &&
            normalizeName(it.category || DEFAULT_CATEGORY) ===
              resolvedCategoryNorm
        ) ?? prev.find((it) => normalizeName(it.name) === norm);

      if (existing) {
        if (
          existing.active === shouldBeActive &&
          existing.category === resolvedCategory &&
          (shouldBeActive || existing.bought === false)
        ) {
          return prev;
        }

        return prev.map((it) =>
          it.id === existing.id
            ? {
                ...it,
                active: shouldBeActive,
                bought: false,
                category: resolvedCategory,
              }
            : it
        );
      }

      if (!shouldBeActive) return prev;

      return [
        ...prev,
        {
          id: generateItemId(),
          name: trimmed,
          bought: false,
          category: resolvedCategory,
          active: true,
        },
      ];
    });
  }

  function handlePurchase(id) {
    if (!activeListId) return;
    updateActiveListItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, bought: true, active: false } : item
      )
    );
  }

  useEffect(() => {
    if (currentUser && currentUser.email) return;
    setLists([]);
    setActiveListId(null);
  }, [currentUser]);

  const handleListsSnapshot = useCallback(
    (snapshot) => {
      if (!currentUser || !currentUser.email) return;

      const resolvedWithMeta = snapshot.docs.map((listDoc) =>
        resolveListEntryFromDoc(listDoc, {
          currentUser,
          normalizedCurrentUserEmail,
          normalizeListEntry,
          isFamilyListName,
          normalizeEmailValue,
          isValidEmail,
        })
      );

      resolvedWithMeta
        .filter((meta) => meta.shouldUpdateMembers && meta.docId)
        .forEach((meta) => {
          updateList(db, meta.docId, { members: meta.normalizedMembers }).catch(
            (error) => {
              console.error("Failed to update members", error);
            }
          );
        });

      const resolved = resolvedWithMeta
        .filter((meta) => meta.entry)
        .map((meta) => meta.entry);

      const preferredActiveListId = activeListIdRef.current;
      const uniqueById = dedupeAndPreferLists(resolved, {
        isFamilyListName,
        shouldPreferFamilyEntry,
        normalizeName,
        preferredActiveListId,
      });

      setLists(uniqueById);

      if (!hasSeededDefaultListRef.current) {
        const alreadyHasDefault = resolved.some((entry) =>
          isFamilyListName(entry.name)
        );

        if (alreadyHasDefault) {
          return;
        }

        hasSeededDefaultListRef.current = true;

        const payload = {
          name: FAMILY_LIST_NAME,
          members: [(currentUser.email ?? "").toString().trim()],
          items: {},
        };

        createList(db, payload)
          .then((newDoc) => {
            const newId = newDoc.id;
            if (newId) {
              const normalized = normalizeListEntry(newId, payload, currentUser);
              if (normalized) {
                setLists((prev) => {
                  if (prev.some((list) => list.id === normalized.id)) {
                    return prev;
                  }
                  return [...prev, normalized];
                });
              }
              setActiveListId(newId);
            }
          })
          .catch((error) => {
            console.error("Failed to create default list", error);
            hasSeededDefaultListRef.current = false;
          });
      }
    },
    [currentUser, normalizedCurrentUserEmail]
  );

  useListsSubscription({
    db,
    enabled: Boolean(currentUser?.email),
    onSnapshot: handleListsSnapshot,
    onError: (error) => {
      console.error("Failed to subscribe lists", error);
    },
  });

  useEffect(() => {
    if (!lists || lists.length === 0) {
      setActiveListId(null);
      return;
    }

    setActiveListId((prev) => {
      const exists = prev && lists.some((list) => list.id === prev);
      return exists ? prev : lists[0].id;
    });
  }, [lists]);

  useEffect(() => {
    if (activeTab === "shopping") {
      setIsCreatingList(false);
      setNewListName("");
      setNewListMembers("");
    }
    if (activeTab !== "shopping") {
      setIsRenamingList(false);
    }
    if (activeTab !== "all") {
      setPendingMemberRemoval(null);
    }
  }, [activeTab]);

  const handleCatalogSnapshot = useCallback((snapshot) => {
    const rawData = snapshot.data();

    if (!snapshot.exists()) {
      if (hasSeededCatalogRef.current) return;

      hasSeededCatalogRef.current = true;
      lastCatalogSyncedRef.current = INITIAL_CATALOG;
      isCatalogSyncedRef.current = true;
      setCatalog(INITIAL_CATALOG);
      setCatalogEntries(db, INITIAL_CATALOG).catch((error) => {
        console.error("Failed to seed catalog", error);
      });
      return;
    }

    const resolved = resolveCatalogEntriesFromSnapshotData(
      rawData,
      (entries) =>
        dedupeCatalog(entries, {
          normalizeName,
          defaultCategory: DEFAULT_CATEGORY,
        })
    );

    if (resolved.length === 0 && !hasSeededCatalogRef.current) {
      hasSeededCatalogRef.current = true;
      lastCatalogSyncedRef.current = INITIAL_CATALOG;
      isCatalogSyncedRef.current = true;
      setCatalog(INITIAL_CATALOG);
      setCatalogEntries(db, INITIAL_CATALOG).catch((error) => {
        console.error("Failed to seed empty catalog", error);
      });
      return;
    }

    hasSeededCatalogRef.current =
      hasSeededCatalogRef.current || resolved.length > 0;
    lastCatalogSyncedRef.current = resolved;
    isCatalogSyncedRef.current = true;
    setCatalog(resolved);
  }, []);

  useCatalogSubscription({
    db,
    onSnapshot: handleCatalogSnapshot,
    onError: (error) => {
      console.error("Failed to subscribe catalog", error);
    },
  });

  useEffect(() => {
    return () => {
      isCatalogSyncedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isCatalogSyncedRef.current) return;
    if (areCatalogCollectionsEqual(lastCatalogSyncedRef.current, catalog)) return;

    lastCatalogSyncedRef.current = catalog;
    setCatalogEntries(db, catalog).catch((error) => {
      console.error("Failed to sync catalog", error);
    });
  }, [catalog]);

  const handleInactiveListItems = useCallback(() => {
    isSyncedRef.current = false;
    lastSyncedRef.current = [];
    currentItemsListIdRef.current = null;
    setItemsState({ listId: null, data: [] });
  }, []);

  const handleBeforeListItemsSubscribe = useCallback((listId) => {
    if (currentItemsListIdRef.current !== listId) {
      isSyncedRef.current = false;
      lastSyncedRef.current = [];
      setItemsState({ listId, data: [] });
    }
    currentItemsListIdRef.current = listId;
  }, []);

  const handleListItemsSnapshot = useCallback((listId, snapshot) => {
      const data = snapshot.data();
      const raw = data?.items ?? null;
      const resolved = resolveItemsFromRawStore(raw, normalizeItem);

      if ((raw === null || raw === undefined) && snapshot.exists()) {
        initializeListItemsStore(db, listId).catch((error) => {
          console.error("Failed to initialize items store", error);
        });
      }

      lastSyncedRef.current = resolved;
      isSyncedRef.current = true;
      setItemsState({ listId, data: resolved });
    }, []);

  const handleListItemsCleanup = useCallback((listId) => {
    if (currentItemsListIdRef.current === listId) {
      currentItemsListIdRef.current = null;
      isSyncedRef.current = false;
    }
  }, []);

  useActiveListItemsSubscription({
    db,
    activeListId,
    onInactive: handleInactiveListItems,
    onBeforeSubscribe: handleBeforeListItemsSubscribe,
    onSnapshot: handleListItemsSnapshot,
    onCleanup: handleListItemsCleanup,
    onError: (error) => {
      console.error("Failed to subscribe active list items", error);
    },
  });

  useEffect(() => {
    if (!activeListId) return;
    if (itemsState.listId !== activeListId) return;
    if (!isSyncedRef.current) return;
    if (areItemsCollectionsEqual(lastSyncedRef.current, items)) return;

    lastSyncedRef.current = items;
    syncListItems(db, activeListId, itemsArrayToRecord(items)).catch((error) => {
      console.error("Failed to sync items", error);
    });
  }, [items, itemsState.listId, activeListId]);

  useUsersSubscription({
    db,
    onSnapshot: (snapshot) => {
      const directory = buildUserDirectoryFromSnapshot(snapshot, {
        decodeEmailKey,
        isValidEmail,
        normalizeEmailValue,
      });
      setUserDirectory(directory);
    },
    onError: (error) => {
      console.error("Failed to subscribe users", error);
    },
  });

  const isShoppingTab = activeTab === "shopping";
  const isAllTab = activeTab === "all";
  if (!currentUser) {
    return (
      <div className="app-wrapper">
        <UserSetup onSubmit={handleUserSetupSubmit} />
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <div className="app-title-card">
        {currentUserName && (
          <div className="app-current-user-pill">{currentUserName}</div>
        )}
        <div className={`app-title-header${isShoppingTab ? "" : " is-catalog"}`}>
          {isShoppingTab && isRenamingList && activeList ? (
            <form
              className="app-title-rename"
              onSubmit={handleRenameListSubmit}
            >
              <input
                type="text"
                className="app-title-input"
                value={renameListValue}
                onChange={(event) => setRenameListValue(event.target.value)}
                disabled={isRenamingSubmitting}
                required
              />
              <button
                type="submit"
                className="app-title-save"
                disabled={isRenamingSubmitting || !renameListValue.trim()}
                title="Сохранить"
                aria-label="Сохранить название списка"
              >
                💾
              </button>
              <button
                type="button"
                className="app-title-cancel"
                onClick={handleRenameCancel}
                disabled={isRenamingSubmitting}
                title="Отмена"
                aria-label="Отменить переименование списка"
              >
                ✖️
              </button>
            </form>
          ) : (
            <div className="app-title-row">
              <div className="app-title-content">
                <h1 className="app-title">
                  {isShoppingTab
                    ? activeList?.name || "План покупок"
                    : "План покупок"}
                </h1>
                {lists.length > 0 && (
                  <div className="app-title-controls">
                    <label className="app-title-select">
                      <select
                        className="app-list-select app-list-select--inline"
                        value={activeListId ?? ""}
                        onChange={(event) => {
                          setActiveListId(event.target.value);
                        }}
                        aria-label="Выбрать список"
                        required
                      >
                        <option value="" disabled hidden>
                          Выбрать
                        </option>
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {isShoppingTab && activeList && (
                      <div className="app-title-actions">
                        <button
                          type="button"
                          className="app-title-action"
                          onClick={() => {
                            setRenameListValue(activeList.name || "");
                            setIsRenamingList(true);
                          }}
                          disabled={isRenamingSubmitting}
                          title="Переименовать список"
                          aria-label="Переименовать список"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="app-title-action"
                          onClick={handleDeleteList}
                          title="Удалить список"
                          aria-label="Удалить список"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <MembersPanel
          visible={Boolean(activeList && isAllTab)}
          memberEntries={memberEntries}
          totalMembersCount={displayedMembersCount}
          availableInviteOptions={availableInviteOptions}
          onInvite={handleInviteMember}
          isInviting={isInvitingMember}
          onRequestRemove={requestMemberRemoval}
          activeListId={activeListId}
          allowMemberRemoval={!isFamilyList}
          allowInvites={!isFamilyList}
        />
        {!isShoppingTab && (
          <div className="app-list-controls">
            <button
              type="button"
              className="app-list-create-button"
              onClick={() => setIsCreatingList((prev) => !prev)}
              disabled={isSubmittingList}
            >
              Новый список
            </button>
          </div>
        )}
      </div>
      {!isShoppingTab && isCreatingList && (
        <form
          className="app-new-list-form"
          onSubmit={handleCreateListSubmit}
        >
          <input
            type="text"
            className="app-new-list-input"
            placeholder="Название списка"
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            required
          />
          <input
            type="text"
            className="app-new-list-input"
            placeholder="Emails участников (через запятую)"
            value={newListMembers}
            onChange={(event) => setNewListMembers(event.target.value)}
          />
          <div className="app-new-list-actions">
            <button
              type="submit"
              className="app-new-list-submit"
              disabled={isSubmittingList || !newListName.trim()}
            >
              Создать
            </button>
            <button
              type="button"
              className="app-new-list-cancel"
              onClick={() => {
                if (isSubmittingList) return;
                setIsCreatingList(false);
                setNewListName("");
                setNewListMembers("");
              }}
              disabled={isSubmittingList}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
      {activeTab === "all" && (
        <Form
          onAddItem={addItem}
          items={items}
          catalog={catalog}
          defaultCategory={DEFAULT_CATEGORY}
        />
      )}

      <List
        items={items}
        catalog={catalog}
        onDelete={deleteEntry}
        onActiveChange={handleActiveChange}
        onPurchase={handlePurchase}
        defaultCategory={DEFAULT_CATEGORY}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <ConfirmModal
        open={Boolean(pendingMemberRemoval)}
        message={
          pendingMemberRemoval
            ? `Удалить участника ${pendingMemberRemoval.displayName} из списка?`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onConfirm={handleConfirmRemoveMember}
        onCancel={handleCancelRemoveMember}
        confirmDisabled={isInvitingMember}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
