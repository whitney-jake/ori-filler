// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fillField, hasValue } from "../src/lib/fill";
import type { ProfileField } from "../src/types/profile";

function makeField(partial: Partial<ProfileField> = {}): ProfileField {
  return {
    xpath: "//input",
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
    expect(events).toEqual(["focus", "input", "input", "change", "blur"]);
  });

  it("dispatches InputEvent with correct inputType", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    let capturedInputType: string | undefined;
    input.addEventListener("input", (e) => {
      capturedInputType = (e as InputEvent).inputType;
    });
    fillField(input, makeField(), "Jane");
    expect(capturedInputType).toBe("insertText");
  });

  it("dispatches deleteContentBackward when clearing", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.value = "old";
    const inputTypes: string[] = [];
    input.addEventListener("input", (e) => {
      inputTypes.push((e as InputEvent).inputType);
    });
    fillField(input, makeField(), "Jane");
    expect(inputTypes).toEqual(["deleteContentBackward", "insertText"]);
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

describe("fillField autocomplete", () => {
  it("types value character by character with keyboard events", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const events: Array<{ type: string; key?: string; inputType?: string }> = [];
    input.addEventListener("keydown", (e) => {
      events.push({ type: "keydown", key: e.key });
    });
    input.addEventListener("input", (e) => {
      events.push({ type: "input", inputType: (e as InputEvent).inputType });
    });
    input.addEventListener("keyup", (e) => {
      events.push({ type: "keyup", key: e.key });
    });
    const result = fillField(input, makeField({ type: "autocomplete" }), "AB");
    expect(result).toEqual({ status: "ok" });
    expect(input.value).toBe("AB");
    expect(events).toEqual([
      { type: "input", inputType: "deleteContentBackward" },
      { type: "keydown", key: "A" },
      { type: "input", inputType: "insertText" },
      { type: "keyup", key: "A" },
      { type: "keydown", key: "B" },
      { type: "input", inputType: "insertText" },
      { type: "keyup", key: "B" },
    ]);
  });

  it("clears the field first when clearFirst is true", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.value = "old";
    fillField(input, makeField({ type: "autocomplete" }), "new");
    expect(input.value).toBe("new");
  });

  it("does not clear first when clearFirst is false", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.value = "old";
    fillField(input, makeField({ type: "autocomplete", clearFirst: false }), "new");
    expect(input.value).toBe("oldnew");
  });

  it("returns failed for a disabled input", () => {
    const input = document.createElement("input");
    input.disabled = true;
    const result = fillField(input, makeField({ type: "autocomplete" }), "x");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/disabled/);
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

  it("checks the matching radio by clicking its label", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<input type="radio" name="tier" value="gold" />' +
      '<input type="radio" name="tier" value="silver" />';
    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    fillField(container, makeField({ type: "radio", selectBy: "value" }), "gold");
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
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

describe("fillField button", () => {
  it("clicks a button and returns ok", () => {
    const btn = document.createElement("button");
    btn.textContent = "Next";
    document.body.appendChild(btn);
    let clicked = false;
    btn.addEventListener("click", () => { clicked = true; });
    const result = fillField(btn, makeField({ type: "button", value: "Next" }), "Next");
    expect(result).toEqual({ status: "ok" });
    expect(clicked).toBe(true);
  });

  it("clicks when value is empty string (no text match)", () => {
    const btn = document.createElement("button");
    btn.textContent = "Anything";
    document.body.appendChild(btn);
    let clicked = false;
    btn.addEventListener("click", () => { clicked = true; });
    const result = fillField(btn, makeField({ type: "button", value: "" }), "");
    expect(result).toEqual({ status: "ok" });
    expect(clicked).toBe(true);
  });

  it("returns failed when text does not match", () => {
    const btn = document.createElement("button");
    btn.textContent = "Back";
    document.body.appendChild(btn);
    const result = fillField(btn, makeField({ type: "button", value: "Next" }), "Next");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/does not match/);
  });

  it("returns failed for a disabled button", () => {
    const btn = document.createElement("button");
    btn.disabled = true;
    const result = fillField(btn, makeField({ type: "button", value: "Next" }), "Next");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/disabled/);
  });

  it("clicks a non-button element (e.g. div used as a button)", () => {
    const div = document.createElement("div");
    div.setAttribute("role", "button");
    div.textContent = "OK";
    document.body.appendChild(div);
    let clicked = false;
    div.addEventListener("click", () => { clicked = true; });
    const result = fillField(div, makeField({ type: "button", value: "OK" }), "OK");
    expect(result).toEqual({ status: "ok" });
    expect(clicked).toBe(true);
  });
});

describe("fillField button-group", () => {
  it("clicks the matching button by text", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<button>Back</button><button>Next</button><button>Skip</button>';
    document.body.appendChild(container);
    let clicked = false;
    const buttons = container.querySelectorAll("button");
    buttons[1].addEventListener("click", () => { clicked = true; });
    const result = fillField(container, makeField({ type: "button-group", value: "Next" }), "Next");
    expect(result.status).toBe("ok");
    expect(clicked).toBe(true);
  });

  it("returns failed when no button matches", () => {
    const container = document.createElement("div");
    container.innerHTML = '<button>Back</button><button>Next</button>';
    const result = fillField(container, makeField({ type: "button-group", value: "Submit" }), "Submit");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/no matching button/i);
  });

  it("returns failed when the group has no buttons", () => {
    const container = document.createElement("div");
    const result = fillField(container, makeField({ type: "button-group", value: "Next" }), "Next");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/no buttons in the group/i);
  });

  it("returns failed when the matched button is disabled", () => {
    const container = document.createElement("div");
    container.innerHTML = '<button disabled>Next</button>';
    const result = fillField(container, makeField({ type: "button-group", value: "Next" }), "Next");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/disabled/);
  });

  it("trims button text before matching", () => {
    const container = document.createElement("div");
    container.innerHTML = '<button>  Next  </button>';
    let clicked = false;
    container.querySelector("button")!.addEventListener("click", () => { clicked = true; });
    const result = fillField(container, makeField({ type: "button-group", value: "Next" }), "Next");
    expect(result.status).toBe("ok");
    expect(clicked).toBe(true);
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

describe("fillField edge cases", () => {
  it("returns failed when element is not an input for text type", () => {
    const div = document.createElement("div");
    const result = fillField(div, makeField({ type: "text" }), "Jane");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/not an input element/i);
  });

  it("returns failed when element is not an input for date type", () => {
    const div = document.createElement("div");
    const result = fillField(div, makeField({ type: "date" }), "1990-01-15");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/not an input element/i);
  });

  it("returns failed when element is not an input for autocomplete type", () => {
    const div = document.createElement("div");
    const result = fillField(div, makeField({ type: "autocomplete" }), "Jane");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/not an input element/i);
  });

  it("returns failed when element is not a select for select type", () => {
    const input = document.createElement("input");
    const result = fillField(input, makeField({ type: "select", selectBy: "value" }), "us");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/not a select element/i);
  });

  it("returns failed for an unsupported field type", () => {
    const div = document.createElement("div");
    const result = fillField(div, makeField({ type: "rating" as any }), "5");
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/unsupported field type/i);
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

  it("returns false for an empty textarea and true for a filled one", () => {
    const ta = document.createElement("textarea");
    expect(hasValue(ta)).toBe(false);
    ta.value = "   ";
    expect(hasValue(ta)).toBe(false);
    ta.value = " hello ";
    expect(hasValue(ta)).toBe(true);
  });
});
