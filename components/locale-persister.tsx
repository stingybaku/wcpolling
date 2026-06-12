"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { useSession } from "next-auth/react";

/**
 * Persists the signed-in user's active language to their account so that
 * communications (emails) are sent in it. Fires on first authenticated load
 * (which backfills existing users) and whenever the user switches language.
 * No-op when signed out; the endpoint only writes when the value changes.
 */
export function LocalePersister() {
  const locale = useLocale();
  const { status } = useSession();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (lastSent.current === locale) return;
    lastSent.current = locale;
    fetch("/api/profile/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    }).catch(() => {
      lastSent.current = null; // allow a retry on next change
    });
  }, [locale, status]);

  return null;
}
