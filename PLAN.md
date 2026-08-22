# Form Filler Browser Extension — Build Plan

## 1. Overview

The team needs a Chrome extension that fills web forms. A tester opens the extension on a page. The extension shows a list of fill profiles for that page. The tester picks a profile and clicks Fill. The extension sets the form fields. The extension does not submit the form.

The extension is internal tooling for the test team. The extension runs as an unpacked extension in v1. The team will package it later.

## 2. Confirmed decisions

| Topic | Decision |
|---|---|
| Framework | Chrome Manifest V3 |
| Language | TypeScript, no UI framework |
| Build | esbuild |
| Field matching | Relative XPath from a per-field anchor |
| Fallback | Attribute selectors (id, name, data-testid), then label/placeholder text |
| Anchor ambiguity | The modal asks the tester to pick the right element |
| Profile storage | Bundled JSON files plus runtime import |
| Import | Native file picker in the modal |
| Persistence | Imported profiles persist in chrome.storage.local |
| Profile management | The modal can delete any profile, bundled or imported |
| Trigger | Floating button on the page opens the modal |
| Page matching | URL glob patterns per profile |
| Fill behavior | Clear each field, set the value, blur. No submit. |
| Failure behavior | Stop on the first failed field. Report the failure. |
| Selects | Match by option label or option value. The profile specifies which. |
| Radio groups | Group container XPath plus value or label matching |
| Skip flags | skipIfFilled, required, optional |
| Timing | Profile-level delayMs with per-field override |
| Values | Static strings plus templates {{uuid}}, {{email}}, {{timestamp}} |
| Controlled inputs | Use the native value setter plus input/change events. Works with React, Vue, Angular. |
| Permissions | All URLs now. Tighten to specific domains before release. |
| Tests | Vitest unit tests |
| Field types | text, select, checkbox, radio, date. No textarea in v1. |

## 3. Data model

The profile JSON is the contract between all workstreams. All agents build against this schema. Do not change the schema without a team decision.

```json
{
  "id": "create-customer",
  "name": "Create Customer",
  "description": "Fills the new customer form",
  "urlPatterns": ["*/customers/new"],
  "delayMs": 100,
  "fields": [
    {
      "anchor": "//form[@data-form='customer']",
      "xpath": ".//input[@name='firstName']",
      "type": "text",
      "value": "Jane",
      "clearFirst": true
    },
    {
      "anchor": "//form[@data-form='customer']",
      "xpath": ".//select[@name='country']",
      "type": "select",
      "selectBy": "label",
      "value": "United States"
    },
    {
      "anchor": "//form[@data-form='customer']",
      "xpath": ".//fieldset[@name='tier']",
      "type": "radio",
      "selectBy": "value",
      "value": "gold",
      "optional": true
    },
    {
      "anchor": "//form[@data-form='customer']",
      "xpath": ".//input[@name='newsletter']",
      "type": "checkbox",
      "value": true,
      "skipIfFilled": true
    },
    {
      "anchor": "//form[@data-form='customer']",
      "xpath": ".//input[@name='birthdate']",
      "type": "date",
      "value": "1990-01-15",
      "delayMs": 500
    }
  ]
}
```

Schema rules:

- `id`: Unique string. Imported profiles use this key in storage.
- `urlPatterns`: Array of glob strings. Each pattern matches against the full URL. A pattern may start with `*` to match any scheme and host.
- `fields`: Array of field objects. The extension fills fields in array order.
- `anchor`: XPath to a stable container element. The anchor is relative to the document root.
- `xpath`: XPath relative to the anchor element. The path must start with `./` or `.//`.
- `type`: One of `text`, `select`, `checkbox`, `radio`, `date`. Textarea is excluded for v1.
- `value`: String for text, select, and date. Boolean for checkbox and radio.
- `selectBy`: `label` or `value`. Required when type is `select`. Defaults to `value` for type `radio`.
- `fallback`: Optional array of attribute names. Default is `["id", "name", "data-testid"]`.
- `placeholder`: Optional string used for the placeholder-text fallback.
- `clearFirst`: Optional boolean. Default is true. When true, the extension clears the field before filling.
- `delayMs`: Optional profile-level number. The extension waits this many milliseconds before each field fill, except the first.
- Field `delayMs`: Optional override. This value replaces the profile delay for that field.
- `skipIfFilled`: Optional boolean, default false. When the field already has a value, the extension skips it.
- `optional`: Optional boolean, default false. When the field cannot be resolved, the extension skips it and continues.
- `required`: Optional boolean, default true. When the field resolves but the fill fails, the extension stops the fill. Set `required: false` to continue.
- Radio: The `xpath` points to the group container. The extension finds `input[type=radio]` elements inside the container. `selectBy: "value"` matches the radio's `value` attribute. `selectBy: "label"` matches the associated label text.
- Schema validation uses zod. The extension rejects invalid profiles at import time and at load time.

