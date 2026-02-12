import { useMemo } from "react";
import { isValidEmail } from "../utils/validation";
import { normalizeEmailValue } from "../utils/email";

export function useMembersData({
  members,
  currentUserEmail,
  userDirectory = {},
}) {
  return useMemo(() => {
    const normalizedMemberSet = new Set();
    const safeMembers = Array.isArray(members) ? members : [];
    const normalizedCurrentEmail = normalizeEmailValue(currentUserEmail);

    safeMembers.forEach((member) => {
      const normalized = normalizeEmailValue(member);
      if (normalized) {
        normalizedMemberSet.add(normalized);
      }
    });

    if (normalizedCurrentEmail) {
      normalizedMemberSet.add(normalizedCurrentEmail);
    }

    const memberEntries = safeMembers
      .map((member) => {
        const trimmed = (member ?? "").toString().trim();
        if (!trimmed) return null;
        const normalizedEmail = normalizeEmailValue(trimmed);
        if (!normalizedEmail || normalizedEmail === normalizedCurrentEmail) {
          return null;
        }

        const profile = userDirectory[normalizedEmail] ?? null;
        const profileName = (profile?.name ?? "").toString().trim();
        const profileEmail = (profile?.email ?? trimmed).toString().trim();
        const hasName = Boolean(profileName);

        return {
          email: profileEmail,
          normalizedEmail,
          rawEmail: trimmed,
          label: hasName
            ? profileName
            : `${profileEmail} (ожидает подключения)`,
          displayName: hasName ? profileName : profileEmail,
        };
      })
      .filter(Boolean);

    const directoryEntries = Object.values(userDirectory ?? {});
    const availableInviteOptions = directoryEntries
      .map((profile) => {
        if (!profile) return null;
        const rawEmail = (profile.email ?? "").toString().trim();
        if (!isValidEmail(rawEmail)) return null;
        const normalizedEmail = normalizeEmailValue(rawEmail);
        if (!normalizedEmail) return null;
        if (normalizedEmail === normalizedCurrentEmail) {
          return null;
        }
        if (normalizedMemberSet.has(normalizedEmail)) {
          return null;
        }

        const name = (profile.name ?? "").toString().trim();
        return {
          email: rawEmail,
          normalizedEmail,
          label: name || `${rawEmail} (ожидает подключения)`,
        };
      })
      .filter(Boolean)
      .sort((first, second) =>
        first.label.localeCompare(second.label, "ru", { sensitivity: "base" })
      );

    const totalMembersCount = normalizedMemberSet.size;

    return {
      memberEntries,
      availableInviteOptions,
      totalMembersCount,
      normalizedMemberSet,
      normalizedCurrentEmail,
    };
  }, [members, currentUserEmail, userDirectory]);
}
