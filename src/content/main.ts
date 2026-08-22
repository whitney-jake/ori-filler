import type { Profile, ProfileField } from "../types/profile";
import { parseProfile } from "../types/profile";
import { anyPatternMatches } from "../lib/glob";
import { resolveField, clearXPathCache } from "../lib/xpath";
import { expand, TemplateError } from "../lib/templates";
import { fillField, hasValue } from "../lib/fill";
import { waitForElement, waitForListOption } from "../lib/wait";
import { shouldSkipField, hasLaterButton } from "../lib/step";
import type { FillStatus } from "../lib/fill";
import { getAllProfiles, saveImportedProfile, deleteImportedProfile, saveStep, loadStep } from "../lib/storage";
import {
  injectUi,
  renderProfileList,
  showFillProgress,
  showFailure,
  showImportError,
  setAmbiguityPicker,
  setFillRowDisabled,
  advanceStep,
  setActiveStep,
  clearStatus,
} from "./ui";
import type { UiController } from "./ui";

type StatusEntry = { field: ProfileField; status: FillStatus; warning?: string };

interface FilledField {
  element: Element;
  field: ProfileField;
  value: string | boolean;
}

interface FillState {
  profile: Profile;
  fieldIndex: number;
  statuses: StatusEntry[];
  filledFields: FilledField[];
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
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let waitCancel: (() => void) | null = null;
let currentStep = 1;
let lastFilledProfileId: string | null = null;

function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => {
    // Intentionally swallowed. UI feedback is not available for background tasks.
  });
}

function scheduleRefresh(): void {
  if (refreshTimer !== null) {
    return;
  }
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    fireAndForget(refreshProfiles());
  }, 80);
}

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
  fireAndForget(refreshProfiles());
}

function onClose(): void {
  clearFillState();
}

function onFill(profile: Profile): void {
  if (fillState !== null) {
    return;
  }
  clearStatus();
  lastFilledProfileId = profile.id;
  fillState = { profile, fieldIndex: 0, statuses: [], filledFields: [] };
  pendingPick = null;
  clearXPathCache();
  setFillRowDisabled(true);
  fireAndForget(loadStep(profile.id).then((step) => {
    currentStep = step;
    controller?.onStepChange(step);
    return advance();
  }));
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
  fireAndForget(saveImportedProfile(profile)
    .then(() => refreshProfiles())
    .catch((error) => showImportError(errorMessage(error))));
}

