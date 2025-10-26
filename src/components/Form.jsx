import { useMemo, useState } from "react";
import products from "../data/products.json";
import "../styles/form.css";

const CATEGORY_OPTIONS = [
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

function getCategoryByName(name) {
  const normalized = name.trim().toLowerCase();
  const match = products.find(
    (product) => product.name.trim().toLowerCase() === normalized
  );

  return match?.category;
}

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

export default function Form({ onAddItem, items, defaultCategory }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");

  function handleChange(e) {
    const value = e.target.value;
    setText(value);
  }

  const suggestions = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query) return [];

    const seen = new Set();
    const matches = [];

    for (const { name } of products) {
      const normalizedName = name.trim().toLowerCase();
      if (seen.has(normalizedName)) continue;

      if (matchesQuery(name, query)) {
        seen.add(normalizedName);
        matches.push(name);
      }

      if (matches.length === MAX_SUGGESTIONS) break;
    }

    return matches;
  }, [text, products]);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    const resolvedCategory =
      category || getCategoryByName(trimmed) || defaultCategory;

    const duplicate = items.some(
      (item) => item.name.trim().toLowerCase() === trimmed.toLowerCase()
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
        (item) => item.name.trim().toLowerCase() === name.trim().toLowerCase()
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
        {CATEGORY_OPTIONS.map((option) => (
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
