import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeName } from "../utils/items";
import "../styles/form.css";

const BASE_CATEGORY_OPTIONS = [
  "Молочное",
  "Овощи",
  "Фрукты / орехи",
  "Хлеб / выпечка",
  "Крупы / макароны",
  "Мясо / рыба",
  "Соусы / специи",
  "Заморозка",
  "DM",
  "Другое",
];

const MAX_SUGGESTIONS = 5;

function sanitizeWordStart(word) {
  return word.replace(/^[^a-zA-Zа-яА-ЯёЁ0-9]+/, "").toLowerCase();
}

function matchesQuery(name, query) {
  return name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((word) => {
      const normalizedWord = sanitizeWordStart(word);
      return normalizedWord && normalizedWord.startsWith(query);
    });
}

export default function Form({
  onAddItem,
  items,
  catalog = [],
  defaultCategory,
}) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [localCategories, setLocalCategories] = useState([]);
  const inputRef = useRef(null);
  const categoriesByName = useMemo(() => {
    const map = new Map();
    catalog.forEach(({ name, category: cat }) => {
      const normalized = normalizeName(name);
      if (!map.has(normalized)) {
        map.set(normalized, cat);
      }
    });
    return map;
  }, [catalog]);

  const categoryOptions = useMemo(() => {
    const known = new Set(BASE_CATEGORY_OPTIONS);
    const extended = [...BASE_CATEGORY_OPTIONS];

    catalog.forEach(({ category: cat }) => {
      const value = (cat ?? "").toString().trim();
      if (!value) return;
      if (known.has(value)) return;
      known.add(value);
      extended.push(value);
    });

    localCategories.forEach((cat) => {
      const value = (cat ?? "").toString().trim();
      if (!value) return;
      if (known.has(value)) return;
      known.add(value);
      extended.push(value);
    });

    return extended;
  }, [catalog, localCategories]);

  const selectOptions = useMemo(() => {
    const opts = [...categoryOptions];
    if (category && !opts.includes(category)) {
      opts.push(category);
    }
    return opts;
  }, [categoryOptions, category]);

  const getCategoryByName = (name) =>
    categoriesByName.get(normalizeName(name));

  function handleChange(e) {
    const value = e.target.value;
    setText(value);
    if (!isExpanded) {
      setIsExpanded(true);
    }
  }

  const suggestions = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query) return [];

    const seen = new Set();
    const matches = [];

    for (const { name } of catalog) {
      const normalizedName = normalizeName(name);
      if (seen.has(normalizedName)) continue;

      if (matchesQuery(name, query)) {
        seen.add(normalizedName);
        matches.push(name);
      }

      if (matches.length === MAX_SUGGESTIONS) break;
    }

    return matches;
  }, [text, catalog]);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!isExpanded) {
      setIsExpanded(true);
      return;
    }

    const resolvedCategory =
      category || getCategoryByName(trimmed) || defaultCategory;

    const duplicate = items.some(
      (item) => normalizeName(item.name) === normalizeName(trimmed)
    );
    if (duplicate) return;

    onAddItem(trimmed, resolvedCategory);
    setText("");
    setCategory("");
    setIsExpanded(false);
    setIsAddingCategory(false);
    setCustomCategory("");
  }

  function handleSuggestionClick(name) {
    const resolvedCategory =
      getCategoryByName(name) ||
      items.find(
        (item) => normalizeName(item.name) === normalizeName(name)
      )?.category ||
      defaultCategory;

    onAddItem(name, resolvedCategory);
    setText("");
    setCategory("");
    setIsExpanded(false);
    setIsAddingCategory(false);
    setCustomCategory("");
  }

  function handleCancel() {
    setIsExpanded(false);
    setCategory("");
    setText("");
    setIsAddingCategory(false);
    setCustomCategory("");
  }

  function handleNewCategorySave() {
    const trimmed = customCategory.trim();
    if (!trimmed) return;
    setLocalCategories((prev) => {
      if (prev.includes(trimmed) || categoryOptions.includes(trimmed)) {
        return prev;
      }
      return [...prev, trimmed];
    });
    setCategory(trimmed);
    setIsAddingCategory(false);
    setCustomCategory("");
  }

  return (
    <form className={`list-form${isExpanded ? " is-expanded" : ""}`} onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        className="list-input"
        type="text"
        placeholder="Внесите продукт..."
        value={text}
        onChange={handleChange}
        onFocus={() => setIsExpanded(true)}
      />
      {isExpanded && (
        <>
          <select
            className="list-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="" disabled hidden>
              Выберите категорию
            </option>
            {selectOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {!isAddingCategory ? (
            <button
              type="button"
              className="list-category-toggle"
              onClick={() => {
                setIsAddingCategory(true);
                setCustomCategory("");
              }}
            >
              Добавить категорию
            </button>
          ) : (
            <div className="list-new-category">
              <input
                className="list-new-category-input"
                type="text"
                value={customCategory}
                onChange={(event) => setCustomCategory(event.target.value)}
                placeholder="Название категории"
              />
              <div className="list-new-category-actions">
                <button
                  type="button"
                  className="list-new-category-save"
                  onClick={handleNewCategorySave}
                  disabled={!customCategory.trim()}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className="list-new-category-cancel"
                  onClick={() => {
                    setIsAddingCategory(false);
                    setCustomCategory("");
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
          <div className="list-actions">
            <button className="list-submit">Добавить</button>
            <button
              type="button"
              className="list-cancel"
              onClick={handleCancel}
            >
              Отмена
            </button>
          </div>
        </>
      )}

      {/* показываем подсказки */}
      {isExpanded && suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((sug) => (
            <li key={sug}>
              <button
                type="button"
                className="suggestions__item"
                onClick={() => handleSuggestionClick(sug)}
              >
                {sug}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
