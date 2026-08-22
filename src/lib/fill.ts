import type { ProfileField } from "../types/profile";

export interface FillStatus {
  status: "ok" | "failed" | "skipped";
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

function dispatchInput(el: Element, inputType?: string): void {
  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: inputType ?? "insertText",
    }),
  );
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
  if (document.activeElement !== el) {
    el.focus();
  }
  if (field.clearFirst !== false) {
    el.value = "";
    dispatchInput(el, "deleteContentBackward");
  }
  setNativeValue(el, value);
  dispatchInput(el);
  dispatchChange(el);
  if (document.activeElement === el) {
    el.blur();
  }
  return ok();
}

function fillAutocomplete(el: HTMLInputElement, field: ProfileField, value: string): FillStatus {
  if (el.disabled) {
    return failed("element is disabled");
  }
  if (el.readOnly) {
    return failed("element is readonly");
  }
  if (document.activeElement !== el) {
    el.focus();
  }
  if (field.clearFirst !== false) {
    setNativeValue(el, "");
    dispatchInput(el, "deleteContentBackward");
  }
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!;
  for (const char of value) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
    setter.call(el, el.value + char);
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: char }),
    );
    el.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
  }
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

function buildLabelMap(container: Element): Map<string, HTMLLabelElement> {
  const map = new Map<string, HTMLLabelElement>();
  for (const label of container.querySelectorAll("label")) {
    if (label.htmlFor !== "") {
      map.set(label.htmlFor, label);
    }
  }
  return map;
}

function findAssociatedLabel(
  radio: HTMLInputElement,
  labelMap: Map<string, HTMLLabelElement>,
  container: Element
): HTMLLabelElement | null {
  if (radio.id !== "") {
    const label = labelMap.get(radio.id);
    if (label) {
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
  const labelMap = buildLabelMap(container);
  let match: HTMLInputElement | undefined;
  if (field.selectBy === "label") {
    match = radios.find((radio) => {
      const label = findAssociatedLabel(radio, labelMap, container);
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
  const label = findAssociatedLabel(match, labelMap, container);
  if (label) {
    label.click();
  } else {
    match.click();
  }
  return ok();
}

function fillButton(el: Element, value: string): FillStatus {
  const btn = el as HTMLElement;
  if ("disabled" in btn && (btn as HTMLButtonElement | HTMLInputElement).disabled) {
    return failed("element is disabled");
  }
  if (value !== "" && el.textContent?.trim() !== value) {
    return failed(`button text "${el.textContent?.trim()}" does not match expected "${value}"`);
  }
  btn.click();
  return ok();
}

function fillButtonGroup(container: Element, field: ProfileField, value: string): FillStatus {
  const buttons = Array.from(container.querySelectorAll("button"));
  if (buttons.length === 0) {
    return failed("no buttons in the group");
  }
  const match = buttons.find((b) => b.textContent.trim() === value);
  if (!match) {
    return failed(`no matching button for value "${value}"`);
  }
  if (match.disabled) {
    return failed("element is disabled");
  }
  match.click();
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
    case "autocomplete": {
      if (!(el instanceof HTMLInputElement)) {
        return failed("element is not an input element");
      }
      return fillAutocomplete(el, field, value as string);
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
    case "button": {
      return fillButton(el, value as string);
    }
    case "button-group": {
      return fillButtonGroup(el, field, value as string);
    }
    default: {
      return failed(`unsupported field type "${type}"`);
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
