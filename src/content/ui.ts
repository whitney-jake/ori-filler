import cssText from "../ui/styles.css";
import type { Profile, ProfileField } from "../types/profile";
import type { FillStatus } from "../lib/fill";

export interface UiController {
  onFill(profile: Profile): void;
  onImport(text: string): void;
  onDelete(profile: Profile): void;
  onClose(): void;
  onOpen(): void;
  onAmbiguityPick(profile: Profile, field: ProfileField, matchIndex: number): void;
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

let profiles: Profile[] = [];
let activeProfile: Profile | null = null;
let lastFailedElement: Element | null = null;

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
  fillButtonEl.textContent = "Fill";
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
  const closeButton = document.createElement("button");
  closeButton.className = "ff-close-button";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closeModal);
  header.appendChild(title);
  header.appendChild(closeButton);
  modalEl.appendChild(header);

  profileListEl = document.createElement("div");
  profileListEl.className = "ff-profile-list";
  modalEl.appendChild(profileListEl);

  statusAreaEl = document.createElement("div");
  statusAreaEl.className = "ff-status-area";
  modalEl.appendChild(statusAreaEl);

  pickerEl = document.createElement("div");
  pickerEl.className = "ff-picker";
  pickerEl.hidden = true;
  modalEl.appendChild(pickerEl);

  const toolbar = document.createElement("div");
  toolbar.className = "ff-toolbar";
  const importButton = document.createElement("button");
  importButton.className = "ff-import-button";
  importButton.type = "button";
  importButton.textContent = "Import";
  importButton.addEventListener("click", () => {
    if (fileInputEl) {
      fileInputEl.click();
    }
  });
  toolbar.appendChild(importButton);
  modalEl.appendChild(toolbar);

  fileInputEl = document.createElement("input");
  fileInputEl.type = "file";
  fileInputEl.accept = ".json,application/json";
  fileInputEl.hidden = true;
  fileInputEl.addEventListener("change", handleFileChange);
  modalEl.appendChild(fileInputEl);

  shadow.appendChild(modalEl);
}

export function renderProfileList(list: Profile[]): void {
  profiles = list;
  clearStatus();
  clearPicker();
  clearOutline();
  if (!profileListEl) {
    return;
  }
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

export function showFillProgress(statuses: { field: ProfileField; status: FillStatus }[]): void {
  clearPicker();
  if (!statusAreaEl) {
    return;
  }
  statusAreaEl.replaceChildren();
  for (const entry of statuses) {
    const item = document.createElement("div");
    item.className = "ff-status-item";
    const label = document.createElement("span");
    label.className = "ff-status-label";
    label.textContent = fieldLabel(entry.field);
    const result = document.createElement("span");
    result.className =
      entry.status.status === "ok" ? "ff-status-ok" : "ff-status-failed";
    result.textContent = entry.status.status === "ok" ? "ok" : "failed";
    item.appendChild(label);
    item.appendChild(result);
    if (entry.status.message) {
      const message = document.createElement("div");
      message.className = "ff-status-message";
      message.textContent = entry.status.message;
      item.appendChild(message);
    }
    statusAreaEl.appendChild(item);
  }
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
  const item = document.createElement("div");
  item.className = "ff-failure";
  const label = document.createElement("div");
  label.className = "ff-failure-label";
  label.textContent = fieldLabel(field);
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
  if (profile.description) {
    const description = document.createElement("div");
    description.className = "ff-profile-description";
    description.textContent = profile.description;
    info.appendChild(description);
  }
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
    activeProfile = profile;
    controller?.onFill(profile);
  });
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

function clearStatus(): void {
  if (!statusAreaEl) {
    return;
  }
  statusAreaEl.replaceChildren();
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

function fieldLabel(field: ProfileField): string {
  const attr = field.xpath.match(/@(?:id|name|data-testid)="([^"]+)"/i)?.[1];
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
