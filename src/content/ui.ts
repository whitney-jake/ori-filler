import cssText from "../ui/styles.css";
import type { Profile, ProfileField } from "../types/profile";
import type { FillStatus } from "../lib/fill";
import { shouldSkipField } from "../lib/step";

export interface UiController {
  onFill(profile: Profile): void;
  onImport(text: string): void;
  onDelete(profile: Profile): void;
  onClose(): void;
  onOpen(): void;
  onAmbiguityPick(profile: Profile, field: ProfileField, matchIndex: number): void;
  onStepChange(step: number): void;
  onFillComplete(): void;
}

let controller: UiController | null = null;
let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let fillButtonEl: HTMLButtonElement | null = null;
let modalEl: HTMLDivElement | null = null;
let profileListEl: HTMLDivElement | null = null;
let statusAreaEl: HTMLDivElement | null = null;
let pickerEl: HTMLDivElement | null = null;
let fileInputEl: HTMLInputElement | null = null;
let stepNavEl: HTMLDivElement | null = null;
let stepDecBtn: HTMLButtonElement | null = null;
let stepIncBtn: HTMLButtonElement | null = null;
let stepValueEl: HTMLSpanElement | null = null;

let profiles: Profile[] = [];
let activeProfile: Profile | null = null;
let activeMaxStep = 1;
let activeStep = 1;
let lastFailedElement: Element | null = null;
let renderedStatusCount = 0;
let currentFields: ProfileField[] = [];
const fillRowButtons = new Set<HTMLButtonElement>();
let activeFillButton: HTMLButtonElement | null = null;
const SPINNER_SVG = `<svg class="ff-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>`;

const fieldLabelRe = /@(?:id|name|data-testid)="([^"]+)"/i;

