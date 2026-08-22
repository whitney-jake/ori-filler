import { describe, expect, it } from "vitest";
import { parseProfile, validateProfile, type Profile } from "../src/types/profile";

const validRaw = {
  id: "create-customer",
  name: "Create Customer",
  description: "Fills the new customer form",
  urlPatterns: ["*/customers/new"],
  delayMs: 100,
  fields: [
    {
      xpath: "//form[@data-form='customer']//input[@name='firstName']",
      type: "text",
      value: "Jane",
      clearFirst: true,
    },
    {
      xpath: "//form[@data-form='customer']//select[@name='country']",
      type: "select",
      selectBy: "label",
      value: "United States",
    },
    {
      xpath: "//form[@data-form='customer']//fieldset[@name='tier']",
      type: "radio",
      selectBy: "value",
      value: "gold",
      optional: true,
    },
    {
      xpath: "//form[@data-form='customer']//input[@name='newsletter']",
      type: "checkbox",
      value: true,
      skipIfFilled: true,
    },
    {
      xpath: "//form[@data-form='customer']//input[@name='birthdate']",
      type: "date",
      value: "1990-01-15",
      delayMs: 500,
    },
  ],
};

describe("parseProfile", () => {
  it("parses a valid profile and applies defaults", () => {
    const p = parseProfile(validRaw);
    expect(p.id).toBe("create-customer");
    expect(p.name).toBe("Create Customer");
    expect(p.description).toBe("Fills the new customer form");
    expect(p.urlPatterns).toEqual(["*/customers/new"]);
    expect(p.delayMs).toBe(100);
    expect(p.fields).toHaveLength(5);

    const text = p.fields[0];
    expect(text.type).toBe("text");
    expect(text.clearFirst).toBe(true);
    expect(text.skipIfFilled).toBe(false);
    expect(text.optional).toBe(false);
    expect(text.required).toBe(true);

    const select = p.fields[1];
    expect(select.type).toBe("select");
    expect(select.selectBy).toBe("label");
    expect(select.value).toBe("United States");

    const radio = p.fields[2];
    expect(radio.type).toBe("radio");
    expect(radio.selectBy).toBe("value");
    expect(radio.value).toBe("gold");
    expect(radio.optional).toBe(true);

    const checkbox = p.fields[3];
    expect(checkbox.type).toBe("checkbox");
    expect(checkbox.value).toBe(true);
    expect(checkbox.skipIfFilled).toBe(true);

    const date = p.fields[4];
    expect(date.type).toBe("date");
    expect(date.value).toBe("1990-01-15");
    expect(date.delayMs).toBe(500);
  });

  it("defaults a radio field's selectBy to value", () => {
    const p = parseProfile({
      ...validRaw,
      fields: [{ xpath: "//form//fieldset[@name='tier']", type: "radio", value: "gold" }],
    });
    expect(p.fields[0].selectBy).toBe("value");
  });

  it("rejects a profile with a missing id", () => {
    const raw = { ...validRaw } as Record<string, unknown>;
    delete raw.id;
    expect(() => parseProfile(raw)).toThrow(/Invalid profile/);
  });

  it("rejects a profile with a missing name", () => {
    const raw = { ...validRaw } as Record<string, unknown>;
    delete raw.name;
    expect(() => parseProfile(raw)).toThrow(/Invalid profile/);
  });

  it("rejects a profile with empty urlPatterns", () => {
    expect(() => parseProfile({ ...validRaw, urlPatterns: [] })).toThrow(/Invalid profile/);
  });

  it("rejects a profile with a urlPattern that is an empty string", () => {
    expect(() => parseProfile({ ...validRaw, urlPatterns: [""] })).toThrow(/Invalid profile/);
  });

  it("rejects a profile with empty fields", () => {
    expect(() => parseProfile({ ...validRaw, fields: [] })).toThrow(/Invalid profile/);
  });

  it("rejects a field without an xpath", () => {
    expect(() =>
      parseProfile({
        ...validRaw,
        fields: [{ type: "text", value: "Jane" }],
      })
    ).toThrow(/Invalid profile/);
  });

  it("rejects a field whose xpath does not start with //", () => {
    expect(() =>
      parseProfile({
        ...validRaw,
        fields: [{ xpath: "input[@name='x']", type: "text", value: "Jane" }],
      })
    ).toThrow(/Invalid profile/);
    expect(() =>
      parseProfile({
        ...validRaw,
        fields: [{ xpath: "//input[@name='x']", type: "text", value: "Jane" }],
      })
    ).not.toThrow();
    expect(() =>
      parseProfile({
        ...validRaw,
        fields: [{ xpath: ".//input[@name='x']", type: "text", value: "Jane" }],
      })
    ).toThrow(/Invalid profile/);
  });

  it("rejects a select field without selectBy", () => {
    expect(() =>
      parseProfile({
        ...validRaw,
        fields: [{ xpath: "//form//select", type: "select", value: "US" }],
      })
    ).toThrow(/Invalid profile/);
  });

  it("rejects a select field with an unknown selectBy", () => {
    expect(() =>
      parseProfile({
        ...validRaw,
        fields: [
          { xpath: "//form//select", type: "select", selectBy: "id", value: "US" },
        ],
      })
    ).toThrow(/Invalid profile/);
  });

  it("rejects a checkbox field with a string value", () => {
    expect(() =>
      parseProfile({
        ...validRaw,
        fields: [{ xpath: "//form//input", type: "checkbox", value: "yes" }],
      })
    ).toThrow(/Invalid profile/);
  });

  it("rejects a radio field with a boolean value", () => {
    expect(() =>
      parseProfile({
        ...validRaw,
        fields: [{ xpath: "//form//fieldset", type: "radio", value: true }],
      })
    ).toThrow(/Invalid profile/);
  });

  it("rejects a text field with a boolean value", () => {
    expect(() =>
      parseProfile({
        ...validRaw,
        fields: [{ xpath: "//form//input", type: "text", value: true }],
      })
    ).toThrow(/Invalid profile/);
  });

  it("rejects a negative delayMs", () => {
    expect(() => parseProfile({ ...validRaw, delayMs: -5 })).toThrow(/Invalid profile/);
  });

  it("defaults waitForNext to false", () => {
    const p = parseProfile(validRaw);
    expect(p.fields[0].waitForNext).toBe(false);
  });

  it("parses waitForNext on field", () => {
    const p = parseProfile({
      ...validRaw,
      fields: [{ xpath: "//form//input", type: "text", value: "x", waitForNext: true }],
    });
    expect(p.fields[0].waitForNext).toBe(true);
  });

  it("parses autocomplete field type", () => {
    const p = parseProfile({
      ...validRaw,
      fields: [{ xpath: "//form//input", type: "autocomplete", value: "Truck" }],
    });
    expect(p.fields[0].type).toBe("autocomplete");
  });

  it("parses button field type", () => {
    const p = parseProfile({
      ...validRaw,
      fields: [{ xpath: "//button[text()='Next']", type: "button", value: "Next" }],
    });
    expect(p.fields[0].type).toBe("button");
    expect(p.fields[0].value).toBe("Next");
  });

  it("throws a descriptive error on invalid input", () => {
    expect(() => parseProfile({})).toThrow(/Invalid profile/);
    expect(() => parseProfile("not an object")).toThrow(/Invalid profile/);
  });
});

describe("validateProfile", () => {
  it("returns an empty array for a valid profile", () => {
    const p = parseProfile(validRaw);
    expect(validateProfile(p)).toEqual([]);
  });

  it("returns an empty array for a valid profile without optional keys", () => {
    const minimal = parseProfile({
      id: "login",
      name: "Login",
      urlPatterns: ["*/login"],
      fields: [{ xpath: "//form//input[@name='user']", value: "admin" }],
    });
    expect(validateProfile(minimal)).toEqual([]);
  });

  it("returns problems for a checkbox with a string value", () => {
    const broken: Profile = {
      ...parseProfile(validRaw),
      fields: [{ xpath: "//form//input", type: "checkbox", value: "yes" }],
    };
    expect(validateProfile(broken)).not.toEqual([]);
  });

  it("returns problems for empty urlPatterns", () => {
    const broken: Profile = { ...parseProfile(validRaw), urlPatterns: [] };
    expect(validateProfile(broken)).not.toEqual([]);
  });

  it("returns problems for a select without selectBy", () => {
    const broken: Profile = {
      ...parseProfile(validRaw),
      fields: [{ xpath: "//form//select", type: "select", value: "US" }],
    };
    expect(validateProfile(broken)).not.toEqual([]);
  });
});
