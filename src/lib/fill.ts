import type { ProfileField } from "../types/profile";

export interface FillStatus {
  status: "ok" | "failed";
  message?: string;
}

function ok(): FillStatus {
  return { status: "ok" };
}

function failed(message: string): FillStatus {
  return { status: "failed", message };
}

function setNativeValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!;
  setter.call(el, value);
}

function dispatchInput(el: Element): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function dispatchChange(el: Element): void {
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function isReadOnly(el: HTMLInputElement | HTMLSelectElement): boolean {
  return "readOnly" in el && el.readOnly;
}

function fillTextLike(el: HTMLInputElement, field: ProfileField, value: string): FillStatus {
  if (el.disabled) {
    return failed("element is disabled");
  }
  if (el.readOnly) {
    return failed("element is readonly");
  }
  el.focus();
  if (field.clearFirst !== false) {
    setNativeValue(el, "");
  }
  setNativeValue(el, value);
  dispatchInput(el);
  dispatchChange(el);
  el.blur();
  return ok();
}

function fillSelect(el: HTMLSelectElement, field: ProfileField, value: string): FillStatus {
  if (el.disabled) {
    return failed("element is disabled");
  }
  if (isReadOnly(el)) {
    return failed("element is readonly");
  }
  const byLabel = field.selectBy === "label";
  const option = Array.from(el.options).find((o) =>
    byLabel ? o.textContent.trim() === value : o.value === value
  );
  if (!option) {
    return failed(`no matching option for value "${value}"`);
  }
  option.selected = true;
  el.value = option.value;
  dispatchChange(el);
  return ok();
}

function fillCheckbox(el: HTMLInputElement, value: boolean): FillStatus {
  if (el.disabled) {
    return failed("element is disabled");
  }
  el.checked = value;
  dispatchInput(el);
  dispatchChange(el);
  return ok();
}

function findAssociatedLabel(radio: HTMLInputElement, container: Element): HTMLLabelElement | null {
  for (const label of container.querySelectorAll("label")) {
    if (label.htmlFor !== "" && label.htmlFor === radio.id) {
      return label;
    }
  }
  const wrapping = radio.closest("label");
  if (wrapping !== null && container.contains(wrapping)) {
    return wrapping;
  }
  return null;
}

function fillRadio(container: Element, field: ProfileField, value: string): FillStatus {
  const radios = Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
  );
  if (radios.length === 0) {
    return failed("no radio buttons in the group");
  }
  let match: HTMLInputElement | undefined;
  if (field.selectBy === "label") {
    match = radios.find((radio) => {
      const label = findAssociatedLabel(radio, container);
      return label !== null && label.textContent.trim() === value;
    });
  } else {
    match = radios.find((radio) => radio.value === value);
  }
  if (!match) {
    return failed(`no matching radio for value "${value}"`);
  }
  if (match.disabled) {
    return failed("element is disabled");
  }
  match.checked = true;
  dispatchInput(match);
  dispatchChange(match);
  return ok();
}

export function fillField(el: Element, field: ProfileField, value: string | boolean): FillStatus {
  const type = field.type ?? "text";
  switch (type) {
    case "text":
    case "date": {
      if (!(el instanceof HTMLInputElement)) {
        return failed("element is not an input element");
      }
      return fillTextLike(el, field, value as string);
    }
    case "select": {
      if (!(el instanceof HTMLSelectElement)) {
        return failed("element is not a select element");
      }
      return fillSelect(el, field, value as string);
    }
    case "checkbox": {
      if (!(el instanceof HTMLInputElement) || el.type !== "checkbox") {
        return failed("element is not a checkbox");
      }
      return fillCheckbox(el, Boolean(value));
    }
    case "radio": {
      return fillRadio(el, field, value as string);
    }
  }
}

export function hasValue(el: Element): boolean {
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") {
      return el.checked;
    }
    return el.value.trim().length > 0;
  }
  if (el instanceof HTMLTextAreaElement) {
    return el.value.trim().length > 0;
  }
  if (el instanceof HTMLSelectElement) {
    return el.value.trim().length > 0;
  }
  return false;
}
