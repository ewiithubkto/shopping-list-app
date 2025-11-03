import { useMemo, useState } from "react";
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

    return extended;
  }, [catalog]);

  const getCategoryByName = (name) =>
    categoriesByName.get(normalizeName(name));

  function handleChange(e) {
    const value = e.target.value;
    setText(value);
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

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    const resolvedCategory =
      category || getCategoryByName(trimmed) || defaultCategory;

    const duplicate = items.some(
      (item) => normalizeName(item.name) === normalizeName(trimmed)
    );
    if (duplicate) return;

    onAddItem(trimmed, resolvedCategory);
    setText("");
    setCategory("");
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
  }

  return (
    <form className="list-form" onSubmit={handleSubmit}>
      <input
        className="list-input"
        type="text"
        placeholder="Новый продукт..."
        value={text}
        onChange={handleChange}
      />
      <select
        className="list-select"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="" disabled hidden>
          Выберите категорию
        </option>
        {categoryOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button className="list-submit">Добавить</button>

      {/* показываем подсказки */}
      {suggestions.length > 0 && (
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
