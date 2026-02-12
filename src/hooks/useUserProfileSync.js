import { useEffect, useRef } from "react";
import { upsertUserProfile } from "../services/usersService";
import { normalizeEmailValue } from "../utils/email";
import { isValidEmail } from "../utils/validation";

export function useUserProfileSync({ db, currentUser }) {
  const lastSyncedUserProfileRef = useRef({ emailKey: null, name: null });

  useEffect(() => {
    if (!currentUser) return;
    const trimmedEmail = (currentUser.email ?? "").toString().trim();
    const trimmedName = (currentUser.name ?? "").toString().trim();
    const normalizedEmail = normalizeEmailValue(trimmedEmail);
    if (!normalizedEmail || !isValidEmail(trimmedEmail) || !trimmedName) {
      return;
    }

    const lastSynced = lastSyncedUserProfileRef.current;
    if (
      lastSynced.emailKey === normalizedEmail &&
      lastSynced.name === trimmedName
    ) {
      return;
    }

    lastSyncedUserProfileRef.current = {
      emailKey: normalizedEmail,
      name: trimmedName,
    };

    upsertUserProfile(db, {
      email: trimmedEmail,
      name: trimmedName,
      updatedAt: Date.now(),
    }).catch((error) => {
      console.error("Failed to sync user profile", error);
    });
  }, [db, currentUser]);
}