## 4. Module design and APIs

Each module has a fixed public API. Agents implement only their own modules. Other modules import the documented API. No agent edits another module.

### 4.1 types/profile.ts

Owner: WS1. Other agents import from this file only.

```ts
export type FieldType = "text" | "select" | "checkbox" | "radio" | "date";
export type SelectMatch = "label" | "value";

export interface ProfileField {
  anchor: string;
  xpath: string;
  type?: FieldType;
  value: string | boolean;
  selectBy?: SelectMatch;
  fallback?: string[];
  placeholder?: string;
  clearFirst?: boolean;
  skipIfFilled?: boolean;
  optional?: boolean;
  required?: boolean;
  delayMs?: number;
}

export interface Profile {
  id: string;
  name: string;
  description?: string;
  urlPatterns: string[];
  delayMs?: number;
  fields: ProfileField[];
}

export function parseProfile(raw: unknown): Profile;
export function validateProfile(p: Profile): string[];
```

### 4.2 lib/glob.ts

```ts
export function matchesUrl(pattern: string, url: string): boolean;
export function anyPatternMatches(patterns: string[], url: string): boolean;
```

Glob rules:

- `*` matches any sequence of characters.
- `?` matches one character.
- The pattern matches against the full URL.
- `matchesUrl("*/customers/new", "https://app.com/customers/new")` returns true.

### 4.3 lib/xpath.ts

```ts
export interface ResolveResult {
  element?: Element;
  status: "ok" | "not-found" | "ambiguous";
  matches: Element[];
}

export function resolveAnchor(doc: Document, anchorXpath: string): ResolveResult;
export function resolveField(doc: Document, anchorEl: Element, field: ProfileField): ResolveResult;
```

Resolution order for a field:

1. Resolve the anchor XPath with `document.evaluate`.
2. Resolve the relative field XPath from the anchor element.
3. If the XPath fails, use attribute fallback. Query `[attr="value"]` inside the anchor subtree first, then in the whole document.
4. If attribute fallback fails, use placeholder text and label text matching.

Ambiguity rules:

- Anchor matches more than one element. The result is `ambiguous`.
- Field XPath matches more than one element. The result is `ambiguous`.
- Any step finds zero elements. The result is `not-found`.

Unit tests need a `document.evaluate` polyfill. jsdom does not implement XPath. Use the `xpath` npm package over jsdom nodes.

### 4.4 lib/templates.ts

```ts
export function expand(value: string): string;
```

Token rules:

- `{{uuid}}` expands to a new v4 UUID.
- `{{email}}` expands to a unique lowercase email address per fill.
- `{{timestamp}}` expands to the current ISO 8601 timestamp.
- An unknown token throws a TemplateError. The fill stops.

### 4.5 lib/fill.ts

```ts
export interface FillStatus {
  status: "ok" | "failed";
  message?: string;
}

export function fillField(el: Element, field: ProfileField, value: string | boolean): FillStatus;
export function hasValue(el: Element): boolean;
```

Fill rules by type:

- text and date: Focus the element. Clear if required. Set the value through the native prototype setter. Dispatch `input` then `change` events with `bubbles: true`. Blur.
- select: Match by label or value. Select the matching option. Dispatch `change`.
- checkbox: Set `checked` to the value. Dispatch `input` then `change`.
- radio: The element is the group container. Find the `input[type=radio]` elements inside it. Match one by `selectBy`. Set `checked` to true. Dispatch `input` then `change`.
- Disabled or readonly elements: Return `failed` with a reason.
- `hasValue` returns true when the element has a non-empty value or checked state.

