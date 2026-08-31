// Browser helper library for building ori-filler profiles.
//
// Paste the whole file as the `function` argument of one
// mcp__plugin_playwright_playwright__browser_evaluate call. It installs the
// helpers on `window` and returns "installed". Re-install after any page
// reload, because a reload clears them.
//
// The fill helpers copy what the extension does at runtime, so what works here
// works in a profile. See src/lib/fill.ts and src/lib/wait.ts.

() => {
  const xp = (x) => document.evaluate(x, document, null, 9, null).singleNodeValue;
  const xpAll = (x) => {
    const r = document.evaluate(x, document, null, 7, null);
    const out = [];
    for (let i = 0; i < r.snapshotLength; i++) out.push(r.snapshotItem(i));
    return out;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Set a value the way fillTextLike does: one input event, then change, then blur.
  window.__set = (el, v) => {
    el.focus();
    setter.call(el, "");
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    setter.call(el, v);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
    return "ok";
  };

  // Type character by character the way fillAutocomplete does, so the widget's
  // keystroke handlers fire and the suggestion list opens.
  window.__type = (el, v) => {
    el.focus();
    setter.call(el, "");
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    for (const c of v) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: c, bubbles: true }));
      setter.call(el, el.value + c);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: c }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: c, bubbles: true }));
    }
    return "ok";
  };

  // Visible suggestion options. Hidden `li` elements from earlier screens stay
  // in the DOM, so filter on offsetParent before showing a list to the operator.
  window.__opts = () =>
    [...document.querySelectorAll("li")].filter((l) => l.offsetParent !== null).map((l) => l.textContent.trim());

  // Fill an autocomplete and click the option whose text matches exactly.
  // Exact match is what waitForListOption in src/lib/wait.ts does.
  window.__ac = async (label, value) => {
    const el = xp(`//label[text()='${label}']/following-sibling::div[1]//input`);
    if (!el) return "no input for " + label;
    window.__type(el, value);
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const li = [...document.querySelectorAll("li")].find((l) => l.textContent.trim() === value);
      if (li) {
        li.click();
        return "ok";
      }
    }
    return "TIMEOUT, visible options: [" + window.__opts().join(" | ") + "]";
  };

  // Open an autocomplete with a seed string and report what it offers.
  // Use an empty seed to list everything the field allows.
  window.__acProbe = async (label, seed) => {
    const el = xp(`//label[text()='${label}']/following-sibling::div[1]//input`);
    if (!el) return "no input for " + label;
    window.__type(el, seed);
    await sleep(2000);
    return window.__opts();
  };

  // Click the option in a Yes/No group whose label text matches.
  window.__radio = (question, value) => {
    const c = xp(`//label[contains(.,${JSON.stringify(question)})]/ancestor::ice-radio-button[1]`);
    if (!c) return "no group for " + question;
    for (const r of c.querySelectorAll('input[type="radio"]')) {
      const l = c.querySelector(`label[for="${r.id}"]`) || r.closest("label");
      if (l && l.textContent.trim() === value) {
        l.click();
        return "ok";
      }
    }
    return "no option " + value;
  };

  window.__sel = (question, optionLabel) => {
    const s = xp(`//label[contains(.,${JSON.stringify(question)})]/following::select[1]`);
    if (!s) return "no select for " + question;
    const o = [...s.options].find((o) => o.text.trim() === optionLabel);
    if (!o) return "no option, available: [" + [...s.options].map((o) => o.text.trim()).join(" | ") + "]";
    s.value = o.value;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    return "ok";
  };

  window.__btn = (text) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === text && vis(x));
    if (!b) return "no button " + text;
    b.click();
    return "ok";
  };

  // Read the current screen. The document title is the screen name and becomes
  // the profile step name.
  window.__probe = () => {
    const out = { title: document.title, controls: [], buttons: [] };
    document.querySelectorAll("label").forEach((l) => {
      if (!vis(l)) return;
      const t = l.textContent.trim();
      if (!t) return;
      let ctl = l.htmlFor ? document.getElementById(l.htmlFor) : null;
      if (!ctl) {
        const s = l.nextElementSibling;
        ctl = s && s.querySelector ? s.querySelector("input,select,textarea") : null;
      }
      if (!ctl) ctl = l.parentElement && l.parentElement.querySelector("input,select,textarea");
      const w = l.closest("ice-radio-button,ice-checkbox");
      out.controls.push({
        label: t,
        tag: ctl ? ctl.tagName.toLowerCase() : null,
        type: ctl ? ctl.type : null,
        wrapper: w ? w.tagName.toLowerCase() : null,
        options: ctl && ctl.tagName === "SELECT" ? [...ctl.options].map((o) => o.text.trim()) : undefined,
      });
    });
    document.querySelectorAll("button").forEach((b) => {
      if (vis(b)) out.buttons.push(b.textContent.trim());
    });
    return out;
  };

  // Count matches for candidate XPaths. Every XPath in a profile must return
  // exactly 1, or resolveField reports the field as ambiguous and stops to ask.
  window.__check = (map) => {
    const out = {};
    for (const k in map) out[k] = xpAll(map[k]).length;
    return out;
  };

  // Re-answer any Yes/No group the app cleared. `map` holds substring to answer
  // pairs, for example { "Private garage": "Yes" }. Anything unlisted gets "No".
  window.__fixRadios = async (map) => {
    for (let i = 0; i < 4; i++) {
      const bad = [...document.querySelectorAll("ice-radio-button")].filter(
        (g) => ![...g.querySelectorAll('input[type="radio"]')].some((r) => r.checked)
      );
      if (bad.length === 0) return "ok";
      for (const g of bad) {
        const q = g.querySelector("label").textContent.trim();
        let want = "No";
        for (const k in map) if (q.includes(k)) want = map[k];
        for (const r of g.querySelectorAll('input[type="radio"]')) {
          const l = g.querySelector(`label[for="${r.id}"]`);
          if (l && l.textContent.trim() === want) {
            l.click();
            break;
          }
        }
      }
      await sleep(900);
    }
    return "gave up, a group is still unanswered";
  };

  return "installed";
};