export function injectUi(c: UiController): void {
  controller = c;
  if (host) {
    return;
  }

  host = document.createElement("div");
  host.id = "form-filler-ui";
  document.body.appendChild(host);
  shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = cssText;
  shadow.appendChild(style);

  fillButtonEl = document.createElement("button");
  fillButtonEl.className = "ff-fill-button";
  fillButtonEl.type = "button";
  fillButtonEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 20" width="24" height="24" fill="currentColor"><path d="M23.6804 5.46749C21.9876 3.00135 18.6532 1.57089 14.7572 1.64121C11.4708 1.70035 8.53795 2.82394 6.49955 4.80261C4.54755 6.69657 3.53955 9.19468 3.66115 11.8382C3.80675 15.0348 5.67875 17.3635 8.78595 18.4647C4.88675 17.3171 2.09635 14.5793 1.92675 10.8729C1.67235 5.26771 6.60195 0.442505 13.9892 0.30825C15.37 0.282677 16.6932 0.424924 17.922 0.712614C16.3476 0.220345 14.5908 -0.0305851 12.738 0.00297875C4.94275 0.143627 -0.258851 5.23734 0.00994914 11.1542C0.253149 16.4732 5.60995 19.9079 12.0724 19.7897C14.7636 19.7401 17.1492 19.0609 19.1124 17.9596C20.386 17.3475 21.3396 16.5931 22.0276 15.9043C23.514 14.4147 24.4804 12.468 24.7476 10.4285C24.7828 10.013 24.7892 9.59904 24.7716 9.19468C24.7108 7.85532 24.3412 6.59907 23.6804 5.46749ZM19.5044 9.95866C19.6356 12.3769 17.7844 14.9133 14.4612 14.9741C11.6948 15.0236 9.82755 13.5532 9.70115 11.2245C9.63395 9.96505 10.066 8.77114 10.9188 7.85692C13.2356 7.85372 14.9604 9.03645 15.0372 10.7003C15.1268 12.6629 13.7684 13.9751 12.0804 14.5297C12.3348 14.5489 12.5972 14.5585 12.8708 14.5537C15.546 14.5058 18.3156 12.8659 18.1828 9.92349C18.0964 8.02953 16.1012 6.68858 13.4388 6.73812C13.0356 6.74612 12.6308 6.78927 12.234 6.86759C12.9684 6.49039 13.8164 6.28102 14.7252 6.26503C17.3764 6.21709 19.386 7.77061 19.5028 9.96025L19.5044 9.95866Z"/></svg>`;
  fillButtonEl.addEventListener("click", openModal);
  shadow.appendChild(fillButtonEl);

  modalEl = document.createElement("div");
  modalEl.className = "ff-modal";
  modalEl.hidden = true;

  const header = document.createElement("div");
  header.className = "ff-modal-header";
  const title = document.createElement("span");
  title.className = "ff-modal-title";
  title.textContent = "Form Filler";
  const headerActions = document.createElement("div");
  headerActions.className = "ff-header-actions";
  const importButton = document.createElement("button");
  importButton.className = "ff-icon-button";
  importButton.type = "button";
  importButton.title = "Import";
  importButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  importButton.addEventListener("click", () => {
    fileInputEl?.click();
  });
  const closeButton = document.createElement("button");
  closeButton.className = "ff-icon-button";
  closeButton.type = "button";
  closeButton.title = "Close";
  closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeButton.addEventListener("click", closeModal);
  headerActions.appendChild(importButton);
  headerActions.appendChild(closeButton);
  header.appendChild(title);
  header.appendChild(headerActions);
  modalEl.appendChild(header);

  profileListEl = document.createElement("div");
  profileListEl.className = "ff-profile-list";
  modalEl.appendChild(profileListEl);

  stepNavEl = document.createElement("div");
  stepNavEl.className = "ff-step-nav";
  stepNavEl.hidden = true;
  stepDecBtn = document.createElement("button");
  stepDecBtn.className = "ff-step-dec";
  stepDecBtn.type = "button";
  stepDecBtn.textContent = "-";
  stepDecBtn.addEventListener("click", () => {
    if (activeProfile && activeStep > 1) {
      activeStep -= 1;
      updateStepNav();
      controller?.onStepChange(activeStep);
    }
  });
  stepValueEl = document.createElement("span");
  stepValueEl.className = "ff-step-value";
  stepIncBtn = document.createElement("button");
  stepIncBtn.className = "ff-step-inc";
  stepIncBtn.type = "button";
  stepIncBtn.textContent = "+";
  stepIncBtn.addEventListener("click", () => {
    if (activeProfile && activeStep < activeMaxStep) {
      activeStep += 1;
      updateStepNav();
      controller?.onStepChange(activeStep);
    }
  });
  stepNavEl.appendChild(stepDecBtn);
  stepNavEl.appendChild(stepValueEl);
  stepNavEl.appendChild(stepIncBtn);
  modalEl.appendChild(stepNavEl);

  statusAreaEl = document.createElement("div");
  statusAreaEl.className = "ff-status-area";
  modalEl.appendChild(statusAreaEl);

  pickerEl = document.createElement("div");
  pickerEl.className = "ff-picker";
  pickerEl.hidden = true;
  modalEl.appendChild(pickerEl);

  fileInputEl = document.createElement("input");
  fileInputEl.type = "file";
  fileInputEl.accept = ".json,application/json";
  fileInputEl.hidden = true;
  fileInputEl.addEventListener("change", handleFileChange);
  modalEl.appendChild(fileInputEl);

  shadow.appendChild(modalEl);
}

export function renderProfileList(list: Profile[]): void {
  const changed = !profilesEqual(profiles, list);
  profiles = list;
  if (changed) {
    clearStatus();
    clearPicker();
    clearOutline();
  }
  if (!profileListEl) {
    return;
  }
  if (!changed) {
    return;
  }
  fillRowButtons.clear();
  profileListEl.replaceChildren();
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ff-empty";
    empty.textContent = "No profiles for this page.";
    profileListEl.appendChild(empty);
    return;
  }
  for (const profile of list) {
    profileListEl.appendChild(buildProfileRow(profile));
  }
}

