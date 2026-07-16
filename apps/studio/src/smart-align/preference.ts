import { useCallback, useState } from "react";

export const SMART_ALIGN_PREFERENCE_VERSION = 1;
export const SMART_ALIGN_PREFERENCE_KEY = `web3d.studio.smart-align.v${SMART_ALIGN_PREFERENCE_VERSION}`;

export interface SmartAlignPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function resolveSmartAlignPreference(
  storage: SmartAlignPreferenceStorage | null = smartAlignPreferenceStorage(),
): boolean {
  if (storage === null) return true;
  try {
    const value = storage.getItem(SMART_ALIGN_PREFERENCE_KEY);
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    return true;
  }
  return true;
}

export function persistSmartAlignPreference(
  enabled: boolean,
  storage: SmartAlignPreferenceStorage | null = smartAlignPreferenceStorage(),
): void {
  if (storage === null) return;
  try {
    storage.setItem(SMART_ALIGN_PREFERENCE_KEY, String(enabled));
  } catch {
    // Browser privacy and quota policies may make localStorage unavailable.
  }
}

export function useSmartAlignPreference(): readonly [boolean, () => void] {
  const [enabled, setEnabled] = useState(resolveSmartAlignPreference);
  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      persistSmartAlignPreference(next);
      return next;
    });
  }, []);
  return [enabled, toggle] as const;
}

function smartAlignPreferenceStorage(): SmartAlignPreferenceStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