function onDelete(profile: Profile): void {
  if (importedProfiles.has(profile)) {
    fireAndForget(deleteImportedProfile(profile.id)
      .then(() => refreshProfiles())
      .catch(() => {
        // The delete failed. The list stays unchanged.
      }));
  } else {
    deletedBundledIds.add(profile.id);
    fireAndForget(refreshProfiles());
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
      state.statuses.push(skippedStatus(field, "not found"));
      state.fieldIndex = pick.fieldIndex + 1;
      fireAndForget(advance());
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
    fireAndForget(advance());
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
    clearXPathCache();
    const field = state.profile.fields[index];
    const xpath = expand(field.xpath, field);
    const resolvedField = { ...field, xpath };
    let result = resolveField(document, resolvedField);
    if (result.status === "not-found") {
      const timeout = field.waitForMs ?? state.profile.waitForMs ?? 0;
      if (timeout > 0) {
        const handle = waitForElement(document, xpath, timeout);
        waitCancel = handle.cancel;
        result = await handle.promise;
        waitCancel = null;
        if (fillState !== state) {
          return;
        }
      }
    }
    if (result.status === "not-found") {
      if (field.optional) {
        state.statuses.push({ field, status: { status: "ok" }, warning: "Field not found" });
        state.fieldIndex += 1;
        showFillProgress(state.statuses);
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
      state.statuses.push(skippedStatus(field, "already filled"));
      state.fieldIndex += 1;
      showFillProgress(state.statuses);
      continue;
    }
    if (!fillEntry(state, field, el)) {
      return;
    }
    const value = typeof field.value === "string" ? expand(field.value, field) : field.value;
    if (field.type !== "button" && field.type !== "button-group") {
      state.filledFields.push({ element: el, field, value });
    }
    if (state.profile.reVerifyFields) {
      let retries = 0;
      while (retries < MAX_REVERIFY_RETRIES) {
        const failed = state.filledFields.filter(
          (prev) => prev.field !== field && !isStillCorrect(prev.element, prev.field, prev.value)
        );
        if (failed.length === 0) {
          break;
        }
        for (const prev of failed) {
          fillField(prev.element, prev.field, prev.value);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        if (fillState !== state) {
          return;
        }
        retries += 1;
      }
    }
    state.fieldIndex += 1;
    showFillProgress(state.statuses);
    if (field.type === "button" || field.type === "button-group") {
      if (!hasLaterButton(state.profile.fields, index, currentStep)) {
        break;
      }
    }
    if (field.type === "autocomplete") {
      const value = typeof field.value === "string" ? expand(field.value, field) : field.value;
      const timeout = field.waitForMs ?? state.profile.waitForMs ?? 0;
      if (timeout > 0) {
        const handle = waitForListOption(document, value as string, timeout);
        waitCancel = handle.cancel;
        const optionResult = await handle.promise;
        waitCancel = null;
        if (fillState !== state) {
          return;
        }
        if (optionResult.status === "ok" && optionResult.element !== undefined) {
          (optionResult.element as HTMLElement).click();
        }
      }
    }
    if (field.waitForNext) {
      const nextField = findNextField(state.profile.fields, index, currentStep);
      if (nextField !== null) {
        const nextXpath = expand(nextField.xpath, nextField);
        const timeout = field.waitForMs ?? state.profile.waitForMs ?? 0;
        if (timeout > 0) {
          const handle = waitForElement(document, nextXpath, timeout);
          waitCancel = handle.cancel;
          await handle.promise;
          waitCancel = null;
          if (fillState !== state) {
            return;
          }
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      if (fillState !== state) {
        return;
      }
    }
  }
  showFillProgress(state.statuses);
  clearFillState();
  controller?.onFillComplete();
}

function fillEntry(state: FillState, field: ProfileField, el: Element): boolean {
  let value: string | boolean;
  try {
    value = typeof field.value === "string" ? expand(field.value, field) : field.value;
  } catch (error) {
    const message = error instanceof TemplateError ? error.message : errorMessage(error);
    if (field.required !== false) {
      showFillProgress(state.statuses);
      showFailure(field, message, el);
      clearFillState();
      return false;
    }
    state.statuses.push({ field, status: { status: "failed", message }, warning: message });
    return true;
  }
  const result = fillField(el, field, value);
  if (result.status === "failed" && field.required !== false) {
    showFillProgress(state.statuses);
    showFailure(field, result.message ?? "", el);
    clearFillState();
    return false;
  }
  state.statuses.push({ field, status: result, warning: result.status === "failed" ? result.message : undefined });
  return true;
}

function skippedStatus(field: ProfileField, message: string): StatusEntry {
  return { field, status: { status: "skipped", message } };
}

const MAX_REVERIFY_RETRIES = 3;

function isStillCorrect(el: Element, field: ProfileField, value: string | boolean): boolean {
  const type = field.type ?? "text";
  if (type === "radio" || type === "checkbox") {
    const input = el.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
    return input !== null && input.checked === Boolean(value);
  }
  if (type === "select") {
    if (el instanceof HTMLSelectElement) {
      return el.value === value;
    }
    const select = el.querySelector<HTMLSelectElement>("select");
    return select !== null && select.value === value;
  }
  if (type === "text" || type === "date" || type === "autocomplete") {
    if (el instanceof HTMLInputElement) {
      return el.value === value;
    }
    const input = el.querySelector<HTMLInputElement>("input");
    return input !== null && input.value === value;
  }
  return true;
}

function findNextField(
  fields: ProfileField[],
  fromIndex: number,
  currentStep: number,
): ProfileField | null {
  for (let i = fromIndex + 1; i < fields.length; i++) {
    if (!shouldSkipField(fields[i], currentStep)) {
      return fields[i];
    }
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clearFillState(): void {
  fillState = null;
  pendingPick = null;
  if (waitCancel !== null) {
    waitCancel();
    waitCancel = null;
  }
  clearXPathCache();
  setFillRowDisabled(false);
}

function onStepChange(step: number): void {
  currentStep = step;
  setActiveStep(step);
  if (lastFilledProfileId !== null) {
    saveStep(lastFilledProfileId, step);
  }
}

function onFillComplete(): void {
  advanceStep();
}

const controller: UiController = {
  onFill,
  onImport,
  onDelete,
  onClose,
  onOpen,
  onAmbiguityPick,
  onStepChange,
  onFillComplete,
};

injectUi(controller);
fireAndForget(refreshProfiles());
window.addEventListener("popstate", scheduleRefresh, { passive: true });
window.addEventListener("hashchange", scheduleRefresh, { passive: true });