function profilesEqual(a: Profile[], b: Profile[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) {
      return false;
    }
  }
  return true;
}

export function setFillRowDisabled(disabled: boolean): void {
  for (const btn of fillRowButtons) {
    btn.disabled = disabled;
    if (disabled && btn === activeFillButton) {
      btn.textContent = "";
      btn.insertAdjacentHTML("beforeend", SPINNER_SVG);
    } else if (!disabled && btn === activeFillButton) {
      btn.textContent = "Fill";
      activeFillButton = null;
    }
  }
  if (!disabled) {
    activeFillButton = null;
  }
}

export function renderStepFields(profile: Profile, step: number): void {
  clearStatus();
  currentFields = profile.fields.filter((f) => !shouldSkipField(f, step));
  if (!statusAreaEl || currentFields.length === 0) {
    return;
  }
  const frag = document.createDocumentFragment();
  for (const field of currentFields) {
    const item = document.createElement("div");
    item.className = "ff-status-item";
    const label = document.createElement("span");
    label.className = "ff-status-label";
    label.textContent = fieldDisplayValue(field);
    label.title = field.xpath;
    label.addEventListener("dblclick", () => {
      navigator.clipboard.writeText(field.xpath);
    });
    const badge = document.createElement("span");
    badge.className = "ff-status-pending";
    badge.textContent = "…";
    item.appendChild(label);
    item.appendChild(badge);
    frag.appendChild(item);
  }
  statusAreaEl.appendChild(frag);
}

function buildStatusBadge(status: FillStatus): HTMLSpanElement {
  const badge = document.createElement("span");
  if (status.status === "skipped") {
    badge.className = "ff-status-skipped";
    badge.textContent = "⏭";
  } else if (status.status === "ok") {
    badge.className = "ff-status-ok";
    badge.textContent = "✓";
  } else {
    badge.className = "ff-status-failed";
    badge.textContent = "✗";
  }
  return badge;
}

function appendStatusDetails(item: HTMLDivElement, entry: { status: FillStatus; warning?: string }): void {
  if (entry.status.message) {
    const message = document.createElement("div");
    message.className = "ff-status-message";
    message.textContent = entry.status.message;
    item.appendChild(message);
  }
  if (entry.warning) {
    const warning = document.createElement("div");
    warning.className = "ff-status-warning";
    warning.textContent = entry.warning;
    item.appendChild(warning);
  }
}

export function showFillProgress(
  statuses: { field: ProfileField; status: FillStatus; warning?: string }[]
): void {
  clearPicker();
  if (!statusAreaEl) {
    return;
  }
  statusAreaEl.replaceChildren();
  renderedStatusCount = 0;
  const frag = document.createDocumentFragment();
  const statusByField = new Map<ProfileField, { field: ProfileField; status: FillStatus; warning?: string }>();
  for (const entry of statuses) {
    statusByField.set(entry.field, entry);
  }
  const extraEntries = statuses.filter((s) => !currentFields.includes(s.field));
  const fieldsToShow = currentFields.length > 0
    ? currentFields
    : statuses.map((s) => s.field);
  for (const field of fieldsToShow) {
    const entry = statusByField.get(field);
    const item = document.createElement("div");
    item.className = "ff-status-item";
    const label = document.createElement("span");
    label.className = "ff-status-label";
    label.textContent = fieldDisplayValue(field);
    label.title = field.xpath;
    label.addEventListener("dblclick", () => {
      navigator.clipboard.writeText(field.xpath);
    });
    item.appendChild(label);
    if (entry) {
      item.appendChild(buildStatusBadge(entry.status));
      appendStatusDetails(item, entry);
    } else {
      const badge = document.createElement("span");
      badge.className = "ff-status-pending";
      badge.textContent = "…";
      item.appendChild(badge);
    }
    frag.appendChild(item);
  }
  for (const entry of extraEntries) {
    const item = document.createElement("div");
    item.className = "ff-status-item";
    const label = document.createElement("span");
    label.className = "ff-status-label";
    label.textContent = fieldDisplayValue(entry.field);
    label.title = entry.field.xpath;
    label.addEventListener("dblclick", () => {
      navigator.clipboard.writeText(entry.field.xpath);
    });
    item.appendChild(label);
    item.appendChild(buildStatusBadge(entry.status));
    appendStatusDetails(item, entry);
    frag.appendChild(item);
  }
  statusAreaEl.appendChild(frag);
}

