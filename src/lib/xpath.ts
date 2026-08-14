import type { ProfileField } from "../types/profile";

export interface ResolveResult {
  element?: Element;
  status: "ok" | "not-found" | "ambiguous";
  matches: Element[];
}

const SNAPSHOT_TYPE = 7;
const DEFAULT_FALLBACK = ["id", "name", "data-testid"];
const FORM_CONTROL_SELECTOR = "input, select, textarea, button";
const PREDICATE_RE = /\[@([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(['"])([\s\S]*?)\2\]/g;

export function resolveAnchor(doc: Document, anchorXpath: string): ResolveResult {
  const matches = evaluateNodes(doc, anchorXpath);
  if (matches.length === 0) {
    return { status: "not-found", matches };
  }
  if (matches.length > 1) {
    return { status: "ambiguous", matches };
  }
  return { status: "ok", element: matches[0], matches };
}

export function resolveField(doc: Document, anchorEl: Element, field: ProfileField): ResolveResult {
  const xpathMatches = evaluateNodes(anchorEl, field.xpath);
  if (xpathMatches.length === 1) {
    return { status: "ok", element: xpathMatches[0], matches: xpathMatches };
  }

  const fallbackAttrs = field.fallback ?? DEFAULT_FALLBACK;
  const predicate = parseAttributePredicate(field.xpath);
  if (predicate !== null && fallbackAttrs.includes(predicate.name)) {
    const selector = selectorFor(predicate.name, predicate.value);
    let attrMatches = Array.from(anchorEl.querySelectorAll(selector));
    if (attrMatches.length === 0) {
      attrMatches = Array.from(doc.querySelectorAll(selector));
    }
    if (attrMatches.length === 1) {
      return { status: "ok", element: attrMatches[0], matches: attrMatches };
    }
    if (attrMatches.length > 1) {
      return { status: "ambiguous", matches: attrMatches };
    }
  }

  if (field.placeholder) {
    const placeholderMatches = collectPlaceholderCandidates(doc, field.placeholder);
    if (placeholderMatches.length === 1) {
      return { status: "ok", element: placeholderMatches[0], matches: placeholderMatches };
    }
    if (placeholderMatches.length > 1) {
      return { status: "ambiguous", matches: placeholderMatches };
    }
  }

  if (xpathMatches.length > 1) {
    return { status: "ambiguous", matches: xpathMatches };
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

function parseAttributePredicate(xpathExpr: string): { name: string; value: string } | null {
  let parsed: { name: string; value: string } | null = null;
  PREDICATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PREDICATE_RE.exec(xpathExpr)) !== null) {
    parsed = { name: match[1], value: match[3] };
  }
  return parsed;
}

function selectorFor(attr: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[${attr}="${escaped}"]`;
}

function collectPlaceholderCandidates(doc: Document, placeholder: string): Element[] {
  const candidates: Element[] = [];
  const seen = new Set<Element>();
  const add = (el: Element | null) => {
    if (el !== null && !seen.has(el)) {
      seen.add(el);
      candidates.push(el);
    }
  };
  const elements = Array.from(doc.querySelectorAll(`${FORM_CONTROL_SELECTOR}, fieldset, div`));
  for (const el of elements) {
    const isFormControl = el.matches(FORM_CONTROL_SELECTOR);
    const isRadioContainer = !isFormControl && el.querySelector('input[type="radio"]') !== null;
    if (!isFormControl && !isRadioContainer) {
      continue;
    }
    if (el.getAttribute("placeholder") === placeholder) {
      add(el);
    }
    if (labelTextMatches(doc, el, placeholder)) {
      add(el);
    }
  }
  return candidates;
}

function labelTextMatches(doc: Document, el: Element, placeholder: string): boolean {
  const labels = Array.from(doc.querySelectorAll("label"));
  for (const label of labels) {
    if (label.textContent?.trim() !== placeholder) {
      continue;
    }
    if (el.id !== "" && label.htmlFor === el.id) {
      return true;
    }
    if (label.contains(el)) {
      return true;
    }
  }
  return false;
}
