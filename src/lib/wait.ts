import type { ResolveResult } from "./xpath";
import { resolveField, clearXPathCache } from "./xpath";

const DEFAULT_POLL_MS = 250;
const DEBOUNCE_MS = 100;

interface WaitHandle {
  promise: Promise<ResolveResult>;
  cancel(): void;
}

export function waitForElement(
  doc: Document,
  xpath: string,
  timeoutMs: number,
  pollMs: number = DEFAULT_POLL_MS,
): WaitHandle {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let observer: MutationObserver | undefined;
  let resolve!: (result: ResolveResult) => void;

  const field = { xpath, value: "" };

  function tryResolve(): void {
    if (cancelled) {
      return;
    }
    clearXPathCache();
    const result = resolveField(doc, field);
    if (result.status === "ok" || result.status === "ambiguous") {
      cleanup();
      resolve(result);
    }
  }

  function cleanup(): void {
    cancelled = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (poll !== undefined) {
      clearInterval(poll);
      poll = undefined;
    }
    if (observer !== undefined) {
      observer.disconnect();
      observer = undefined;
    }
  }

  const promise = new Promise<ResolveResult>((r) => {
    resolve = r;

    clearXPathCache();
    const initial = resolveField(doc, field);
    if (initial.status === "ok" || initial.status === "ambiguous") {
      resolve(initial);
      return;
    }

    poll = setInterval(tryResolve, pollMs);

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    observer = new MutationObserver(() => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        tryResolve();
      }, DEBOUNCE_MS);
    });
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
    });

    timer = setTimeout(() => {
      cleanup();
      resolve({ status: "not-found", matches: [] });
    }, timeoutMs);
  });

  return {
    promise,
    cancel() {
      cleanup();
      resolve({ status: "not-found", matches: [] });
    },
  };
}

export function waitForListOption(
  doc: Document,
  value: string,
  timeoutMs: number,
  pollMs: number = DEFAULT_POLL_MS,
): WaitHandle {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let observer: MutationObserver | undefined;
  let resolve!: (result: ResolveResult) => void;

  function tryFind(): HTMLElement | null {
    const items = doc.querySelectorAll<HTMLElement>("li");
    for (const li of items) {
      if (li.textContent?.trim() === value) {
        return li;
      }
    }
    return null;
  }

  function tryResolve(): void {
    if (cancelled) {
      return;
    }
    const match = tryFind();
    if (match !== null) {
      cleanup();
      resolve({ status: "ok", element: match, matches: [match] });
    }
  }

  function cleanup(): void {
    cancelled = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (poll !== undefined) {
      clearInterval(poll);
      poll = undefined;
    }
    if (observer !== undefined) {
      observer.disconnect();
      observer = undefined;
    }
  }

  const promise = new Promise<ResolveResult>((r) => {
    resolve = r;

    const initial = tryFind();
    if (initial !== null) {
      resolve({ status: "ok", element: initial, matches: [initial] });
      return;
    }

    poll = setInterval(tryResolve, pollMs);

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    observer = new MutationObserver(() => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        tryResolve();
      }, DEBOUNCE_MS);
    });
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
    });

    timer = setTimeout(() => {
      cleanup();
      resolve({ status: "not-found", matches: [] });
    }, timeoutMs);
  });

  return {
    promise,
    cancel() {
      cleanup();
      resolve({ status: "not-found", matches: [] });
    },
  };
}
