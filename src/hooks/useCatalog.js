import { useEffect, useRef } from "react";
import { subscribeToCatalog } from "../services/catalogService";

export function useCatalogSubscription({
  db,
  onSnapshot,
  onError,
}) {
  const snapshotHandlerRef = useRef(onSnapshot);
  const errorHandlerRef = useRef(onError);

  useEffect(() => {
    snapshotHandlerRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    errorHandlerRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const unsubscribe = subscribeToCatalog(
      db,
      (snapshot) => snapshotHandlerRef.current?.(snapshot),
      (error) => errorHandlerRef.current?.(error)
    );

    return () => {
      unsubscribe();
    };
  }, [db]);
}
