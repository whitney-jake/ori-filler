import type { Profile, ProfileField } from "../types/profile";
import { parseProfile } from "../types/profile";
import { anyPatternMatches } from "../lib/glob";
import { resolveAnchor, resolveField } from "../lib/xpath";
import { expand, TemplateError } from "../lib/templates";
import { fillField, hasValue } from "../lib/fill";
import type { FillStatus } from "../lib/fill";
import { getAllProfiles, saveImportedProfile, deleteImportedProfile } from "../lib/storage";
import {
  injectUi,
  renderProfileList,
  showFillProgress,
  showFailure,
  showImportError,
  setAmbiguityPicker,
} from "./ui";
import type { UiController } from "./ui";

type StatusEntry = { field: ProfileField; status: FillStatus };

interface FillState {
  profile: Profile;
  fieldIndex: number;
  statuses: StatusEntry[];
}

interface PendingPick {
  profile: Profile;
  field: ProfileField;
  fieldIndex: number;
  matches: Element[];
}

let fillState: FillState | null = null;
let pendingPick: PendingPick | null = null;
let importedProfiles = new Set<Profile>();
const deletedBundledIds = new Set<string>();

async function refreshProfiles(): Promise<void> {
  const { bundled, imported } = await getAllProfiles();
  importedProfiles = new Set(imported);
  const candidates = bundled
    .filter((profile) => !deletedBundledIds.has(profile.id))
    .concat(imported);
  const matching = candidates.filter((profile) =>
    anyPatternMatches(profile.urlPatterns, window.location.href)
  );
  renderProfileList(matching);
}

function onOpen(): void {
  clearFillState();
  void refreshProfiles();
}

function onClose(): void {
  clearFillState();
}

function onFill(profile: Profile): void {
  if (fillState !== null) {
    return;
  }
  fillState = { profile, fieldIndex: 0, statuses: [] };
  pendingPick = null;
  void advance();
}

function onImport(text: string): void {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    showImportError(errorMessage(error));
    return;
  }
  let profile: Profile;
  try {
    profile = parseProfile(raw);
  } catch (error) {
    showImportError(errorMessage(error));
    return;
  }
  void saveImportedProfile(profile)
    .then(() => refreshProfiles())
    .catch((error) => showImportError(errorMessage(error)));
}

function onDelete(profile: Profile): void {
  if (importedProfiles.has(profile)) {
    void deleteImportedProfile(profile.id)
      .then(() => refreshProfiles())
      .catch(() => {
        // The delete failed. The list stays unchanged.
      });
  } else {
    deletedBundledIds.add(profile.id);
    void refreshProfiles();
  }
}

function onAmbiguityPick(profile: Profile, field: ProfileField, matchIndex: number): void {
  const pick = pendingPick;
  const state = fillState;
  if (pick === null || state === null) {
    return;
  }
  if (pick.profile !== profile || pick.field !== field) {
    return;
  }
  if (matchIndex === -1) {
    pendingPick = null;
    if (field.optional) {
      state.statuses.push(skippedStatus(field, "skipped: not found"));
      state.fieldIndex = pick.fieldIndex + 1;
      void advance();
    } else {
      showFillProgress(state.statuses);
      showFailure(field, "no element chosen", document.createElement("span"));
      clearFillState();
    }
    return;
  }
  const el = pick.matches[matchIndex];
  if (el === undefined) {
    return;
  }
  pendingPick = null;
  state.fieldIndex = pick.fieldIndex + 1;
  if (fillEntry(state, field, el)) {
    void advance();
  }
}

async function advance(): Promise<void> {
  const state = fillState;
  if (state === null) {
    return;
  }
  while (state.fieldIndex < state.profile.fields.length) {
    const index = state.fieldIndex;
    if (index > 0) {
      const field = state.profile.fields[index];
      const delay = field.delayMs ?? state.profile.delayMs ?? 0;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      if (fillState !== state) {
        return;
      }
    }
    const field = state.profile.fields[index];
    const anchorResult = resolveAnchor(document, field.anchor);
    const result =
      anchorResult.status === "ok" && anchorResult.element !== undefined
        ? resolveField(document, anchorResult.element, field)
        : anchorResult;
    if (result.status === "not-found") {
      if (field.optional) {
        state.statuses.push(skippedStatus(field, "skipped: not found"));
        state.fieldIndex += 1;
        continue;
      }
      showFillProgress(state.statuses);
      showFailure(field, "field not found", document.createElement("span"));
      clearFillState();
      return;
    }
    if (result.status === "ambiguous") {
      pendingPick = { profile: state.profile, field, fieldIndex: index, matches: result.matches };
      setAmbiguityPicker(field, result.matches);
      return;
    }
    const el = result.element;
    if (el === undefined) {
      showFillProgress(state.statuses);
      showFailure(field, "field not found", document.createElement("span"));
      clearFillState();
      return;
    }
    if (field.skipIfFilled === true && hasValue(el)) {
      state.statuses.push(skippedStatus(field, "skipped: already filled"));
      state.fieldIndex += 1;
      continue;
    }
    if (!fillEntry(state, field, el)) {
      return;
    }
  }
  showFillProgress(state.statuses);
  clearFillState();
}

function fillEntry(state: FillState, field: ProfileField, el: Element): boolean {
  let value: string | boolean;
  try {
    value = typeof field.value === "string" ? expand(field.value) : field.value;
  } catch (error) {
    const message = error instanceof TemplateError ? error.message : errorMessage(error);
    if (field.required !== false) {
      showFillProgress(state.statuses);
      showFailure(field, message, el);
      clearFillState();
      return false;
    }
    state.statuses.push({ field, status: { status: "failed", message } });
    return true;
  }
  const result = fillField(el, field, value);
  if (result.status === "failed" && field.required !== false) {
    showFillProgress(state.statuses);
    showFailure(field, result.message ?? "", el);
    clearFillState();
    return false;
  }
  state.statuses.push({ field, status: result });
  return true;
}

function skippedStatus(field: ProfileField, message: string): StatusEntry {
  return { field, status: { status: "ok", message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clearFillState(): void {
  fillState = null;
  pendingPick = null;
}

const controller: UiController = {
  onFill,
  onImport,
  onDelete,
  onClose,
  onOpen,
  onAmbiguityPick,
};

injectUi(controller);
void refreshProfiles();
window.addEventListener("popstate", () => {
  void refreshProfiles();
});
window.addEventListener("hashchange", () => {
  void refreshProfiles();
});
