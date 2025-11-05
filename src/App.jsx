import { useEffect, useMemo, useRef, useState } from "react";
import { onValue, push, ref, remove, set } from "firebase/database";
import Form from "./components/Form";
import List from "./components/List";
import UserSetup from "./components/UserSetup";
import baseCatalog from "./data/products.json";
import { rtdb } from "./firebase";
import { normalizeName } from "./utils/items";
import { isValidEmail } from "./utils/validation";
import "./styles/app.css";

const DEFAULT_CATEGORY = "Другое";
const CATALOG_PATH = "shopping/catalog";
const LISTS_PATH = "lists";
const EMPTY_ITEMS = Object.freeze([]);
const USER_STORAGE_KEY = "shoppingListApp.currentUser";

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

function normalizeItem(item) {
  if (!item) return null;

  return {
    id: item.id ?? Date.now(),
    name: item.name ?? "",
    bought: Boolean(item.bought),
    category: item.category ?? DEFAULT_CATEGORY,
    active: item.active ?? true,
  };
}

function normalizeCatalogItem(item) {
  if (!item) return null;

  const name = (item.name ?? "").toString().trim();
  if (!name) return null;

  const categoryValue = (item.category ?? DEFAULT_CATEGORY).toString().trim();
  const category = categoryValue || DEFAULT_CATEGORY;

  return {
    name,
    category,
  };
}

