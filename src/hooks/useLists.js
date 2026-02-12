import { useEffect, useRef } from "react";
import { subscribeToLists } from "../services/listsService";

export function useListsSubscription({
  db,
  enabled,
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
    if (!enabled) return undefined;

    const unsubscribe = subscribeToLists(
      db,
      (snapshot) => snapshotHandlerRef.current?.(snapshot),
      (error) => errorHandlerRef.current?.(error)
    );

    return () => {
      unsubscribe();
    };
  }, [db, enabled]);
}
