// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fillField, hasValue } from "../src/lib/fill";
import type { ProfileField } from "../src/types/profile";

function makeField(partial: Partial<ProfileField> = {}): ProfileField {
  return {
    anchor: "//form",
    xpath: ".//input",
    type: "text",
    value: "Jane",
    ...partial,
  };
}

describe("fillField text and date", () => {
  it("sets the value and dispatches focus, input, change, blur in order", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const events: string[] = [];
    for (const name of ["focus", "input", "change", "blur"]) {
      input.addEventListener(name, () => events.push(name));
    }
    const result = fillField(input, makeField(), "Jane");
    expect(result).toEqual({ status: "ok" });
    expect(input.value).toBe("Jane");
    expect(events).toEqual(["focus", "input", "change", "blur"]);
  });

  it("clears the field before setting when clearFirst is true", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.value = "pre-existing";

    const calls: string[] = [];
    const proto = window.HTMLInputElement.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, "value")!;
    Object.defineProperty(proto, "value", {
      configurable: true,
      enumerable: original.enumerable,
      get: original.get,
      set(this: HTMLInputElement, v: string) {
        calls.push(v);
        original.set!.call(this, v);
      },
    });
    try {
      const result = fillField(input, makeField(), "Jane");
      expect(result.status).toBe("ok");
      expect(calls).toEqual(["", "Jane"]);
      expect(input.value).toBe("Jane");
    } finally {
      Object.defineProperty(proto, "value", original);
    }
  });

  it("does not clear first when clearFirst is false", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.value = "pre-existing";

    const calls: string[] = [];
    const proto = window.HTMLInputElement.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, "value")!;
    Object.defineProperty(proto, "value", {
      configurable: true,
      enumerable: original.enumerable,
      get: original.get,
      set(this: HTMLInputElement, v: string) {
        calls.push(v);
        original.set!.call(this, v);
      },
    });
    try {
      const result = fillField(input, makeField({ clearFirst: false }), "Jane");
      expect(result.status).toBe("ok");
      expect(calls).toEqual(["Jane"]);
    } finally {
      Object.defineProperty(proto, "value", original);
    }
  });

  it("fills a date input", () => {
    const input = document.createElement("input");
    input.setAttribute("type", "date");
    const result = fillField(input, makeField({ type: "date" }), "1990-01-15");
    expect(result.status).toBe("ok");
    expect(input.value).toBe("1990-01-15");
  });
});

describe("fillField select", () => {
  it("selects an option by label", () => {
    const select = document.createElement("select");
    select.innerHTML =
      '<option value="us">United States</option><option value="ca">Canada</option>';
    const result = fillField(
      select,
      makeField({ type: "select", selectBy: "label" }),
      "Canada"
    );
    expect(result.status).toBe("ok");
    expect(select.value).toBe("ca");
    expect(select.selectedIndex).toBe(1);
  });

  it("selects an option by value", () => {
    const select = document.createElement("select");
    select.innerHTML =
      '<option value="us">United States</option><option value="ca">Canada</option>';
    const result = fillField(
      select,
      makeField({ type: "select", selectBy: "value" }),
      "us"
    );
    expect(result.status).toBe("ok");
    expect(select.value).toBe("us");
    expect(select.selectedIndex).toBe(0);
  });

  it("returns failed when no option matches", () => {
    const select = document.createElement("select");
    select.innerHTML = '<option value="us">United States</option>';
    const result = fillField(
      select,
      makeField({ type: "select", selectBy: "label" }),
      "Nope"
    );
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/no matching option/i);
  });

  it("returns failed for a disabled select", () => {
    const select = document.createElement("select");
    select.disabled = true;
    select.innerHTML = '<option value="us">United States</option>';
    const result = fillField(
      select,
      makeField({ type: "select", selectBy: "value" }),
      "us"
    );
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/disabled/);
  });
});

describe("fillField checkbox", () => {
  it("checks a checkbox and dispatches input then change", () => {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    const events: string[] = [];
    cb.addEventListener("input", () => events.push("input"));
    cb.addEventListener("change", () => events.push("change"));
    const result = fillField(cb, makeField({ type: "checkbox", value: true }), true);
    expect(result.status).toBe("ok");
    expect(cb.checked).toBe(true);
    expect(events).toEqual(["input", "change"]);
  });

  it("unchecks a checked checkbox", () => {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    const result = fillField(cb, makeField({ type: "checkbox", value: false }), false);
    expect(result.status).toBe("ok");
    expect(cb.checked).toBe(false);
  });

  it("returns failed when the element is not a checkbox", () => {
    const input = document.createElement("input");
    input.type = "text";
    const result = fillField(input, makeField({ type: "checkbox", value: true }), true);
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/not a checkbox/);
  });

  it("returns failed for a disabled checkbox", () => {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.disabled = true;
    const result = fillField(cb, makeField({ type: "checkbox", value: true }), true);
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/disabled/);
  });
});

