import { useEffect, useRef } from "react";
import { subscribeToListDocument } from "../services/itemsService";

export function useActiveListItemsSubscription({
  db,
  activeListId,
  onInactive,
  onBeforeSubscribe,
  onSnapshot,
  onCleanup,
  onError,
}) {
  const inactiveRef = useRef(onInactive);
  const beforeSubscribeRef = useRef(onBeforeSubscribe);
  const snapshotRef = useRef(onSnapshot);
  const cleanupRef = useRef(onCleanup);
  const errorRef = useRef(onError);

  useEffect(() => {
    inactiveRef.current = onInactive;
  }, [onInactive]);

  useEffect(() => {
    beforeSubscribeRef.current = onBeforeSubscribe;
  }, [onBeforeSubscribe]);

  useEffect(() => {
    snapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    cleanupRef.current = onCleanup;
  }, [onCleanup]);

  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!activeListId) {
      inactiveRef.current?.();
      return undefined;
    }

    beforeSubscribeRef.current?.(activeListId);

    const unsubscribe = subscribeToListDocument(
      db,
      activeListId,
      (snapshot) => snapshotRef.current?.(activeListId, snapshot),
      (error) => errorRef.current?.(error)
    );

    return () => {
      unsubscribe();
      cleanupRef.current?.(activeListId);
    };
  }, [db, activeListId]);
}
