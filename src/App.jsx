import { useEffect, useRef, useState } from "react";
import { onValue, push, ref, remove, set } from "firebase/database";
import Form from "./components/Form";
import List from "./components/List";
import baseCatalog from "./data/products.json";
import { rtdb } from "./firebase";
import { normalizeName } from "./utils/items";
import "./styles/app.css";

const DEFAULT_CATEGORY = "Другое";
const CURRENT_USER_EMAIL = "elena@example.com";

const NORMALIZED_CURRENT_USER_EMAIL =
  CURRENT_USER_EMAIL.trim().toLowerCase();

const CATALOG_PATH = "shopping/catalog";
const LISTS_PATH = "lists";

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

function normalizeListEntry(id, value) {
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

  const currentKey = NORMALIZED_CURRENT_USER_EMAIL;
  if (currentKey && !memberSet.has(currentKey)) {
    memberSet.set(currentKey, CURRENT_USER_EMAIL);
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
  const [items, setItems] = useState([]);
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

  const activeList =
    lists.find((list) => list.id === activeListId) ?? null;
  const isSyncedRef = useRef(false);
  const lastSyncedRef = useRef([]);
  const isCatalogSyncedRef = useRef(false);
  const lastCatalogSyncedRef = useRef([]);
  const hasSeededCatalogRef = useRef(false);
  const hasSeededDefaultListRef = useRef(false);
  const currentItemsListIdRef = useRef(null);

  useEffect(() => {
    if (!activeList) {
      setIsRenamingList(false);
      setRenameListValue("");
      return;
    }
    setRenameListValue(activeList.name || "");
  }, [activeListId, activeList]);

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

    setItems((prev) => {
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

    const trimmedName = newListName.trim();
    if (!trimmedName) return;

    const additionalMembers = newListMembers
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    const uniqueMembers = [];
    const seenMembers = new Set();
    [CURRENT_USER_EMAIL, ...additionalMembers].forEach((email) => {
      const normalized = email.trim();
      if (!normalized) return;
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

      const normalized = normalizeListEntry(newId, payload);
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
    setItems([]);
    setLists((prev) => {
      const next = prev.filter((list) => list.id !== activeListId);
      const nextActive = next[0]?.id ?? null;
      setActiveListId(nextActive);
      return next;
    });
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
        setItems((prev) =>
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

    setItems((prev) => [
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

    setItems((prev) => {
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
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, bought: true, active: false } : item
      )
    );
  }

  useEffect(() => {
    const listsRef = ref(rtdb, LISTS_PATH);

    const processEntry = (key, value) => {
      if (!value) return null;

      const normalized = normalizeListEntry(key, value);
      if (!normalized) return null;

      const rawMembers = Array.isArray(value.members) ? value.members : [];
      const hasCurrentInRaw = rawMembers.some(
        (member) => (member ?? "").toString().trim().toLowerCase() === NORMALIZED_CURRENT_USER_EMAIL
      );

      if (!hasCurrentInRaw) {
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
          members: [CURRENT_USER_EMAIL],
          items: {},
        };

        const defaultListRef = push(listsRef);
        set(defaultListRef, payload)
          .then(() => {
            const newId = defaultListRef.key;
            if (newId) {
              const normalized = normalizeListEntry(newId, payload);
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
  }, []);

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
      setItems([]);
      return;
    }

    if (currentItemsListIdRef.current !== activeListId) {
      isSyncedRef.current = false;
      lastSyncedRef.current = [];
      setItems([]);
    }

    currentItemsListIdRef.current = activeListId;
    const itemsRef = ref(rtdb, `${LISTS_PATH}/${activeListId}/items`);

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
      setItems(resolved);
    });

    return () => {
      unsubscribe();
      isSyncedRef.current = false;
    };
  }, [activeListId]);

  useEffect(() => {
    if (!activeListId) return;
    if (!isSyncedRef.current) return;
    if (areItemsEqual(lastSyncedRef.current, items)) return;

    const itemsRef = ref(rtdb, `${LISTS_PATH}/${activeListId}/items`);
    lastSyncedRef.current = items;
    set(itemsRef, itemsArrayToRecord(items));
  }, [items, activeListId]);

  const isShoppingTab = activeTab === "shopping";

  return (
    <div className="app-wrapper">
      <div className="app-title-card">
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
              <h1 className="app-title">
                {isShoppingTab
                  ? activeList?.name || "План покупок"
                  : "План покупок"}
              </h1>
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
        {!isShoppingTab && (
          <div className="app-list-controls">
            {lists.length > 0 && (
              <select
                className="app-list-select"
                value={activeListId ?? (lists[0]?.id ?? "")}
                onChange={(event) => {
                  setActiveListId(event.target.value);
                }}
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="app-list-create-button"
              onClick={() => setIsCreatingList((prev) => !prev)}
              disabled={isSubmittingList}
            >
              ➕ Новый список
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
