import type { ProfileField } from "../types/profile";

export interface ResolveResult {
  element?: Element;
  status: "ok" | "not-found" | "ambiguous";
  matches: Element[];
}

const SNAPSHOT_TYPE = 7;

const xpathCache = new Map<string, ResolveResult>();

export function clearXPathCache(): void {
  xpathCache.clear();
}

export function resolveField(doc: Document, field: ProfileField): ResolveResult {
  const cached = xpathCache.get(field.xpath);
  if (cached) {
    return cached;
  }
  const result = resolveFieldUncached(doc, field);
  xpathCache.set(field.xpath, result);
  return result;
}

function resolveFieldUncached(doc: Document, field: ProfileField): ResolveResult {
  const matches = evaluateNodes(doc, field.xpath);
  if (matches.length === 1) {
    return { status: "ok", element: matches[0], matches };
  }
  if (matches.length > 1) {
    return { status: "ambiguous", matches };
  }
  return { status: "not-found", matches: [] };
}

function evaluateNodes(context: Node, expression: string): Element[] {
  const doc = context.nodeType === 9 ? (context as Document) : context.ownerDocument;
  if (!doc || typeof doc.evaluate !== "function") {
    return [];
  }
  try {
    const result = doc.evaluate(expression, context, null, SNAPSHOT_TYPE, null);
    if (result.snapshotLength === 1) {
      const node = result.snapshotItem(0);
      if (node !== null && node.nodeType === 1) {
        return [node as Element];
      }
      return [];
    }
    const elements: Element[] = [];
    for (let index = 0; index < result.snapshotLength; index += 1) {
      const node = result.snapshotItem(index);
      if (node !== null && node.nodeType === 1) {
        elements.push(node as Element);
      }
    }
    return elements;
  } catch {
    return [];
  }
}
