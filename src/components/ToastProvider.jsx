/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext({ showToast: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast) => {
    counterRef.current += 1;
    const id = `${Date.now()}-${counterRef.current}`;
    const payload = {
      id,
      type: toast.type ?? "info",
      message: toast.message ?? "",
      duration: toast.duration ?? 4000,
    };
    setToasts((prev) => [...prev, payload]);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const { id, type, message, duration } = toast;
  useEffect(() => {
    if (duration === Infinity) return;
    const timer = window.setTimeout(() => {
      onDismiss(id);
    }, duration);
    return () => {
      window.clearTimeout(timer);
    };
  }, [id, duration, onDismiss]);

  return (
    <div className={`toast toast--${type}`}>
      <span className="toast-message">{message}</span>
      <button
        type="button"
        className="toast-close"
        onClick={() => onDismiss(id)}
        aria-label="Закрыть уведомление"
      >
        ✖️
      </button>
    </div>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
