import { useEffect, useState } from "react";
import { normalizeEmailValue } from "../utils/email";

export default function MembersPanel({
  visible,
  memberEntries,
  totalMembersCount,
  availableInviteOptions,
  onInvite,
  isInviting,
  onRequestRemove,
  activeListId,
  allowMemberRemoval = true,
  allowInvites = true,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!visible) {
      setIsExpanded(false);
      setSelectedEmail("");
      setLocalError("");
    }
  }, [visible, activeListId]);

  useEffect(() => {
    if (!selectedEmail) return;
    const normalized = normalizeEmailValue(selectedEmail);
    const stillAvailable = availableInviteOptions.some(
      (option) => option.normalizedEmail === normalized
    );

    if (!stillAvailable) {
      setSelectedEmail("");
    }
  }, [availableInviteOptions, selectedEmail]);

  if (!visible) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await onInvite(selectedEmail);
      setSelectedEmail("");
      setLocalError("");
    } catch (error) {
      setLocalError(error?.message ?? "Произошла ошибка");
    }
  }

  return (
    <div className="app-members-panel">
      <button
        type="button"
        className={`app-members-toggle${isExpanded ? " is-open" : ""}`}
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <span className="app-members-title">Участники</span>
        <span className="app-members-count">{totalMembersCount}</span>
        <span className="app-members-icon" aria-hidden="true">
          ⌄
        </span>
      </button>
      <div
        className={`app-members-content${isExpanded ? " is-open" : ""}`}
      >
        <div className="app-members-list">
          {memberEntries.map((member) => (
            <span key={member.normalizedEmail} className="app-member-chip">
              {member.label}
              {allowMemberRemoval && (
                <button
                  type="button"
                  className="app-member-remove"
                  onClick={() => onRequestRemove(member.rawEmail, member.displayName)}
                  title="Удалить участника"
                  disabled={isInviting}
                  aria-label={`Удалить ${member.displayName}`}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {memberEntries.length === 0 && (
            <span className="app-members-empty">Участников пока нет</span>
          )}
        </div>
        {allowInvites && (
          <>
            <form className="app-members-form" onSubmit={handleSubmit}>
              <select
                className="app-members-select"
                value={selectedEmail}
                onChange={(event) => {
                  setSelectedEmail(event.target.value);
                  setLocalError("");
                }}
                aria-label="Выбрать участника"
                disabled={isInviting || availableInviteOptions.length === 0}
              >
                <option value="">
                  {availableInviteOptions.length === 0
                    ? "Нет доступных участников"
                    : "Выбрать участника"}
                </option>
                {availableInviteOptions.map((option) => (
                  <option key={option.normalizedEmail} value={option.email}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="app-members-submit"
                disabled={isInviting || !selectedEmail}
              >
                Пригласить
              </button>
            </form>
            {localError && (
              <p className="app-members-error" role="alert">
                {localError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
