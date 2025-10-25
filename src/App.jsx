import { useState, useEffect } from "react";
import Form from "./components/Form";
import List from "./components/List";
import "./styles/app.css";

const STORAGE_KEYS = {
  items: "shoppingList",
  library: "productLibrary",
};

const DEFAULT_CATEGORY = "Другое";

function safeParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default function App() {
  const [items, setItems] = useState(() => {
    const stored = safeParse(localStorage.getItem(STORAGE_KEYS.items), []);

    return stored.map((item) => ({
      ...item,
      category: item?.category ?? DEFAULT_CATEGORY,
      active: item?.active ?? true,
    }));
  });

  // 🧠 библиотека всех продуктов
  const [library, setLibrary] = useState(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.library), [])
  );

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

    // Поддерживаем библиотеку (без дубликатов, без учёта регистра)
    if (!library.some((p) => p.trim().toLowerCase() === norm)) {
      setLibrary((prev) => [...prev, trimmed]);
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

    if (shouldBeActive) {
      setLibrary((prev) => {
        if (prev.some((p) => p.trim().toLowerCase() === norm)) {
          return prev;
        }
        return [...prev, trimmed];
      });
    }
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

    // Удаляем из библиотеки
    setLibrary((prev) => prev.filter((product) => product !== name));
  }
  // сохраняем изменения в списке покупок
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.library, JSON.stringify(library));
  }, [library]);

  return (
    <div className="app-wrapper">
      <h1 className="app-title">🛍️ План покупок</h1>
      <Form
        onAddItem={addItem}
        items={items}
        library={library}
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