Native setter code:

```ts
const setter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value"
)!.set!;
setter.call(el, value);
```

### 4.6 lib/storage.ts

```ts
export async function loadBundledProfiles(): Promise<Profile[]>;
export async function loadImportedProfiles(): Promise<Profile[]>;
export async function saveImportedProfile(p: Profile): Promise<void>;
export async function deleteImportedProfile(id: string): Promise<void>;
export async function getAllProfiles(): Promise<{ bundled: Profile[]; imported: Profile[] }>;
```

Storage rules:

- Bundled profiles live in `profiles/*.json` inside the extension. The loader fetches each file with `fetch(chrome.runtime.getURL(...))`.
- Imported profiles live under the `importedProfiles` key in chrome.storage.local.
- `saveImportedProfile` upserts by id.
- The extension treats a profile id conflict between bundled and imported as two separate profiles.

### 4.7 content/ui.ts

```ts
export interface UiController {
  onFill(profile: Profile): void;
  onImport(): void;
  onDelete(profile: Profile): void;
  onClose(): void;
  onAmbiguityPick(profile: Profile, field: ProfileField, matchIndex: number): void;
}

export function injectUi(controller: UiController): void;
export function renderProfileList(profiles: Profile[]): void;
export function showFillProgress(statuses: { field: ProfileField; status: FillStatus }[]): void;
export function showFailure(field: ProfileField, message: string, el: Element): void;
export function setAmbiguityPicker(field: ProfileField, matches: Element[]): void;
```

UI rules:

- The floating button sits fixed at the bottom right. The button label is "Fill".
- The modal and button live inside a shadow DOM root. This isolates the styles from the host page.
- The modal lists profiles that match the current URL.
- Each profile row shows the name, description, and field count.
- Each row has a Fill button and a Delete button.
- An Import button opens the native file picker. The picker accepts `.json` files.
- After a fill, the modal shows per-field status.
- On failure, the modal shows the field name and the reason. The extension outlines the failed element.

### 4.8 content/main.ts

The orchestrator. It owns no public API. Main wires all modules together.

Main behavior:

- On load, inject the UI.
- Compute matching profiles with `anyPatternMatches`.
- Render the profile list.
- On Fill: run the fill flow in section 5.
- On Import: read the file, parse with `parseProfile`, save with `saveImportedProfile`, refresh the list.
- On Delete: call `deleteImportedProfile`, refresh the list.
- Recompute matching profiles when the modal opens, on `popstate`, and on `hashchange`.

## 5. Fill flow

For each field, in order:

1. If `skipIfFilled` is true and the field has a value, skip.
2. Resolve the field. If resolution fails and `optional` is true, skip and continue. Otherwise stop.
3. If the resolution is ambiguous, show the picker. If the tester cancels, apply the optional rule.
4. Fill the field. If the fill fails and `required` is true, stop. Otherwise continue.
5. Wait for the delay before the next field, except after the last field. The field `delayMs` replaces the profile `delayMs`.

## 6. Repository layout

```
form-filler/
  manifest.json           (source manifest; build copies it)
  package.json
  tsconfig.json
  build.mjs               (esbuild build script)
  src/
    types/profile.ts
    lib/glob.ts
    lib/xpath.ts
    lib/templates.ts
    lib/fill.ts
    lib/storage.ts
    content/main.ts
    content/ui.ts
    ui/styles.css
  profiles/
    create-customer.json
    login.json
  testpage/
    index.html            (fixture page for manual checks)
  tests/
    glob.test.ts
    templates.test.ts
    xpath.test.ts
    fill.test.ts
    storage.test.ts
    schema.test.ts
```

Build commands:

- `npm run build` — bundles to `dist/`. Outputs `dist/content.js`, `dist/manifest.json`, `dist/ui/styles.css`, `dist/profiles/*.json`.
- `npm run test` — runs Vitest.
- `npm run typecheck` — runs `tsc --noEmit`.

## 7. Manifest and permissions

