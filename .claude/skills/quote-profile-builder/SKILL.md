---
name: quote-profile-builder
description: Build an ori-filler form-filler profile by driving a multi-screen web form with Playwright, reading each screen, asking the operator what to enter, and writing a profile JSON with one step per screen. Use when the user wants a new quote profile, a profile for the OpenRoad UAT quote flow at uat-openroad-apps.digital1st.io, an ori-filler profile, a smoke-test profile for another state, or when an existing profile stops matching the site and needs its XPaths re-derived.
---

# Quote profile builder

Build a profile for the ori-filler extension by driving the live form instead
of guessing at XPaths in dev tools.

The output is one JSON file in `profiles/`. It has one `step` per screen. The
tester clicks Fill once per screen: the extension fills that step's fields,
clicks Next, then advances its own step counter.

## Before you start

Read `src/types/profile.ts`. It is the authority on the schema. `README.md` is
older and does not document `autocomplete`, `button`, `button-group`, `step`,
`waitForNext`, `waitForMs` or `reVerifyFields`.

Read `profiles/quotes/openroad-quote-mi.json` as the worked example, and
`reference/openroad-quote-map.md` for the screens of the OpenRoad quote flow
that are already mapped. If the target is that flow, start from the map and
only re-derive what has changed.

## Procedure

### 1. Open the flow and install the helpers

Navigate with `browser_navigate`, then paste the entire contents of
`scripts/probe.js` as the `function` argument of one `browser_evaluate` call.
It returns `"installed"`. Re-install after any page reload.

### 2. Read the screen

Call `__probe()`. It returns the document title, every visible label with the
tag and type of its control, the option list of every select, and the visible
button labels.

Record the title. This app sets a distinct `document.title` per screen, which
makes it a reliable screen marker and a good step name.

For an autocomplete, `__acProbe(label, "")` lists what the field accepts. Show
that list to the operator rather than guessing.

### 3. Ask the operator for the values

Ask before moving on, one screen at a time. Offer select and autocomplete
options verbatim as the choices.

Do not invent insurance answers. A made-up vehicle or coverage answer can pass
form validation and still be declined by underwriting several screens later,
which wastes a whole run.

### 4. Advance

Fill with `__ac`, `__sel`, `__radio`, `__set`, then `__btn("Next")`. Wait four
to five seconds and call `__probe()` again. Repeat until the flow ends.

### 5. Verify every XPath before writing the profile

Build the candidate XPath for each field and pass them all to `__check({...})`.
Every one must return exactly `1`. `resolveField` in `src/lib/xpath.ts` treats
more than one match as ambiguous and stops the fill to ask the tester which
element to use, which defeats the point of the profile.

A count of 2 usually means a second, related control shares the pattern. Anchor
on the nearest labelled container instead. The physical and mailing address
inputs on the OpenRoad applicant screen are the worked case:

    BAD   //input[contains(@class,'inputAutocomplete')]
    GOOD  //label[contains(.,'Physical Address')]/ancestor::div[contains(@class,'search-container')][1]//input[contains(@class,'inputAutocomplete')]

### 6. Write the profile

One `step` per screen, numbered from 1 in screen order. The Next click is the
last field of its step.

Put the visible label text in the field's `label` and use the `{{field.label}}`
token in the XPath so the two cannot drift apart. `src/lib/templates.ts`
expands it.

### 7. Validate

    npx tsx -e "import {parseProfile} from './src/types/profile'; import fs from 'fs'; parseProfile(JSON.parse(fs.readFileSync('profiles/<file>.json','utf8'))); console.log('valid')"
    npm run test
    npm run build

`npm run build` copies `profiles/**/*.json` into `dist/profiles/` and rebuilds
`dist/profiles/index.json`. A new subdirectory needs no build change.

## XPath idioms for this app

The form is an ICE widget app. These patterns cover every control seen so far.

| Control | XPath | Profile type |
|---|---|---|
| Text input by label | `//label[contains(.,'LABEL')]/following::input[1]` | `text` |
| Autocomplete | `//label[text()='LABEL']/following-sibling::div[1]//input` | `autocomplete` |
| Address lookup | anchor on the label, see step 5 | `autocomplete` |
| Select | `//label[contains(.,'LABEL')]/following::select[1]` | `select` with `selectBy: "label"` |
| Yes/No group | `//label[contains(.,'QUESTION')]/ancestor::ice-radio-button[1]` | `radio` with `selectBy: "label"` |
| Button group | the container id, for example `//div[@id='regTypeContainer']` | `button-group` |
| Next | `//button[contains(.,'Next')]` | `button` |
| Plain text link | `//*[normalize-space(text())='TEXT' and not(*)]` | `button` |

For a radio group the XPath points at the container. The extension finds the
`input[type=radio]` elements inside it and clicks the matching label.

## Behaviour of this app that the profile must handle

These were all observed on live runs. They are the difference between a profile
that works and one that half fills a screen.

**A reCAPTCHA interrupts the flow.** After Next on the vehicle screen the app
shows a "Verification required" modal. No profile can clear it. The tester
solves it by hand and clicks Fill again for the next step. Say so in the
profile `description`.

**Setting a select can clear a radio that was already answered.** The section
re-renders. Set `reVerifyFields: true` on the profile, which makes the
extension re-apply cleared fields, and `waitForNext: true` on each control in
that step so the re-render settles before the next field. Order the selects
before the radios.

**`reVerifyFields` re-fills radios that are in fact correct.** `isStillCorrect`
in `src/content/main.ts` reads the first radio in the group and compares
`checked` to `Boolean(value)`, and `Boolean("No")` is `true`. A group answered
"No" therefore looks wrong on every pass and is clicked again, up to three
times. Clicking an already-selected option changes nothing, so this is slow but
harmless. Do not try to fix it by dropping `reVerifyFields`.

**Option lists from earlier screens stay in the DOM.** `waitForListOption` in
`src/lib/wait.ts` scans every `li` in the document for an exact text match, so
an autocomplete value that also appeared on an earlier screen can click a
hidden stale option. Keep autocomplete values distinctive, and use `__opts()`,
which filters to visible options, when showing choices to the operator.

**Label elements from earlier screens do not persist.** Only the option lists
do. XPaths anchored on labels are safe across steps.

**Autocomplete values must match the option text exactly.** The extension types
the value, then waits for an `li` whose trimmed text equals it. Partial text
will type fine and then never resolve. For the address lookup this means the
full comma joined suggestion, `202 S Union St,Traverse City,MI,49684`, with no
spaces after the commas. Typing that whole string does still return the
matching suggestion.

**A date field may be a masked text input.** The applicant DOB has placeholder
`MM/DD/YYYY` but `type="text"`. Use profile type `text` and value `01/01/1970`.
Profile type `date` with `YYYY-MM-DD` does not work there.

**The email field rejects plus addressing.** An address such as
`name+12345@example.com` returns "Email is invalid", so the `{{email}}`
template token cannot be used on this form. Use a fixed address.

**The app resumes a quote in progress.** Reopening the URL can land on the
screen the browser was last on rather than the first screen. Clear site data to
start clean. Make the first field of step 1 an `optional: true` button for the
"Create a new quote" link so the profile works from either landing.

## Timing

Screens took four to five seconds to render. Use `waitForMs: 5000` and
`delayMs: 300` at the profile level. `waitForMs` is how long the extension
waits for a field that is not there yet, so it is what absorbs a slow screen.
