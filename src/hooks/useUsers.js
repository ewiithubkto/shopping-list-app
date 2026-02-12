import { useEffect, useRef } from "react";
import { subscribeToUsers } from "../services/usersService";

export function useUsersSubscription({
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
    const unsubscribe = subscribeToUsers(
      db,
      (snapshot) => snapshotHandlerRef.current?.(snapshot),
      (error) => errorHandlerRef.current?.(error)
    );

    return () => {
      unsubscribe();
    };
  }, [db]);
}
