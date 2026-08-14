# Form Filler

Form Filler is a Chrome extension for the test team. It fills web forms from
JSON profiles. A tester opens the extension on a page. The extension shows the
profiles that match that page. The tester picks a profile and clicks Fill. The
extension sets the form fields. It does not submit the form. It stops on the
first failed field. It reports the failure in the modal.

## Load the extension

1. Build the extension first. Run `npm run build`.
2. Open `chrome://extensions`.
3. Turn on Developer mode.
4. Click "Load unpacked".
5. Select the `dist/` folder.

The build outputs these files to `dist/`:

- `dist/content.js`
- `dist/manifest.json`
- `dist/ui/styles.css`
- `dist/profiles/*.json`

## Run the test page

The `testpage/index.html` file is a manual verification fixture. Content scripts
do not run on `file://` URLs. Serve the page over HTTP.

1. From the repo root, run `python3 -m http.server`.
2. Open `http://localhost:8000/testpage/index.html` in Chrome.
3. Click the Fill button on the page.
4. Pick a profile and click Fill.

The page contains these scenarios:

- A customer form with all five field types.
- A login form.
- An ambiguous field that opens the picker.
- An optional field that does not resolve.
- A required field that does not resolve. The fill stops.
- A disabled input. The fill resolves it but cannot fill it. The fill stops.
- A pre-filled field with `skipIfFilled`. The fill skips it.

## Profile authoring

A profile is a JSON file. The extension validates every profile. It rejects an
invalid profile at import time and at load time.

### Example

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

### Profile-level attributes

| Attribute | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | required | Unique string. Imported profiles use this as the storage key. |
| `name` | string | required | Display name shown in the modal. |
| `description` | string | optional | Shown under the name in the modal. |
| `urlPatterns` | string array | required | URL glob patterns. A pattern matches against the full URL. A pattern may start with `*` to match any scheme and host. |
| `delayMs` | number | optional | Wait this many milliseconds before each field fill, except the first. Must be positive. |
| `fields` | array | required | The fields to fill, in order. |

### Field-level attributes

| Attribute | Type | Default | Meaning |
|---|---|---|---|
| `anchor` | string | required | XPath to a stable container element. The path is absolute from the document root. |
| `xpath` | string | required | XPath relative to the anchor. The path must start with `./` or `.//`. |
| `type` | string | `text` | One of `text`, `select`, `checkbox`, `radio`, `date`. Textarea is not supported in v1. |
| `value` | string or boolean | required | See the value rules below. |
| `selectBy` | string | `value` for radio | `label` or `value`. Required when `type` is `select`. |
| `fallback` | string array | `["id", "name", "data-testid"]` | Attribute names used when the XPath fails. |
| `placeholder` | string | optional | Text used for the placeholder-text fallback and the label fallback. |
| `clearFirst` | boolean | `true` | Clear the field before filling it. |
| `skipIfFilled` | boolean | `false` | Skip the field when it already has a value. |
| `optional` | boolean | `false` | Skip the field when it cannot be resolved. |
| `required` | boolean | `true` | Stop the fill when the field resolves but filling fails. |
| `delayMs` | number | optional | Overrides the profile `delayMs` for this field. Must be positive. |

### Value rules

| Field type | Value type | Meaning |
|---|---|---|
| `text` | string | The text to set. |
| `select` | string | The option label or value to match. `selectBy` decides which one. |
| `checkbox` | boolean | `true` checks the box. `false` unchecks it. |
| `radio` | string | The option value or label to match in the group. |
| `date` | string | The date in `YYYY-MM-DD` format. |

### selectBy

- `label` matches the option label for a select. It matches the associated label text for a radio group.
- `value` matches the option value attribute for a select. It matches the radio `value` attribute.
- `selectBy` is required when `type` is `select`.
- `selectBy` is optional when `type` is `radio`. It defaults to `value`.

For a radio group, the `xpath` points to the group container. The extension
finds the `input[type=radio]` elements inside it.

### Template tokens

The extension expands these tokens in any string value.

| Token | Expansion |
|---|---|
| `{{uuid}}` | A new v4 UUID. |
| `{{email}}` | A unique lowercase email address per fill. |
| `{{timestamp}}` | The current ISO 8601 timestamp. |

An unknown token stops the fill. The extension reports the error.

## Import a profile

1. Click the Import button in the modal.
2. Select a `.json` profile file.

The extension validates the file. It saves a valid profile in
`chrome.storage.local` under the `importedProfiles` key. The profile persists
after a browser restart. An invalid file is rejected.

To remove an imported profile, click Delete next to it in the modal. The
extension removes it from storage. It disappears from the modal. The modal can
also delete a bundled profile from the list, but the bundled file stays in the
extension.

Bundled profiles live in `profiles/*.json`. The build copies them to
`dist/profiles/`.

## Build and test

| Command | Action |
|---|---|
| `npm run build` | Bundle the extension into `dist/`. |
| `npm run test` | Run the Vitest unit tests. |
| `npm run typecheck` | Run `tsc --noEmit`. |
