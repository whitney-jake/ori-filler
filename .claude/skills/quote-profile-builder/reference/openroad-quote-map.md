# OpenRoad UAT quote flow, screen map

Flow: `https://uat-openroad-apps.digital1st.io/public/quote/prospecteditquote`

The URL never changes as you move through the flow. The app is a single page
app, so `urlPatterns` matches once and the profile `step` counter is what
separates one screen from the next.

Each screen sets its own `document.title`. That title is the screen marker used
below.

Verified on 29 August 2026 by driving the flow end to end with Playwright.
Steps 1 to 7 are confirmed: every control below was located and filled
successfully on a live run.

The XPaths for steps 1, 2 and 7 were additionally checked with `__check` and
return exactly one match on their own screen. Steps 3 to 6 were exercised but
not formally counted. They have few controls each, and the app removes a
screen's labels from the DOM when it leaves that screen, which was verified,
so the ambiguity risk there is low. Run `__check` on them the next time
someone is in the flow.

## Landing

The URL opens on a retrieve-quote screen headed "Let's pull up your quote". A
plain text link, "Create a new quote", leads to step 1.

If the browser still holds a quote in progress, the app skips the retrieve
screen and resumes at the screen it was last on. Clear site data for a clean
run. Because of this the create link is an `optional: true` button so the
profile works from either landing.

    //*[normalize-space(text())='Create a new quote' and not(*)]

## Step 1, title `zipcode`

| Field | XPath | Type |
|---|---|---|
| Enter the zip code where your vehicle is registered | `//label[contains(text(),'zip code')]/following-sibling::div[1]//input` | `text` |
| Next | `//button[contains(.,'Next')]` | `button` |

Use the ZIP of the address you plan to enter on step 7.

## Step 2, title `Vehicle Make Model`

Seven autocompletes, all on the same pattern:

    //label[text()='LABEL']/following-sibling::div[1]//input

Labels in order, each one narrowing the next: `Type`, `Year`, `Make`, `Model`,
`Sub-model`, `Body style`, `Doors`. Fill them in that order. Then Next.

`__acProbe(label, "")` lists what a field accepts at that point. Observed
values for a 1965 Ford Mustang: Type `Auto`, Sub-model `Base` plus about 35
engine-coded trims. The sub-model narrows the two fields after it. With the
engine-coded trim `170ci I6 (U-Code) - Fastback - 1st Gen ('65-'66)`, Body style
is `Coupe` and Doors is `2 Doors`. With plain `Base`, Body style is `Hardtop` /
`Fastback` / `Convertible` and Doors is `2dr`. The quote profiles use the
engine-coded trim, so they use `Coupe` and `2 Doors`.

Option text must match exactly. `waitForListOption` in `src/lib/wait.ts` compares
the trimmed `textContent` of each `li` to the profile value with `===`. Copy the
label character for character, including apostrophes and dashes.

**A reCAPTCHA follows this screen.** Next opens a "Verification required" modal
with an "I'm not a robot" checkbox. No profile can clear it. The tester solves
it by hand, then clicks Fill again for step 3.

The checkbox alone cleared it on the first two runs of a session. On a third
run in the same browser it escalated to a "Select all images with a bus"
challenge. Expect the challenge to get harder the more times the flow is
driven from one browser, and expect a human to be needed for it. Do not try to
automate around it.

## Step 3, title `Vehicle Value`

| Field | XPath | Type |
|---|---|---|
| Amount | `//label[contains(.,'Amount')]/following::input[1]` | `text` |
| Next | `//button[contains(.,'Next')]` | `button` |

Digits only, no currency symbol or separators. The app formats the display.

## Step 4, title `Vehicle Modifications`

Seven modification checkboxes, all left unchecked for a clean risk, then one
Yes/No group.

| Field | XPath | Type |
|---|---|---|
| Is the vehicle under active restoration? | `//label[contains(.,'active restoration')]/ancestor::ice-radio-button[1]` | `radio`, `selectBy: label` |
| Next | `//button[contains(.,'Next')]` | `button` |

## Step 5, title `Vehicle Usage`

The busiest screen, and the one that needs `reVerifyFields`.

| Field | XPath | Type |
|---|---|---|
| Registration type | `//div[@id='regTypeContainer']` | `button-group` |
| How long have you owned the vehicle? | `//label[contains(.,'How long have you owned')]/following::select[1]` | `select`, `selectBy: label` |
| Is this vehicle owned/leased/financed? | `//label[contains(.,'owned/leased/financed')]/following::select[1]` | `select`, `selectBy: label` |
| How many miles per year will you drive the vehicle? | `//label[contains(.,'miles per year')]/following::select[1]` | `select`, `selectBy: label` |
| Private garage, barn, car condo, private parking garage, or pole building | `//label[contains(.,'Private garage')]/ancestor::ice-radio-button[1]` | `radio`, `selectBy: label` |
| Is this vehicle used as your primary vehicle for daily transportation? | `//label[contains(.,'primary vehicle')]/ancestor::ice-radio-button[1]` | `radio`, `selectBy: label` |
| Is the vehicle used for racing? | `//label[contains(.,'racing')]/ancestor::ice-radio-button[1]` | `radio`, `selectBy: label` |
| Is the vehicle used for off-roading? | `//label[contains(.,'off-roading')]/ancestor::ice-radio-button[1]` | `radio`, `selectBy: label` |
| Is the vehicle use for business purposes? | `//label[contains(.,'business purposes')]/ancestor::ice-radio-button[1]` | `radio`, `selectBy: label` |
| Next | `//button[contains(.,'Next')]` | `button` |

