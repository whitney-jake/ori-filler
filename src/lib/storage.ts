import { parseProfile } from "../types/profile";
import type { Profile } from "../types/profile";

const IMPORTED_PROFILES_KEY = "importedProfiles";
const STEP_KEY_PREFIX = "step:";
const stepCache = new Map<string, number>();

let bundledCache: Profile[] | null = null;
let importedCache: Profile[] | null = null;
let rawEntriesCache: unknown[] | null = null;

export function clearProfileCache(): void {
  bundledCache = null;
  importedCache = null;
  rawEntriesCache = null;
}

export async function loadBundledProfiles(): Promise<Profile[]> {
  if (bundledCache !== null) {
    return bundledCache;
  }
  let names: string[];
  try {
    const response = await fetch(chrome.runtime.getURL("profiles/index.json"));
    if (!response.ok) {
      return [];
    }
    names = await response.json();
  } catch {
    return [];
  }
  if (!Array.isArray(names)) {
    return [];
  }
  const validNames = names.filter((n): n is string => typeof n === "string");
  const results = await Promise.allSettled(
    validNames.map(async (name) => {
      const response = await fetch(chrome.runtime.getURL("profiles/" + name));
      if (!response.ok) {
        throw new Error(`Failed to load ${name}`);
      }
      const raw = await response.json();
      return parseProfile(raw);
    })
  );
  bundledCache = results
    .filter((r): r is PromiseFulfilledResult<Profile> => r.status === "fulfilled")
    .map((r) => r.value);
  return bundledCache;
}

export async function loadImportedProfiles(): Promise<Profile[]> {
  if (importedCache !== null) {
    return importedCache;
  }
  const entries = await readImportedEntries();
  const profiles: Profile[] = [];
  for (const entry of entries) {
    try {
      profiles.push(parseProfile(entry));
    } catch {
      continue;
    }
  }
  importedCache = profiles;
  return importedCache;
}

export async function saveImportedProfile(profile: Profile): Promise<void> {
  const entries = rawEntriesCache !== null ? [...rawEntriesCache] : await readImportedEntries();
  const index = entries.findIndex((entry) => profileId(entry) === profile.id);
  if (index >= 0) {
    entries[index] = profile;
  } else {
    entries.push(profile);
  }
  rawEntriesCache = entries;
  await chrome.storage.local.set({ [IMPORTED_PROFILES_KEY]: entries });
  importedCache = null;
}

export async function deleteImportedProfile(id: string): Promise<void> {
  const entries = rawEntriesCache !== null ? [...rawEntriesCache] : await readImportedEntries();
  const remaining = entries.filter((entry) => profileId(entry) !== id);
  rawEntriesCache = remaining;
  await chrome.storage.local.set({ [IMPORTED_PROFILES_KEY]: remaining });
  importedCache = null;
}

export async function getAllProfiles(): Promise<{ bundled: Profile[]; imported: Profile[] }> {
  const [bundled, imported] = await Promise.all([loadBundledProfiles(), loadImportedProfiles()]);
  return { bundled, imported };
}

async function readImportedEntries(): Promise<unknown[]> {
  if (rawEntriesCache !== null) {
    return rawEntriesCache;
  }
  const result = await chrome.storage.local.get(IMPORTED_PROFILES_KEY);
  const entries = result[IMPORTED_PROFILES_KEY];
  const parsed = Array.isArray(entries) ? entries : [];
  rawEntriesCache = parsed;
  return parsed;
}

function profileId(entry: unknown): string | undefined {
  if (entry === null || typeof entry !== "object") {
    return undefined;
  }
  const id = (entry as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

export function saveStep(profileId: string, step: number): void {
  stepCache.set(profileId, step);
  void chrome.storage.local.set({ [STEP_KEY_PREFIX + profileId]: step });
}

export async function loadStep(profileId: string): Promise<number> {
  const cached = stepCache.get(profileId);
  if (cached !== undefined) {
    return cached;
  }
  const result = await chrome.storage.local.get(STEP_KEY_PREFIX + profileId);
  const value = result[STEP_KEY_PREFIX + profileId];
  const step = typeof value === "number" && value >= 1 ? value : 1;
  stepCache.set(profileId, step);
  return step;
}

export function clearStepCache(): void {
  stepCache.clear();
}
