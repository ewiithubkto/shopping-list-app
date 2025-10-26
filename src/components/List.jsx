import { useEffect, useMemo, useRef, useState } from "react";
import products from "../data/products.json";
import "../styles/list.css";

const VIEW_MODES = {
  catalog: "catalog",
  shopping: "shopping",
};

function usePrefersReducedMotion() {
  const [prefers, setPrefers] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event) => {
      setPrefers(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return prefers;
}

export default function List({
  items,
  onDelete,
  onActiveChange,
  onPurchase,
  defaultCategory,
}) {
  const [removingId, setRemovingId] = useState(null);
  const [mode, setMode] = useState(VIEW_MODES.catalog);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState(() => new Set());
  const previousIdsRef = useRef(new Set(items.map((item) => item.id)));
  const animationTimeoutsRef = useRef([]);
  const isShoppingView = mode === VIEW_MODES.shopping;
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldAnimate = !prefersReducedMotion;

  useEffect(() => {
    return () => {
      animationTimeoutsRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      animationTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const currentIds = new Set(items.map((item) => item.id));

    if (!shouldAnimate) {
      animationTimeoutsRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      animationTimeoutsRef.current = [];
      previousIdsRef.current = currentIds;
      setRecentlyAddedIds(() => new Set());
      return;
    }

    const prevIds = previousIdsRef.current;
    const newIds = [];

    currentIds.forEach((id) => {
      if (!prevIds.has(id)) {
        newIds.push(id);
      }
    });

    setRecentlyAddedIds((prev) => {
      let mutated = false;
      const next = new Set(prev);

      for (const id of Array.from(next)) {
        if (!currentIds.has(id)) {
          next.delete(id);
          mutated = true;
        }
      }

      if (newIds.length > 0) {
        newIds.forEach((id) => next.add(id));
        mutated = true;
      }

      return mutated ? next : prev;
    });

    if (newIds.length > 0) {
      newIds.forEach((id) => {
        const timeoutId = setTimeout(() => {
          setRecentlyAddedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          animationTimeoutsRef.current = animationTimeoutsRef.current.filter(
            (storedId) => storedId !== timeoutId
          );
        }, 250);

        animationTimeoutsRef.current.push(timeoutId);
      });
    }

    previousIdsRef.current = currentIds;
  }, [items, shouldAnimate]);

  function handlePurchase(id) {
    setRemovingId(id);
    setTimeout(() => {
      onPurchase(id);
      setRemovingId(null);
    }, 200); // короткая задержка для плавного исчезновения
  }

  const catalogCategories = useMemo(() => {
    const map = new Map();
    const itemsByName = new Map();
    const libraryNames = new Set();

    items.forEach((item) => {
      itemsByName.set(item.name.trim().toLowerCase(), item);
    });

    const addToCategory = (category, entry) => {
      const key = category || defaultCategory;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    };

    products.forEach(({ name, category }) => {
      const normalized = name.trim().toLowerCase();
      const linkedItem = itemsByName.get(normalized);
      libraryNames.add(normalized);

      const id = linkedItem ? linkedItem.id : `catalog-${normalized}`;

      addToCategory(category, {
        id,
        name,
        active: Boolean(linkedItem?.active),
        bought: linkedItem ? Boolean(linkedItem.bought) : true,
        linkedItem,
        category: category || defaultCategory,
      });
    });

    items.forEach((item) => {
      const normalized = item.name.trim().toLowerCase();
      if (libraryNames.has(normalized)) return;

      addToCategory(item.category, {
        id: item.id,
        name: item.name,
        active: Boolean(item.active),
        bought: Boolean(item.bought),
        linkedItem: item,
        category: item.category || defaultCategory,
      });
    });

    return Array.from(map.entries())
      .map(([category, categoryItems]) => ({
        category,
        items: categoryItems,
      }))
      .filter(({ items }) => items.length > 0);
  }, [items, defaultCategory]);

  const shoppingItems = useMemo(
    () =>
      items
        .filter((item) => item.active && !item.bought)
        .map((item) => ({
          id: item.id,
          label: item.name,
        })),
    [items]
  );

  const renderShoppingRow = (entry) => {
    const itemClassName = `item${
      removingId === entry.id ? " removing" : ""
    }${recentlyAddedIds.has(entry.id) ? " added" : ""}`;

    return (
      <li key={entry.id} className={itemClassName}>
        <label className="item-label">
          <input
            className="item-checkbox"
            type="checkbox"
            checked={false}
            onChange={() => handlePurchase(entry.id)}
          />
          {entry.label}
        </label>
      </li>
    );
  };

  return (
    <div className="list-container">
      <div className="list-view-toggle">
        <button
          type="button"
          className={`view-button ${
            mode === VIEW_MODES.catalog ? "is-active" : ""
          }`}
          onClick={() => setMode(VIEW_MODES.catalog)}
        >
          <span className="view-button__icon" aria-hidden="true">
            📦
          </span>
          <span className="view-button__text">Все продукты</span>
        </button>
        <button
          type="button"
          className={`view-button ${
            mode === VIEW_MODES.shopping ? "is-active" : ""
          }`}
          onClick={() => setMode(VIEW_MODES.shopping)}
        >
          <span className="view-button__icon" aria-hidden="true">
            🛒
          </span>
          <span className="view-button__text">Покупки</span>
        </button>
      </div>

      {mode === VIEW_MODES.catalog &&
        catalogCategories.map(({ category, items: categoryItems }) => (
          <section key={category} className="category-section">
            <h3 className="category-title">{category}</h3>
            <ul className="item-list">
              {categoryItems.map((item) => {
                const isLinked = Boolean(item.linkedItem);
                const isRemoving = isLinked && removingId === item.id;
                const isAdded = isLinked && recentlyAddedIds.has(item.id);
                const itemClassName = `item${
                  isRemoving ? " removing" : ""
                }${isAdded ? " added" : ""}`;

                return (
                  <li key={item.id} className={itemClassName}>
                    <label className="item-label">
                      <input
                        className="item-checkbox"
                        type="checkbox"
                        checked={item.active}
                        onChange={() =>
                          onActiveChange(
                            item.name,
                            item.category,
                            !item.active
                          )
                        }
                      />
                      {item.name}
                    </label>
                    {!isShoppingView && !item.bought && (
                      <button
                        className="item-delete"
                        onClick={() => onDelete(item.id, item.name)}
                      >
                        ❌
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      {mode === VIEW_MODES.shopping && (
        <div className="shopping-section">
          <ul className="shopping-list">
            {shoppingItems.map(renderShoppingRow)}
          </ul>
        </div>
      )}
    </div>
  );
}