The last question's label reads "Is the vehicle use for business purposes?".
The missing "d" is the app's own wording. Match it.

Button group options: `Standard`, `Collector plate`, `Authentic`.

Select options:

- How long owned: `1 year`, `2 years`, `3 years`, `4 years`, `5 years`,
  `More than 5 years`, `New Purchase`
- Owned/leased/financed: `Financed`, `Leased`, `Owned`
- Miles per year: includes `0 - 3,500`

**Setting a select clears a radio that was already answered.** Observed on both
runs: setting the miles select re-rendered the section and blanked the storage
group. Order the selects before the radios, put `waitForNext: true` on every
control in this step, and set `reVerifyFields: true` on the profile.

## Step 6, title `Vehicle Summary`

Read only. Buttons: Edit, Delete, Add another vehicle, Back, Next. The profile
only clicks Next.

## Step 7, title `Applicant Information`

| Field | XPath | Type |
|---|---|---|
| First name | `//label[contains(.,'First name')]/following::input[1]` | `text` |
| Last name | `//label[contains(.,'Last name')]/following::input[1]` | `text` |
| DOB | `//label[contains(.,'DOB')]/following::input[1]` | `text` |
| Gender | `//label[contains(.,'Gender')]/following::select[1]` | `select`, `selectBy: label` |
| Email | `//label[contains(.,'Email')]/following::input[1]` | `text` |
| Physical Address | `//label[contains(.,'Physical Address')]/ancestor::div[contains(@class,'search-container')][1]//input[contains(@class,'inputAutocomplete')]` | `autocomplete` |
| Who is the current collector vehicle insurance provider? | `//label[contains(.,'current collector vehicle insurance provider')]/following::select[1]` | `select`, `selectBy: label` |
| Is the applicant a member of a car club? | `//label[contains(.,'member of a car club')]/following::select[1]` | `select`, `selectBy: label` |
| Next | `//button[contains(.,'Next')]` | `button` |

Notes for this screen:

- **DOB is a masked text input**, not a date input. Placeholder `MM/DD/YYYY`,
  `type="text"`. Use profile type `text` and a value like `01/01/1970`.
- **Do not use the bare address XPath.** `//input[contains(@class,'inputAutocomplete')]`
  matches twice, because the mailing address field shares the class. The
  label-anchored form above matches once.
- **Mailing Address fills itself.** "Same as physical address" is checked by
  default and mirrors the physical address. Leave it alone.
- **The address value must be the exact suggestion text**, comma joined with no
  spaces, for example `202 S Union St,Traverse City,MI,49684`. Typing that whole
  string does return the matching suggestion, so it works as a plain
  `autocomplete` field.
- **Plus addressing is rejected.** `name+12345@example.com` returns "Email is
  invalid", so the `{{email}}` template token cannot be used here.
- Gender options: `Male`, `Female`, `Gender X`.
- Insurance provider options include `Not Currently Insured` and about 28
  carriers. Car club options include `None`, `Other`, `OpenRoad Car Club` and
  about 26 named clubs.

Next triggers rating. A modal reads "Rating your quote. Please don't close or
refresh your browser, this may take a minute." Allow up to 30 seconds.

## Step 8 onward, not yet verified

Rating ends on one of two screens.

On success the stepper's third entry, `Premium Summary`, becomes active. The
screens from there to the payment summary are **not mapped**. No run has
reached them.

On decline the title becomes `Error Message` and the page reads "Unfortunately,
this vehicle/risk does not meet our underwriting criteria and we are unable to
offer coverage." Two runs ended here: a 1987 Ford F-250 at $25,000, and the
1965 Ford Mustang at $30,000 and at $25,000. The cause is an underwriting
question, not a form-filling one, and is being resolved separately.

To extend this map, get one risk to rate, then follow the skill procedure from
step 2 of the Procedure section: `__probe()` the Premium Summary screen, ask
the operator for the coverage answers, advance, and repeat to the payment
summary. Add the new screens here as steps 8, 9 and so on, and append the
matching fields to each profile in `profiles/quotes/`.

## Timing

Screens took four to five seconds to render. Rating took up to 30 seconds. The
profiles use `delayMs: 300` and `waitForMs: 5000`.
