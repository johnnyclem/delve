import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";

const REORDER_HINT_KEY_PREFIX = "delve:reorder-hint-dismissed";
const LEGACY_DESKTOP_PREFIX = "delve:subnav-reorder-hint-dismissed";
const LEGACY_MOBILE_PREFIX = "delve:triad-bottom-reorder-hint-dismissed";

export function useReorderHint(dismissed: boolean) {
  const { user } = useUser();
  const userId = user?.id;
  const storageKey = userId ? `${REORDER_HINT_KEY_PREFIX}:${userId}` : null;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!storageKey || !userId) return;
    try {
      if (localStorage.getItem(storageKey) === "1") return;
      const legacyDesktop = localStorage.getItem(`${LEGACY_DESKTOP_PREFIX}:${userId}`);
      const legacyMobile = localStorage.getItem(`${LEGACY_MOBILE_PREFIX}:${userId}`);
      if (legacyDesktop === "1" || legacyMobile === "1") {
        localStorage.setItem(storageKey, "1");
      }
    } catch { /* ignore */ }
  }, [storageKey, userId]);

  useEffect(() => {
    if (!storageKey) return;
    if (dismissed) return;
    try {
      if (localStorage.getItem(storageKey) === "1") return;
      setVisible(true);
    } catch { /* ignore */ }
  }, [dismissed, storageKey]);

  useEffect(() => {
    if (!dismissed) return;
    setVisible(false);
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
  }, [dismissed, storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    if (typeof window === "undefined") return;
    const onDismissed = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (detail?.key === storageKey) setVisible(false);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue === "1") setVisible(false);
    };
    window.addEventListener("delve:reorder-hint-dismissed", onDismissed as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("delve:reorder-hint-dismissed", onDismissed as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, "1");
      window.dispatchEvent(new CustomEvent("delve:reorder-hint-dismissed", { detail: { key: storageKey } }));
    } catch { /* ignore */ }
  };

  return { visible, dismiss };
}