```json
{
  "manifest_version": 3,
  "name": "Form Filler",
  "version": "0.1.0",
  "description": "Fills test form profiles on demand",
  "permissions": ["storage"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["profiles/*.json"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

The extension has no background worker in v1. The content script performs all work.

## 8. Testing strategy

Vitest runs unit tests for every module. Agents must not run `npm test` or `npx vitest` directly in the main loop. Instead, agents delegate test execution to the `test-runner` subagent using the `task` tool with `subagent_type: test-runner`. The test-runner discovers test files, delegates each file to `test-executor` child agents, re-runs any failures, and produces a structured report.

- glob.test.ts: pattern matching cases, wildcards, edge cases.
- templates.test.ts: each token, unknown token error, multiple tokens in one value.
- xpath.test.ts: anchor resolution, relative path, attribute fallback, label fallback, ambiguity, not-found. Use the `xpath` package as the `document.evaluate` polyfill.
- fill.test.ts: each field type, native setter events, disabled elements, select by label and by value, radio groups.
- storage.test.ts: mock the chrome.storage API, test upsert and delete.
- schema.test.ts: valid profile, invalid fields, missing required keys.

The `testpage/index.html` fixture supports manual checks. Serve it over http://localhost. Content scripts do not inject on `file://` URLs.

## 9. Parallel workstreams

Deploy one agent per workstream. Each agent works on distinct files. Each agent follows the documented APIs. The schema in section 3 is the binding contract.

| WS | Owner files | Scope | Do not touch |
|---|---|---|---|
| WS1 | package.json, tsconfig.json, build.mjs, manifest.json, src/types/profile.ts, tests/schema.test.ts | Scaffold repo. Configure esbuild and Vitest. Define the profile schema with zod. | Everything else |
| WS2 | src/lib/glob.ts, tests/glob.test.ts | Implement URL glob matching. | Everything else |
| WS3 | src/lib/xpath.ts, tests/xpath.test.ts | Implement anchor and field resolution plus fallbacks. | Everything else |
| WS4 | src/lib/templates.ts, tests/templates.test.ts | Implement template expansion. | Everything else |
| WS5 | src/lib/fill.ts, tests/fill.test.ts | Implement field filling, event dispatch, radio groups, and the hasValue helper. | Everything else |
| WS6 | src/lib/storage.ts, tests/storage.test.ts | Implement bundled and imported profile storage. | Everything else |
| WS7 | src/content/ui.ts, src/ui/styles.css | Build the floating button and modal with shadow DOM. | Module logic |
| WS8 | src/content/main.ts | Wire all modules. Implement the fill flow, import, delete, and ambiguity handling. | Module internals |
| WS9 | profiles/*.json, testpage/index.html, README.md | Write seed profiles and the fixture page. Document profile authoring. | All source code |

Dependency note: WS8 imports the public APIs of WS2 through WS7. WS8 must wait for those modules or build against the documented signatures. If agents run fully in parallel, WS8 uses stub implementations that match the documented APIs and the integration happens in WS9.

## 10. Milestones and sequence

- M0: WS1 completes. The repo builds and the schema tests pass.
- M1: WS2 through WS9 run in parallel against the documented contract.
- M2: Integration pass. Fix cross-module issues. Run all tests.
- M3: Manual verification. Load unpacked in Chrome. Use the fixture page. Confirm the checklist below.
- M4: Later. Package a zip or CRX for internal distribution.

## 11. Open decisions

- Misc field types: Hidden inputs, custom picker widgets, shadow DOM fields, and iframe fields are out of scope for v1. The team reviews them after v1.
- SPA navigation: The modal refreshes on open, `popstate`, and `hashchange`. The team can add route polling later if needed.

## 12. Definition of done

- The repo builds with `npm run build`.
- All Vitest tests pass.
- `tsc --noEmit` reports no errors.
- The extension loads unpacked in Chrome.
- On the fixture page, the extension fills every supported field type.
- A mismatched field stops the fill and shows the failure in the modal.
- An ambiguous anchor shows the picker and fills the chosen element.
- The extension fills a radio group by value and by label.
- A skipped field does not stop the fill.
- An optional unresolved field does not stop the fill.
- A required fill failure stops the fill.
- Fills respect the profile delay and the field delay.
- An imported profile persists after a browser restart.
- A deleted profile disappears from the modal.