export function showFailure(field: ProfileField, message: string, el: Element): void {
  clearPicker();
  clearOutline();
  lastFailedElement = el;
  (el as HTMLElement).style.outline = "2px solid red";
  if (!statusAreaEl) {
    return;
  }
  statusAreaEl.replaceChildren();
  renderedStatusCount = 0;
  const item = document.createElement("div");
  item.className = "ff-failure";
  const label = document.createElement("div");
  label.className = "ff-failure-label";
  label.textContent = fieldDisplayValue(field);
  label.title = field.xpath;
  label.addEventListener("dblclick", () => {
    navigator.clipboard.writeText(field.xpath);
  });
  const reason = document.createElement("div");
  reason.className = "ff-failure-message";
  reason.textContent = message;
  item.appendChild(label);
  item.appendChild(reason);
  statusAreaEl.appendChild(item);
}

export function showImportError(message: string): void {
  clearPicker();
  clearOutline();
  if (!statusAreaEl) {
    return;
  }
  statusAreaEl.replaceChildren();
  renderedStatusCount = 0;
  const item = document.createElement("div");
  item.className = "ff-failure";
  const label = document.createElement("div");
  label.className = "ff-failure-label";
  label.textContent = "Import failed";
  const reason = document.createElement("div");
  reason.className = "ff-failure-message";
  reason.textContent = message;
  item.appendChild(label);
  item.appendChild(reason);
  statusAreaEl.appendChild(item);
}

export function setAmbiguityPicker(field: ProfileField, matches: Element[]): void {
  if (!pickerEl) {
    return;
  }
  pickerEl.replaceChildren();
  pickerEl.hidden = false;
  const title = document.createElement("div");
  title.className = "ff-picker-title";
  title.textContent = `Ambiguous field: ${fieldLabel(field)}. Choose the target.`;
  pickerEl.appendChild(title);

  const list = document.createElement("div");
  list.className = "ff-picker-list";
  matches.forEach((match, index) => {
    const item = document.createElement("button");
    item.className = "ff-picker-item";
    item.type = "button";
    item.addEventListener("click", () => {
      if (activeProfile) {
        controller?.onAmbiguityPick(activeProfile, field, index);
      }
      pickerEl!.hidden = true;
    });
    const tag = document.createElement("span");
    tag.className = "ff-picker-tag";
    tag.textContent = `#${index + 1} ${match.tagName.toLowerCase()}`;
    const snippet = document.createElement("span");
    snippet.className = "ff-picker-snippet";
    snippet.textContent = snippetOf(match);
    item.appendChild(tag);
    item.appendChild(snippet);
    list.appendChild(item);
  });
  pickerEl.appendChild(list);

  const cancel = document.createElement("button");
  cancel.className = "ff-picker-cancel";
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    if (activeProfile) {
      controller?.onAmbiguityPick(activeProfile, field, -1);
    }
    pickerEl!.hidden = true;
  });
  pickerEl.appendChild(cancel);
}

function openModal(): void {
  if (!modalEl) {
    return;
  }
  modalEl.hidden = false;
  controller?.onOpen();
}

function closeModal(): void {
  if (!modalEl) {
    return;
  }
  modalEl.hidden = true;
  controller?.onClose();
}

function handleFileChange(): void {
  const input = fileInputEl;
  if (!input) {
    return;
  }
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === "string" ? reader.result : "";
    controller?.onImport(text);
  };
  reader.onerror = () => {
    input.value = "";
  };
  reader.readAsText(file);
  input.value = "";
}

