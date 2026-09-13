import { storageGet, storageSet } from "./storage.js";

const USAGE_KEY = "chipUsage";

/**
 * Purely a client-side UI preference, not garden data — stays in local
 * storage rather than round-tripping through the backend. Fire-and-forget:
 * personalization should never be able to break the actual log flow.
 */
export async function recordChipUsage(eventType) {
  try {
    const existing = await storageGet(USAGE_KEY);
    const counts = existing ? JSON.parse(existing.value) : {};
    counts[eventType] = (counts[eventType] || 0) + 1;
    await storageSet(USAGE_KEY, JSON.stringify(counts));
  } catch {
    // no-op — losing a usage count is fine, breaking logging isn't
  }
}

export async function getChipUsage() {
  try {
    const existing = await storageGet(USAGE_KEY);
    return existing ? JSON.parse(existing.value) : {};
  } catch {
    return {};
  }
}

/** Ranks `defaultOrder` by usage count, ties broken by the default order. */
export function sortByUsage(defaultOrder, counts) {
  return [...defaultOrder].sort((a, b) => {
    const diff = (counts[b] || 0) - (counts[a] || 0);
    return diff !== 0 ? diff : defaultOrder.indexOf(a) - defaultOrder.indexOf(b);
  });
}