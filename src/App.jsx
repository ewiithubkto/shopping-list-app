import { useEffect, useRef, useState } from "react";
import { onValue, ref, set } from "firebase/database";
import Form from "./components/Form";
import List from "./components/List";
import baseCatalog from "./data/products.json";
import { rtdb } from "./firebase";
import { normalizeName } from "./utils/items";
import "./styles/app.css";

const DEFAULT_CATEGORY = "Другое";

const ITEMS_PATH = "shopping/items";
const CATALOG_PATH = "shopping/catalog";

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
  const isSyncedRef = useRef(false);
  const lastSyncedRef = useRef([]);
  const isCatalogSyncedRef = useRef(false);
  const lastCatalogSyncedRef = useRef([]);
  const hasSeededCatalogRef = useRef(false);

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

  function addItem(name, category = DEFAULT_CATEGORY) {
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
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, bought: true, active: false } : item
      )
    );
  }

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
    const itemsRef = ref(rtdb, ITEMS_PATH);

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

      if (resolved.length === 0 && raw === null) {
        set(itemsRef, []);
      }

      lastSyncedRef.current = resolved;
      isSyncedRef.current = true;
      setItems(resolved);
    });

    return () => {
      unsubscribe();
      isSyncedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isSyncedRef.current) return;
    if (areItemsEqual(lastSyncedRef.current, items)) return;

    const itemsRef = ref(rtdb, ITEMS_PATH);
    lastSyncedRef.current = items;
    set(itemsRef, items);
  }, [items]);

  return (
    <div className="app-wrapper">
      <div className="app-title-card">
        <h1 className="app-title">План покупок</h1>
      </div>
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
