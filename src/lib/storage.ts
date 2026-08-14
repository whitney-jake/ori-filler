import { parseProfile } from "../types/profile";
import type { Profile } from "../types/profile";

const IMPORTED_PROFILES_KEY = "importedProfiles";

export async function loadBundledProfiles(): Promise<Profile[]> {
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
  const profiles: Profile[] = [];
  for (const name of names) {
    if (typeof name !== "string") {
      continue;
    }
    try {
      const response = await fetch(chrome.runtime.getURL("profiles/" + name));
      if (!response.ok) {
        continue;
      }
      const raw = await response.json();
      profiles.push(parseProfile(raw));
    } catch {
      continue;
    }
  }
  return profiles;
}

export async function loadImportedProfiles(): Promise<Profile[]> {
  const entries = await readImportedEntries();
  const profiles: Profile[] = [];
  for (const entry of entries) {
    try {
      profiles.push(parseProfile(entry));
    } catch {
      continue;
    }
  }
  return profiles;
}

export async function saveImportedProfile(profile: Profile): Promise<void> {
  const entries = await readImportedEntries();
  const index = entries.findIndex((entry) => profileId(entry) === profile.id);
  if (index >= 0) {
    entries[index] = profile;
  } else {
    entries.push(profile);
  }
  await chrome.storage.local.set({ [IMPORTED_PROFILES_KEY]: entries });
}

export async function deleteImportedProfile(id: string): Promise<void> {
  const entries = await readImportedEntries();
  const remaining = entries.filter((entry) => profileId(entry) !== id);
  await chrome.storage.local.set({ [IMPORTED_PROFILES_KEY]: remaining });
}

export async function getAllProfiles(): Promise<{ bundled: Profile[]; imported: Profile[] }> {
  const [bundled, imported] = await Promise.all([loadBundledProfiles(), loadImportedProfiles()]);
  return { bundled, imported };
}

async function readImportedEntries(): Promise<unknown[]> {
  const result = await chrome.storage.local.get(IMPORTED_PROFILES_KEY);
  const entries = result[IMPORTED_PROFILES_KEY];
  return Array.isArray(entries) ? entries : [];
}

function profileId(entry: unknown): string | undefined {
  if (entry === null || typeof entry !== "object") {
    return undefined;
  }
  const id = (entry as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}
