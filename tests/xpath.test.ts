// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import xpath from "xpath";
import type { ProfileField } from "../src/types/profile";
import { resolveField } from "../src/lib/xpath";

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
    xpath: "//div[@data-nonexistent='true']",
    value: "x",
    ...overrides,
  };
}

beforeEach(() => {
  setBody("");
  installEvaluatePolyfill(document);
});

describe("resolveField", () => {
  it("resolves a root-relative xpath to ok", () => {
    setBody(`<form id="f"><input id="first" name="firstName"></form>`);
    const result = resolveField(document, makeField({ xpath: "//input[@name='firstName']" }));
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
    const result = resolveField(document, makeField({ xpath: "//div[@data-role='field']" }));
    expect(result.status).toBe("ambiguous");
    expect(result.matches).toHaveLength(2);
    expect(result.element).toBeUndefined();
  });

  it("returns not-found when the xpath matches nothing", () => {
    setBody(`<form id="f"><input name="other"></form>`);
    const result = resolveField(document, makeField());
    expect(result.status).toBe("not-found");
    expect(result.matches).toHaveLength(0);
    expect(result.element).toBeUndefined();
  });
});
