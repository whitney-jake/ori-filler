// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import xpath from "xpath";
import type { ProfileField } from "../src/types/profile";
import { resolveAnchor, resolveField } from "../src/lib/xpath";

interface XPathEvaluator {
  select(options: Record<string, unknown>): unknown[];
}

interface XPathModule {
  parse(expression: string): XPathEvaluator;
}

const xpathModule = xpath as unknown as XPathModule;

function installEvaluatePolyfill(doc: Document): void {
  (doc as unknown as { evaluate: unknown }).evaluate = (
    expression: string,
    contextNode: Node,
    _resolver: unknown,
    type: number,
    _result: unknown
  ) => {
    const nodes = xpathModule.parse(expression).select({
      node: contextNode,
      allowAnyNamespaceForNoPrefix: true,
      isHtml: true,
    });
    if (type === 9) {
      return { resultType: 9, singleNodeValue: nodes[0] ?? null };
    }
    return {
      resultType: 7,
      snapshotLength: nodes.length,
      snapshotItem: (index: number) => nodes[index] ?? null,
    };
  };
}

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function makeField(overrides: Partial<ProfileField> = {}): ProfileField {
  return {
    anchor: "//form",
    xpath: ".//input[@name='no-such']",
    value: "x",
    ...overrides,
  };
}

beforeEach(() => {
  setBody("");
  installEvaluatePolyfill(document);
});

describe("resolveAnchor", () => {
  it("returns ok with a single match", () => {
    setBody(`<form data-form="customer"><input name="a"></form>`);
    const result = resolveAnchor(document, "//form[@data-form='customer']");
    expect(result.status).toBe("ok");
    expect(result.element).toBe(document.querySelector("form"));
    expect(result.matches).toHaveLength(1);
  });

  it("returns ambiguous when the anchor matches duplicate elements", () => {
    setBody(`
      <form data-form="customer"><input name="a"></form>
      <form data-form="customer"><input name="b"></form>
    `);
    const result = resolveAnchor(document, "//form[@data-form='customer']");
    expect(result.status).toBe("ambiguous");
    expect(result.matches).toHaveLength(2);
    expect(result.element).toBeUndefined();
  });

  it("returns not-found when the anchor is missing", () => {
    setBody(`<form data-form="customer"><input name="a"></form>`);
    const result = resolveAnchor(document, "//form[@data-form='missing']");
    expect(result.status).toBe("not-found");
    expect(result.matches).toHaveLength(0);
    expect(result.element).toBeUndefined();
  });
});

describe("resolveField", () => {
  it("resolves a relative xpath to ok", () => {
    setBody(`<form id="f"><input id="first" name="firstName"></form>`);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(document, anchor, makeField({ xpath: ".//input[@name='firstName']" }));
    expect(result.status).toBe("ok");
    expect(result.element).toBe(document.getElementById("first"));
  });

  it("returns ambiguous when the field xpath matches multiple elements", () => {
    setBody(`
      <form id="f">
        <div data-role="field">a</div>
        <div data-role="field">b</div>
      </form>
    `);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(document, anchor, makeField({ xpath: ".//div[@data-role='field']" }));
    expect(result.status).toBe("ambiguous");
    expect(result.matches).toHaveLength(2);
    expect(result.element).toBeUndefined();
  });

  it("uses the attribute fallback inside the anchor subtree", () => {
    setBody(`<form id="f"><input name="firstName"></form>`);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(document, anchor, makeField({ xpath: ".//span[@name='firstName']" }));
    expect(result.status).toBe("ok");
    expect(result.element).toBe(anchor.querySelector("[name='firstName']"));
  });

  it("uses the attribute fallback with a double-quoted predicate", () => {
    setBody(`<form id="f"><input name="lastName"></form>`);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(document, anchor, makeField({ xpath: './/span[@name="lastName"]' }));
    expect(result.status).toBe("ok");
    expect(result.element).toBe(anchor.querySelector("[name='lastName']"));
  });

  it("uses the attribute fallback in the whole document", () => {
    setBody(`
      <form id="f"></form>
      <input name="country">
    `);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(document, anchor, makeField({ xpath: ".//input[@name='country']" }));
    expect(result.status).toBe("ok");
    expect(result.element).toBe(document.querySelector("[name='country']"));
  });

  it("matches a control by its placeholder attribute", () => {
    setBody(`
      <form id="f">
        <input name="email" placeholder="Email address">
      </form>
    `);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(document, anchor, makeField({ placeholder: "Email address" }));
    expect(result.status).toBe("ok");
    expect(result.element).toBe(anchor.querySelector("input"));
  });

  it("matches a control via label for the element id", () => {
    setBody(`
      <form id="f">
        <input id="city" name="city">
        <label for="city">City</label>
      </form>
    `);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(document, anchor, makeField({ placeholder: "City" }));
    expect(result.status).toBe("ok");
    expect(result.element).toBe(document.getElementById("city"));
  });

  it("matches a control inside a wrapping label", () => {
    setBody(`
      <form id="f">
        <label>Username <input name="user"></label>
      </form>
    `);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(document, anchor, makeField({ placeholder: "Username" }));
    expect(result.status).toBe("ok");
    expect(result.element).toBe(anchor.querySelector("input"));
  });

  it("matches a radio container via label for the container id", () => {
    setBody(`
      <form id="f">
        <label for="plan">Plan</label>
        <fieldset id="plan">
          <input type="radio" name="plan" value="basic">
        </fieldset>
      </form>
    `);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(document, anchor, makeField({ placeholder: "Plan" }));
    expect(result.status).toBe("ok");
    expect(result.element).toBe(anchor.querySelector("fieldset"));
  });

  it("returns not-found when every strategy fails", () => {
    setBody(`<form id="f"><input name="other"></form>`);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(document, anchor, makeField());
    expect(result.status).toBe("not-found");
    expect(result.matches).toHaveLength(0);
    expect(result.element).toBeUndefined();
  });

  it("does not use an attribute that is absent from the fallback list", () => {
    setBody(`
      <form id="f">
        <input data-qa="buy" name="real">
      </form>
    `);
    const anchor = resolveAnchor(document, "//form[@id='f']").element as Element;
    const result = resolveField(
      document,
      anchor,
      makeField({ xpath: ".//textarea[@data-qa='buy']", fallback: ["id", "name", "data-testid"] })
    );
    expect(result.status).toBe("not-found");
  });
});
