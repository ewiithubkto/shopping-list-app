import { useEffect, useRef } from "react";

export default function ConfirmModal({
  open,
  message,
  confirmLabel = "ОК",
  cancelLabel = "Отмена",
  onConfirm,
  onCancel,
  confirmDisabled = false,
}) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedRef.current = document.activeElement;
    const timer = window.setTimeout(() => {
      (confirmRef.current ?? cancelRef.current)?.focus?.();
    }, 10);

    function handleKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = [cancelRef.current, confirmRef.current].filter(Boolean);
      if (focusable.length === 0) return;

      const currentIndex = focusable.indexOf(document.activeElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1]?.focus?.();
        }
      } else {
        if (currentIndex === focusable.length - 1) {
          event.preventDefault();
          focusable[0]?.focus?.();
        }
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", handleKeydown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="modal-card">
        <p className="modal-text">{message}</p>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-button modal-button--secondary"
            onClick={onCancel}
            ref={cancelRef}
            disabled={confirmDisabled}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="modal-button modal-button--primary"
            onClick={onConfirm}
            ref={confirmRef}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