function buildProfileRow(profile: Profile): HTMLElement {
  const row = document.createElement("div");
  row.className = "ff-profile-row";

  const info = document.createElement("div");
  info.className = "ff-profile-info";
  const name = document.createElement("div");
  name.className = "ff-profile-name";
  name.textContent = profile.name;
  info.appendChild(name);
  const description = document.createElement("div");
  description.className = "ff-profile-description";
  description.textContent = profile.description ?? "";
  info.appendChild(description);
  const count = document.createElement("div");
  count.className = "ff-profile-count";
  count.textContent = `${profile.fields.length} field${profile.fields.length === 1 ? "" : "s"}`;
  info.appendChild(count);

  const actions = document.createElement("div");
  actions.className = "ff-profile-actions";
  const fillButton = document.createElement("button");
  fillButton.className = "ff-fill-row-button";
  fillButton.type = "button";
  fillButton.textContent = "Fill";
  fillButton.addEventListener("click", () => {
    activeFillButton = fillButton;
    activateProfile(profile);
    controller?.onFill(profile);
  });
  fillRowButtons.add(fillButton);
  const deleteButton = document.createElement("button");
  deleteButton.className = "ff-delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => {
    controller?.onDelete(profile);
  });
  actions.appendChild(fillButton);
  actions.appendChild(deleteButton);

  row.appendChild(info);
  row.appendChild(actions);
  return row;
}

export function clearStatus(): void {
  if (!statusAreaEl) {
    return;
  }
  statusAreaEl.replaceChildren();
  renderedStatusCount = 0;
  currentFields = [];
}

function clearPicker(): void {
  if (!pickerEl) {
    return;
  }
  pickerEl.replaceChildren();
  pickerEl.hidden = true;
}

function clearOutline(): void {
  if (lastFailedElement) {
    (lastFailedElement as HTMLElement).style.outline = "";
    lastFailedElement = null;
  }
}

function fieldDisplayValue(field: ProfileField): string {
  let display: string;
  const v = field.value;
  if (typeof v === "boolean") {
    display = v ? "checked" : "unchecked";
  } else {
    display = v.length > 40 ? v.slice(0, 40) + "\u2026" : v;
  }
  return field.label ? `${field.label}: ${display}` : display;
}

function fieldLabel(field: ProfileField): string {
  const attr = field.xpath.match(fieldLabelRe)?.[1];
  if (attr) {
    return attr;
  }
  return field.xpath;
}

function snippetOf(el: Element): string {
  const text =
    el.textContent?.trim() || (el as HTMLInputElement).value || "";
  const flat = text.replace(/\s+/g, " ");
  if (flat.length > 60) {
    return `${flat.slice(0, 60)}...`;
  }
  return flat;
}

function getMaxStep(profile: Profile): number {
  let max = 1;
  for (const field of profile.fields) {
    if (field.step !== undefined && field.step > max) {
      max = field.step;
    }
  }
  return max;
}

function updateStepNav(): void {
  if (!stepNavEl || !stepDecBtn || !stepIncBtn || !stepValueEl) {
    return;
  }
  stepNavEl.hidden = false;
  stepValueEl.textContent = `${activeStep}/${activeMaxStep}`;
  stepDecBtn.disabled = activeStep <= 1;
  stepIncBtn.disabled = activeStep >= activeMaxStep;
}

export function advanceStep(): void {
  if (activeProfile && activeStep < activeMaxStep) {
    activeStep += 1;
    updateStepNav();
    controller?.onStepChange(activeStep);
  }
}

export function setActiveStep(step: number): void {
  activeStep = step;
  updateStepNav();
  if (activeProfile) {
    renderStepFields(activeProfile, step);
  }
}

function activateProfile(profile: Profile): void {
  activeProfile = profile;
  activeMaxStep = getMaxStep(profile);
  updateStepNav();
  renderStepFields(profile, activeStep);
}
