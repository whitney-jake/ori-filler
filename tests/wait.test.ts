// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import xpath from "xpath";
import { waitForElement, waitForListOption } from "../src/lib/wait";

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

beforeEach(() => {
  document.body.innerHTML = "";
  installEvaluatePolyfill(document);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForElement", () => {
  it("resolves immediately when the element already exists", async () => {
    document.body.innerHTML = `<input name="email" />`;
    const handle = waitForElement(document, "//input[@name='email']", 3000);
    const result = await handle.promise;
    expect(result.status).toBe("ok");
    expect(result.element).toBeDefined();
  });

  it("resolves via poll when the element is added before timeout", async () => {
    const handle = waitForElement(document, "//input[@name='email']", 3000, 250);

    setTimeout(() => {
      document.body.innerHTML = `<input name="email" />`;
    }, 500);

    await vi.advanceTimersByTimeAsync(750);
    const result = await handle.promise;
    expect(result.status).toBe("ok");
    expect(result.element).toBeDefined();
  });

  it("resolves via MutationObserver when the element is added to the DOM", async () => {
    const handle = waitForElement(document, "//input[@name='email']", 3000, 250);

    setTimeout(() => {
      const el = document.createElement("input");
      el.name = "email";
      document.body.appendChild(el);
    }, 100);

    await vi.advanceTimersByTimeAsync(300);
    const result = await handle.promise;
    expect(result.status).toBe("ok");
    expect(result.element).toBeDefined();
  });

  it("resolves to not-found after timeout when the element never appears", async () => {
    const handle = waitForElement(document, "//input[@name='email']", 500, 100);
    await vi.advanceTimersByTimeAsync(600);
    const result = await handle.promise;
    expect(result.status).toBe("not-found");
    expect(result.matches).toHaveLength(0);
  });

  it("resolves to not-found when cancel is called before the element appears", async () => {
    const handle = waitForElement(document, "//input[@name='email']", 3000, 250);
    handle.cancel();
    const result = await handle.promise;
    expect(result.status).toBe("not-found");
    expect(result.matches).toHaveLength(0);
  });

  it("resolves to ambiguous when multiple elements appear", async () => {
    const handle = waitForElement(document, "//input[@name='email']", 3000, 250);

    setTimeout(() => {
      document.body.innerHTML = `
        <input name="email" />
        <input name="email" />
      `;
    }, 100);

    await vi.advanceTimersByTimeAsync(300);
    const result = await handle.promise;
    expect(result.status).toBe("ambiguous");
    expect(result.matches).toHaveLength(2);
  });
});

describe("waitForListOption", () => {
  it("resolves immediately when matching li already exists", async () => {
    document.body.innerHTML = "<ul><li>Truck/Jeep/SUV</li><li>Fire Trucks</li></ul>";
    const handle = waitForListOption(document, "Truck/Jeep/SUV", 3000);
    const result = await handle.promise;
    expect(result.status).toBe("ok");
    expect(result.element).toBeDefined();
    expect(result.element?.textContent?.trim()).toBe("Truck/Jeep/SUV");
  });

  it("resolves via MutationObserver when li is added later", async () => {
    const handle = waitForListOption(document, "Ford", 3000, 250);

    setTimeout(() => {
      const ul = document.createElement("ul");
      const li = document.createElement("li");
      li.textContent = "Ford";
      ul.appendChild(li);
      document.body.appendChild(ul);
    }, 100);

    await vi.advanceTimersByTimeAsync(300);
    const result = await handle.promise;
    expect(result.status).toBe("ok");
    expect(result.element?.textContent?.trim()).toBe("Ford");
  });

  it("resolves to not-found after timeout when no match appears", async () => {
    document.body.innerHTML = "<ul><li>Chevy</li></ul>";
    const handle = waitForListOption(document, "Ford", 500, 100);
    await vi.advanceTimersByTimeAsync(600);
    const result = await handle.promise;
    expect(result.status).toBe("not-found");
    expect(result.matches).toHaveLength(0);
  });

  it("resolves to not-found when cancel is called", async () => {
    const handle = waitForListOption(document, "Ford", 3000, 250);
    handle.cancel();
    const result = await handle.promise;
    expect(result.status).toBe("not-found");
  });

  it("matches by exact text content", async () => {
    document.body.innerHTML = "<ul><li>Fire Trucks</li><li>Truck</li></ul>";
    const handle = waitForListOption(document, "Truck", 3000);
    const result = await handle.promise;
    expect(result.status).toBe("ok");
    expect(result.element?.textContent?.trim()).toBe("Truck");
  });
});
