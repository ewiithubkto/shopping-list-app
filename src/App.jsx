import { useEffect, useRef, useState } from "react";
import { onValue, ref, set } from "firebase/database";
import Form from "./components/Form";
import List from "./components/List";
import { rtdb } from "./firebase";
import "./styles/app.css";

const DEFAULT_CATEGORY = "Другое";

const ITEMS_PATH = "shopping/items";

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

function areItemsEqual(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

export default function App() {
  const [items, setItems] = useState([]);
  const isSyncedRef = useRef(false);
  const lastSyncedRef = useRef([]);

  function addItem(name, category = DEFAULT_CATEGORY) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const norm = trimmed.toLowerCase();

    // Проверяем, есть ли уже такой продукт (без учёта регистра)
    const existing = items.find(
      (it) => it.name.trim().toLowerCase() === norm
    );

    if (existing) {
      // Если продукт есть и он отмечен как купленный — вернём его в верхний список
      if (existing.bought || !existing.active || existing.category !== category) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === existing.id
              ? { ...it, bought: false, active: true, category }
              : it
          )
        );
      }
      // Если уже есть в верхнем списке — ничего не делаем
    } else {
      // Добавляем как новый активный продукт
      setItems((prev) => [
        ...prev,
        { id: Date.now(), name: trimmed, bought: false, category, active: true },
      ]);
    }
  }

  function handleActiveChange(name, category, shouldBeActive) {
    const trimmed = name.trim();
    if (!trimmed) return;

    const norm = trimmed.toLowerCase();
    const resolvedCategory = category || DEFAULT_CATEGORY;

    setItems((prev) => {
      const existing = prev.find(
        (it) => it.name.trim().toLowerCase() === norm
      );

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

  function deleteItem(id, name) {
    const updatedItems = items.filter((item) => item.id !== id);
    setItems(updatedItems);
  }

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
      <Form
        onAddItem={addItem}
        items={items}
        defaultCategory={DEFAULT_CATEGORY}
      />

      <List
        items={items}
        onDelete={(id, name) => deleteItem(id, name)}
        onActiveChange={handleActiveChange}
        onPurchase={handlePurchase}
        defaultCategory={DEFAULT_CATEGORY}
      />
    </div>
  );
}