describe("fillField radio", () => {
  it("checks the matching radio by value", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<input type="radio" name="tier" value="gold" />' +
      '<input type="radio" name="tier" value="silver" />';
    const result = fillField(
      container,
      makeField({ type: "radio", selectBy: "value" }),
      "gold"
    );
    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(result.status).toBe("ok");
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
  });

  it("checks the matching radio by label with a for attribute", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<label for="tier-gold">Gold</label>' +
      '<input type="radio" id="tier-gold" name="tier" value="gold" />' +
      '<label for="tier-silver">Silver</label>' +
      '<input type="radio" id="tier-silver" name="tier" value="silver" />';
    const result = fillField(
      container,
      makeField({ type: "radio", selectBy: "label" }),
      "Silver"
    );
    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(result.status).toBe("ok");
    expect(radios[1].checked).toBe(true);
    expect(radios[0].checked).toBe(false);
  });

  it("checks the matching radio by label with a wrapping label", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<label><input type="radio" name="tier" value="bronze" /> Bronze</label>' +
      '<label><input type="radio" name="tier" value="platinum" /> Platinum</label>';
    const result = fillField(
      container,
      makeField({ type: "radio", selectBy: "label" }),
      "Platinum"
    );
    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(result.status).toBe("ok");
    expect(radios[1].checked).toBe(true);
    expect(radios[0].checked).toBe(false);
  });

  it("dispatches input then change on the matched radio", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<input type="radio" name="tier" value="gold" />' +
      '<input type="radio" name="tier" value="silver" />';
    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    const events: string[] = [];
    radios[0].addEventListener("input", () => events.push("input"));
    radios[0].addEventListener("change", () => events.push("change"));
    fillField(container, makeField({ type: "radio", selectBy: "value" }), "gold");
    expect(events).toEqual(["input", "change"]);
  });

  it("returns failed when no radio matches", () => {
    const container = document.createElement("div");
    container.innerHTML = '<input type="radio" name="tier" value="gold" />';
    const result = fillField(
      container,
      makeField({ type: "radio", selectBy: "value" }),
      "silver"
    );
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/no matching radio/i);
  });

  it("returns failed when the group has no radios", () => {
    const container = document.createElement("div");
    const result = fillField(container, makeField({ type: "radio" }), "gold");
    expect(result.status).toBe("failed");
  });

  it("returns failed when the matched radio is disabled", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<input type="radio" name="tier" value="gold" disabled />';
    const result = fillField(
      container,
      makeField({ type: "radio", selectBy: "value" }),
      "gold"
    );
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/disabled/);
  });
});

describe("fillField disabled and readonly", () => {
  it("returns failed for a disabled text input", () => {
    const input = document.createElement("input");
    input.disabled = true;
    const result = fillField(input, makeField(), "Jane");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/disabled/);
  });

  it("returns failed for a readonly text input", () => {
    const input = document.createElement("input");
    input.readOnly = true;
    const result = fillField(input, makeField(), "Jane");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/readonly/);
  });

  it("returns failed for a readonly date input", () => {
    const input = document.createElement("input");
    input.setAttribute("type", "date");
    input.readOnly = true;
    const result = fillField(input, makeField({ type: "date" }), "1990-01-15");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/readonly/);
  });
});

describe("hasValue", () => {
  it("returns false for an empty text input and true for a filled one", () => {
    const input = document.createElement("input");
    expect(hasValue(input)).toBe(false);
    input.value = "   ";
    expect(hasValue(input)).toBe(false);
    input.value = " abc ";
    expect(hasValue(input)).toBe(true);
  });

  it("returns true only for a checked checkbox", () => {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    expect(hasValue(cb)).toBe(false);
    cb.checked = true;
    expect(hasValue(cb)).toBe(true);
  });

  it("returns true for a checked radio and false for an unchecked one", () => {
    const radio = document.createElement("input");
    radio.type = "radio";
    expect(hasValue(radio)).toBe(false);
    radio.checked = true;
    expect(hasValue(radio)).toBe(true);
  });

  it("returns true for a select with a selected value", () => {
    const select = document.createElement("select");
    expect(hasValue(select)).toBe(false);
    select.innerHTML = '<option value="us">United States</option>';
    select.value = "us";
    expect(hasValue(select)).toBe(true);
  });

  it("returns false for non-form elements", () => {
    const div = document.createElement("div");
    expect(hasValue(div)).toBe(false);
  });
});
