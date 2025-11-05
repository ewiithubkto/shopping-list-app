import { useState } from "react";
import { isValidEmail } from "../utils/validation";

export default function UserSetup({ onSubmit }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const isEmailValid = isValidEmail(trimmedEmail);
  const canSubmit = Boolean(trimmedName) && isEmailValid;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      name: trimmedName,
      email: trimmedEmail,
    });
  }

  return (
    <div className="user-setup-overlay">
      <form className="user-setup-card" onSubmit={handleSubmit}>
        <h2 className="user-setup-title">Добро пожаловать!</h2>
        <p className="user-setup-text">
          Укажите свои имя и email, чтобы продолжить работу со списками.
        </p>
        <label className="user-setup-field">
          <span className="user-setup-label">Имя</span>
          <input
            type="text"
            className="user-setup-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например, Анна"
            autoComplete="name"
            autoFocus
            required
          />
        </label>
        <label className="user-setup-field">
          <span className="user-setup-label">Email</span>
          <input
            type="email"
            className="user-setup-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <button
          type="submit"
          className="user-setup-submit"
          disabled={!canSubmit}
        >
          Продолжить
        </button>
        {!isEmailValid && trimmedEmail.length > 0 && (
          <p className="user-setup-hint">Проверьте формат email.</p>
        )}
      </form>
    </div>
  );
}