function normalizeListEntry(id, value, currentUser) {
  if (!value) return null;

  const name = (value.name ?? "").toString().trim();
  const rawMembers = Array.isArray(value.members) ? value.members : [];
  const memberSet = new Map();
  rawMembers
    .map((member) => (member ?? "").toString().trim())
    .filter(Boolean)
    .forEach((member) => {
      const key = member.toLowerCase();
      if (!memberSet.has(key)) {
        memberSet.set(key, member);
      }
    });

  const currentEmail = (currentUser?.email ?? "").toString().trim();
  const normalizedCurrentEmail = currentEmail.toLowerCase();

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

function itemsArrayToRecord(items) {
  const record = {};

  items.forEach((item) => {
    if (!item) return;
    const normalized = normalizeItem(item);
    if (!normalized) return;
    const key = String(normalized.id);
    record[key] = normalized;
  });

  return record;
}

function dedupeCatalog(entries) {
  const seen = new Map();
  const result = [];

  entries.forEach((entry) => {
    const normalized = normalizeCatalogItem(entry);
    if (!normalized) return;

    const key = normalizeName(normalized.name);
    if (seen.has(key)) {
      const existingIndex = seen.get(key);
      const existing = result[existingIndex];
      if (!existing.category && normalized.category) {
        result[existingIndex] = { ...existing, category: normalized.category };
      }
      return;
    }

    seen.set(key, result.length);
    result.push(normalized);
  });

  return result;
}

const INITIAL_CATALOG = dedupeCatalog(baseCatalog);

function areItemsEqual(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

export default function App() {
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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [isInvitingMember, setIsInvitingMember] = useState(false);

  const activeList =
    lists.find((list) => list.id === activeListId) ?? null;
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
  const normalizedCurrentUserEmail = useMemo(() => {
    const email = (currentUser?.email ?? "").toString().trim();
    return email.toLowerCase();
  }, [currentUser]);

  useEffect(() => {
    persistUser(currentUser);
  }, [currentUser]);

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
        (nextData === prevData || areItemsEqual(prevData, nextData))
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
    setInviteEmail("");
    setInviteError("");
    setIsInvitingMember(false);
  }, [activeListId]);

  function upsertCatalogEntry(name, category = DEFAULT_CATEGORY) {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const resolvedCategory = category || DEFAULT_CATEGORY;
    const normName = normalizeName(trimmedName);

    const normalizedEntry = normalizeCatalogItem({
      name: trimmedName,
      category: resolvedCategory,
    });
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

    const uniqueMembers = [];
    const seenMembers = new Set();
    [currentUser.email, ...additionalMembers].forEach((email) => {
      const normalized = email.trim();
      if (!normalized) return;
      if (!isValidEmail(normalized)) return;
      const key = normalized.toLowerCase();
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
      const listsRef = ref(rtdb, LISTS_PATH);
      const newListRef = push(listsRef);
      await set(newListRef, payload);
      const newId = newListRef.key;

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
    } catch (error) {
      console.error("Failed to create list", error);
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
      const nameRef = ref(rtdb, `${LISTS_PATH}/${activeListId}/name`);
      await set(nameRef, trimmed);
      setLists((prev) =>
        prev.map((list) =>
          list.id === activeListId ? { ...list, name: trimmed } : list
        )
      );
      setIsRenamingList(false);
    } catch (error) {
      console.error("Failed to rename list", error);
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
    const confirmDelete =
      typeof window === "undefined" ||
      window.confirm("Удалить текущий список?");

    if (!confirmDelete) return;

    try {
      await remove(ref(rtdb, `${LISTS_PATH}/${activeListId}`));
    } catch (error) {
      console.error("Failed to delete list", error);
      return;
    }

    setIsRenamingList(false);
    setRenameListValue("");
    setItemsState({ listId: null, data: [] });
    isSyncedRef.current = false;
    lastSyncedRef.current = [];
    currentItemsListIdRef.current = null;
    setLists((prev) => {
      const next = prev.filter((list) => list.id !== activeListId);
      const nextActive = next[0]?.id ?? null;
      setActiveListId(nextActive);
      return next;
    });
  }

  async function handleInviteSubmit(event) {
    event.preventDefault();
    if (!activeListId || !activeList) return;

    const trimmed = inviteEmail.trim();
    if (!trimmed) {
      setInviteError("Введите email участника.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setInviteError("Проверьте формат email.");
      return;
    }

    const normalized = trimmed.toLowerCase();
    const existingMembers = Array.isArray(activeList.members)
      ? activeList.members
      : [];
    const alreadyExists = existingMembers.some(
      (member) => (member ?? "").toString().trim().toLowerCase() === normalized
    );

    if (alreadyExists) {
      setInviteError("Этот участник уже в списке.");
      return;
    }

    const nextMembers = [...existingMembers, trimmed];

    try {
      setIsInvitingMember(true);
      setInviteError("");
      const membersRef = ref(rtdb, `${LISTS_PATH}/${activeListId}/members`);
      await set(membersRef, nextMembers);
      setLists((prev) =>
        prev.map((list) =>
          list.id === activeListId ? { ...list, members: nextMembers } : list
        )
      );
      setInviteEmail("");
    } catch (error) {
      console.error("Failed to invite member", error);
      setInviteError("Не удалось пригласить участника. Попробуйте ещё раз.");
    } finally {
      setIsInvitingMember(false);
    }
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
        id: Date.now(),
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
          id: Date.now(),
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
    if (!currentUser || !currentUser.email) {
      setLists([]);
      setActiveListId(null);
      return undefined;
    }

    const listsRef = ref(rtdb, LISTS_PATH);

    const processEntry = (key, value) => {
      if (!value) return null;

      const rawMembers = Array.isArray(value.members) ? value.members : [];
      const normalizedRawMembers = rawMembers
        .map((member) => (member ?? "").toString().trim())
        .filter(Boolean);

      const hasCurrentInRaw =
        normalizedCurrentUserEmail &&
        normalizedRawMembers.some(
          (member) => member.toLowerCase() === normalizedCurrentUserEmail
        );

      if (!hasCurrentInRaw) {
        return null;
      }

      const normalized = normalizeListEntry(key, value, currentUser);
      if (!normalized) return null;

      const shouldUpdateMembers =
        normalized.members.length !== normalizedRawMembers.length ||
        normalized.members.some((member, index) => member !== normalizedRawMembers[index]);

      if (shouldUpdateMembers) {
        const membersRef = ref(rtdb, `${LISTS_PATH}/${key}/members`);
        set(membersRef, normalized.members);
      }

      return normalized;
    };

    const unsubscribe = onValue(listsRef, (snapshot) => {
      const raw = snapshot.val();
      let resolved = [];

      if (Array.isArray(raw)) {
        resolved = raw
          .map((entry, index) => processEntry(index, entry))
          .filter(Boolean);
      } else if (raw && typeof raw === "object") {
        resolved = Object.entries(raw)
          .map(([key, value]) => processEntry(key, value))
          .filter(Boolean);
      }

      const uniqueById = [];
      const seenIds = new Set();

      resolved.forEach((entry) => {
        if (!entry) return;
        const key =
          entry.id ??
          normalizeName(entry.name) ??
          `list-${uniqueById.length}`;
        if (seenIds.has(key)) return;
        seenIds.add(key);
        uniqueById.push(entry);
      });

      setLists(uniqueById);

      if (!hasSeededDefaultListRef.current) {
        const alreadyHasDefault = resolved.some(
          (entry) => normalizeName(entry.name) === normalizeName("Семейный список")
        );

        if (alreadyHasDefault) {
          return;
        }

        hasSeededDefaultListRef.current = true;

        const payload = {
          name: "Семейный список",
          members: [currentUser.email],
          items: {},
        };

        const defaultListRef = push(listsRef);
        set(defaultListRef, payload)
          .then(() => {
            const newId = defaultListRef.key;
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
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, normalizedCurrentUserEmail]);

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
  }, [activeTab]);

  useEffect(() => {
    const catalogRef = ref(rtdb, CATALOG_PATH);

    const unsubscribe = onValue(catalogRef, (snapshot) => {
      const raw = snapshot.val();

      if (raw === null) {
        if (hasSeededCatalogRef.current) return;

        hasSeededCatalogRef.current = true;
        lastCatalogSyncedRef.current = INITIAL_CATALOG;
        isCatalogSyncedRef.current = true;
        setCatalog(INITIAL_CATALOG);
        set(catalogRef, INITIAL_CATALOG);
        return;
      }

      let resolved = [];
      if (Array.isArray(raw)) {
        resolved = dedupeCatalog(raw);
      } else if (raw && typeof raw === "object") {
        resolved = dedupeCatalog(Object.values(raw));
      }

      if (resolved.length === 0 && !hasSeededCatalogRef.current) {
        hasSeededCatalogRef.current = true;
        lastCatalogSyncedRef.current = INITIAL_CATALOG;
        isCatalogSyncedRef.current = true;
        setCatalog(INITIAL_CATALOG);
        set(catalogRef, INITIAL_CATALOG);
        return;
      }

      hasSeededCatalogRef.current = hasSeededCatalogRef.current || resolved.length > 0;
      lastCatalogSyncedRef.current = resolved;
      isCatalogSyncedRef.current = true;
      setCatalog(resolved);
    });

    return () => {
      unsubscribe();
      isCatalogSyncedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isCatalogSyncedRef.current) return;
    if (areItemsEqual(lastCatalogSyncedRef.current, catalog)) return;

    const catalogRef = ref(rtdb, CATALOG_PATH);
    lastCatalogSyncedRef.current = catalog;
    set(catalogRef, catalog);
  }, [catalog]);

  useEffect(() => {
    if (!activeListId) {
      isSyncedRef.current = false;
      lastSyncedRef.current = [];
      currentItemsListIdRef.current = null;
      setItemsState({ listId: null, data: [] });
      return;
    }

    const listId = activeListId;

    if (currentItemsListIdRef.current !== listId) {
      isSyncedRef.current = false;
      lastSyncedRef.current = [];
      setItemsState({ listId, data: [] });
    }

    currentItemsListIdRef.current = listId;
    const itemsRef = ref(rtdb, `${LISTS_PATH}/${listId}/items`);

    const unsubscribe = onValue(itemsRef, (snapshot) => {
      const raw = snapshot.val();
      let resolved = [];

      if (Array.isArray(raw)) {
        resolved = raw.map((item) => normalizeItem(item)).filter(Boolean);
      } else if (raw && typeof raw === "object") {
        resolved = Object.values(raw)
          .map((item) => normalizeItem(item))
          .filter(Boolean);
      }

      if (raw === null) {
        set(itemsRef, {});
      }

      lastSyncedRef.current = resolved;
      isSyncedRef.current = true;
      setItemsState({ listId, data: resolved });
    });

    return () => {
      unsubscribe();
      if (currentItemsListIdRef.current === listId) {
        currentItemsListIdRef.current = null;
        isSyncedRef.current = false;
      }
    };
  }, [activeListId]);

  useEffect(() => {
    if (!activeListId) return;
    if (itemsState.listId !== activeListId) return;
    if (!isSyncedRef.current) return;
    if (areItemsEqual(lastSyncedRef.current, items)) return;

    const itemsRef = ref(rtdb, `${LISTS_PATH}/${activeListId}/items`);
    lastSyncedRef.current = items;
    set(itemsRef, itemsArrayToRecord(items));
  }, [items, itemsState.listId, activeListId]);

  if (!currentUser) {
    return (
      <div className="app-wrapper">
        <UserSetup onSubmit={handleUserSetupSubmit} />
      </div>
    );
  }

  const isShoppingTab = activeTab === "shopping";
  const activeMembers = Array.isArray(activeList?.members)
    ? activeList.members
    : [];
  const trimmedInviteEmail = inviteEmail.trim();
  const canSubmitInvite = isValidEmail(trimmedInviteEmail);

  return (
    <div className="app-wrapper">
      <div className="app-title-card">
        <div className="app-user-bar">
          <div className="app-user-meta">
            <span className="app-user-label">Текущий пользователь</span>
            <span className="app-user-name">{currentUser.name}</span>
          </div>
          <span className="app-user-email">{currentUser.email}</span>
        </div>
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
              >
                💾
              </button>
              <button
                type="button"
                className="app-title-cancel"
                onClick={handleRenameCancel}
                disabled={isRenamingSubmitting}
                title="Отмена"
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
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="app-title-action"
                          onClick={handleDeleteList}
                          title="Удалить список"
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
        {activeList && (
          <div className="app-members-panel">
            <div className="app-members-header">
              <span className="app-members-title">Участники</span>
              <span className="app-members-count">{activeMembers.length}</span>
            </div>
            <div className="app-members-list">
              {activeMembers.map((member) => {
                const normalizedMember = (member ?? "").toString().trim();
                if (!normalizedMember) return null;
                const isCurrent =
                  normalizedMember.toLowerCase() === normalizedCurrentUserEmail;
                const displayText = isCurrent
                  ? `Вы • ${normalizedMember}`
                  : normalizedMember;
                return (
                  <span
                    key={normalizedMember}
                    className={`app-member-chip${
                      isCurrent ? " app-member-chip--current" : ""
                    }`}
                  >
                    {displayText}
                  </span>
                );
              })}
            </div>
            <form
              className="app-members-form"
              onSubmit={handleInviteSubmit}
            >
              <input
                type="email"
                className="app-members-input"
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                  if (inviteError) {
                    setInviteError("");
                  }
                }}
                placeholder="Email участника"
                aria-label="Email участника"
                disabled={isInvitingMember}
              />
              <button
                type="submit"
                className="app-members-submit"
                disabled={!canSubmitInvite || isInvitingMember}
              >
                Пригласить
              </button>
            </form>
            {inviteError && (
              <p className="app-members-error" role="alert">
                {inviteError}
              </p>
            )}
          </div>
        )}
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
    </div>
  );
}
