// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { shouldSkipField, hasLaterButton } from "../src/lib/step";
import { resolveField, clearXPathCache } from "../src/lib/xpath";
import type { ProfileField } from "../src/types/profile";

function makeField(partial: Partial<ProfileField> = {}): ProfileField {
  return {
    xpath: "//input",
    value: "x",
    ...partial,
  };
}

describe("shouldSkipField", () => {
  it("returns false when the field has no step", () => {
    expect(shouldSkipField(makeField(), 1)).toBe(false);
  });

  it("returns false when the field step matches currentStep", () => {
    expect(shouldSkipField(makeField({ step: 1 }), 1)).toBe(false);
    expect(shouldSkipField(makeField({ step: 2 }), 2)).toBe(false);
  });

  it("returns true when the field step does not match currentStep", () => {
    expect(shouldSkipField(makeField({ step: 2 }), 1)).toBe(true);
    expect(shouldSkipField(makeField({ step: 1 }), 2)).toBe(true);
  });
});

describe("step filtering with fill pipeline", () => {
  it("attempts step 1 fields and skips step 2 fields when currentStep is 1", () => {
    const step1Input = document.createElement("input");
    step1Input.setAttribute("data-field", "zip");
    document.body.appendChild(step1Input);

    const step2Input = document.createElement("input");
    step2Input.setAttribute("data-field", "type");
    document.body.appendChild(step2Input);

    const fields: ProfileField[] = [
      { xpath: "//input[@data-field='zip']", value: "48822", step: 1 },
      { xpath: "//input[@data-field='type']", value: "SUV", step: 2 },
    ];

    clearXPathCache();
    const currentStep = 1;

    const skipped: ProfileField[] = [];
    const attempted: ProfileField[] = [];

    for (const field of fields) {
      if (shouldSkipField(field, currentStep)) {
        skipped.push(field);
      } else {
        attempted.push(field);
        const result = resolveField(document, field);
        expect(result.status).toBe("ok");
      }
    }

    expect(attempted).toHaveLength(1);
    expect(attempted[0].xpath).toBe("//input[@data-field='zip']");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].xpath).toBe("//input[@data-field='type']");
  });

  it("attempts all step 1 fields when multiple share the same step", () => {
    const input1 = document.createElement("input");
    input1.setAttribute("data-field", "email");
    document.body.appendChild(input1);

    const input2 = document.createElement("input");
    input2.setAttribute("data-field", "password");
    document.body.appendChild(input2);

    const input3 = document.createElement("input");
    input3.setAttribute("data-field", "city");
    document.body.appendChild(input3);

    const fields: ProfileField[] = [
      { xpath: "//input[@data-field='email']", value: "a@b.com", step: 1 },
      { xpath: "//input[@data-field='password']", value: "secret", step: 1 },
      { xpath: "//input[@data-field='city']", value: "Springfield", step: 2 },
    ];

    clearXPathCache();
    const currentStep = 1;

    const skipped: ProfileField[] = [];
    const attempted: ProfileField[] = [];

    for (const field of fields) {
      if (shouldSkipField(field, currentStep)) {
        skipped.push(field);
      } else {
        attempted.push(field);
        const result = resolveField(document, field);
        expect(result.status).toBe("ok");
      }
    }

    expect(attempted).toHaveLength(2);
    expect(skipped).toHaveLength(1);
  });

  it("reports not-found for step 1 fields that are missing from the DOM", () => {
    const fields: ProfileField[] = [
      { xpath: "//input[@data-field='missing']", value: "x", step: 1 },
      { xpath: "//input[@data-field='also-missing']", value: "y", step: 2 },
    ];

    clearXPathCache();
    const currentStep = 1;

    const skipped: ProfileField[] = [];
    const notFound: ProfileField[] = [];

    for (const field of fields) {
      if (shouldSkipField(field, currentStep)) {
        skipped.push(field);
      } else {
        const result = resolveField(document, field);
        if (result.status === "not-found") {
          notFound.push(field);
        }
      }
    }

    expect(notFound).toHaveLength(1);
    expect(notFound[0].xpath).toBe("//input[@data-field='missing']");
    expect(skipped).toHaveLength(1);
  });
});

describe("hasLaterButton", () => {
  it("returns false when there are no later fields", () => {
    const fields: ProfileField[] = [
      { xpath: "//button", value: "Next", type: "button", step: 1 },
    ];
    expect(hasLaterButton(fields, 0, 1)).toBe(false);
  });

  it("returns false when later fields are not buttons", () => {
    const fields: ProfileField[] = [
      { xpath: "//button", value: "Next", type: "button", step: 1 },
      { xpath: "//input", value: "x", step: 1 },
    ];
    expect(hasLaterButton(fields, 0, 1)).toBe(false);
  });

  it("returns true when a later button exists in the same step", () => {
    const fields: ProfileField[] = [
      { xpath: "//button", value: "Save", type: "button", step: 1 },
      { xpath: "//button", value: "Next", type: "button", step: 1 },
    ];
    expect(hasLaterButton(fields, 0, 1)).toBe(true);
  });

  it("returns false when the later button is in a different step", () => {
    const fields: ProfileField[] = [
      { xpath: "//button", value: "Next", type: "button", step: 1 },
      { xpath: "//button", value: "Submit", type: "button", step: 2 },
    ];
    expect(hasLaterButton(fields, 0, 1)).toBe(false);
  });

  it("returns true for button-group type", () => {
    const fields: ProfileField[] = [
      { xpath: "//div", value: "Standard", type: "button-group", step: 1 },
      { xpath: "//button", value: "Next", type: "button", step: 1 },
    ];
    expect(hasLaterButton(fields, 0, 1)).toBe(true);
  });

  it("skips fields from other steps when scanning for later buttons", () => {
    const fields: ProfileField[] = [
      { xpath: "//button", value: "Next", type: "button", step: 1 },
      { xpath: "//input", value: "x", step: 2 },
      { xpath: "//button", value: "Submit", type: "button", step: 1 },
    ];
    expect(hasLaterButton(fields, 0, 1)).toBe(true);
  });

  it("returns false when only later buttons belong to other steps", () => {
    const fields: ProfileField[] = [
      { xpath: "//button", value: "Next", type: "button", step: 1 },
      { xpath: "//button", value: "Go", type: "button", step: 2 },
    ];
    expect(hasLaterButton(fields, 0, 1)).toBe(false);
  });

  it("returns false when field has no step and currentStep is set", () => {
    const fields: ProfileField[] = [
      { xpath: "//button", value: "Next", type: "button", step: 1 },
      { xpath: "//input", value: "x" },
    ];
    expect(hasLaterButton(fields, 0, 1)).toBe(false);
  });
});
