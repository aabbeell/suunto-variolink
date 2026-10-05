# Publishing a SuuntoPlus sports app to the public SuuntoPlus Store, and what "production ready" means

Scope: research only, as of 2026-10-03. I used three kinds of source. The **primary local** sources are the SuuntoPlus Editor 1.42.0 extension at `~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0` and the reference doc at `PROJECTS/SUUNTOPO/reference/suuntoplus_reference_docs.md`. The **primary web** sources are the apizone.suunto.com pages. The **community** sources are threads on forum.suunto.com. Anything inferred is marked as inferred. Where sources disagree, both versions are given.

---

## 0. Background: "OpenSuuntoPlus" opened on 2026-03-10/11
- Before March 2026, people on the forum understood that only companies or organisations could become partners and build SuuntoPlus apps (topic 13251, 2025).
- On 2026-03-11 Suunto opened SuuntoPlus development to everyone and created the forum category "Suunto Plus Development" (cid 62). A Suunto press article followed on 2026-03-11 ("open suuntoplus – built by the community"). It describes apps as free tools, reviewed by Suunto, discoverable in the SuuntoPlus Store inside the Suunto mobile app.
- At launch only **sports apps** are open. Watch faces are not. SuuntoPartnerTeam said watch-face creation was "in development" (topic 14789). The 1.42 tooling ships watch-face templates and a visual editor, but there is no evidence that community watch faces can go to the store.

## 1. End-to-end submission process

### 1.1 Who can submit
- **Anyone who is accepted into the Suunto Partner Program.** Individuals are accepted: forum developers report approval as individuals, and SuuntoPartnerTeam said the application link "should work for everyone", although the form still contains some outdated questions from the pre-open era (topic 14766 #7).
- You do **not** need to be a partner to install the Editor, use the simulator or deploy to your own watch. Partnership is needed only to upload to the store (topic 14789 #7; apizone /suuntoplus).
- Application form: https://survey.alchemer.eu/s3/90553908/PARTNER-Become-a-Suunto-Partner (linked from suunto.com/welcomepartners). The page says to fill it in in English, that it takes about 5 minutes, and that you are subscribed to "Suunto Partner News". By applying you accept Suunto's Terms of Use and Privacy Policy and confirm you are at least 16. WebFetch could not render the individual form fields.
- Once accepted, you receive an email titled "You're invited to join Suunto API Zone", and with it a login to apizone.suunto.com (Azure API Management developer portal).
- Approval time (community reports): about 7 days or less for one developer. Others waited more than a week with no reply and no status feedback (topic 14986). The Cloud API process on apizone says applications are reviewed weekly, with a maximum two-week wait; it is not clear that this also applies to SuuntoPlus. If an invite goes missing, contact partners@suunto.com (apizone FAQ).

### 1.2 What is uploaded and where
- You submit through the **SuuntoPlus Sports Apps console on your ApiZone Profile page**. The page is only reachable when signed in: `/suuntoplus-sports-apps-console` is in the sitemap but returns 404 anonymously.
- apizone /suuntoplus lists what a submission contains:
  - the final app package;
  - a well-written description;
  - images that represent the app accurately.
- The same page says that missing details, misleading content or **unauthorized images will prevent publication**. By submitting, you **grant Suunto the right to distribute** the app through the SuuntoPlus Store.
- **The package is the Source Package zip, not the compiled .fea/.dev.**
  - The Editor command "SuuntoPlus: Create Source Package" (`suuntoplus.createSourcePackage[Default]`) is described as being "for submitting your app to Suunto".
  - Forum developers upload "the .zip file that contains the source package" (topic 15473).
  - The console's "Sports app file" link downloads that zip back (topic 15784).
  - Inferred: Suunto builds the binaries per watch and language on its side.
- **What the Source Package contains** (`node_modules/@suunto-internal/suuntoplus-tools/lib/source-package.js`, `createSourcePackage`). It is an AdmZip of **top-level files only** (no subfolders) matching:
  - `main.js`, `manifest.json`, `data.json`;
  - `*.html`, `*.png`, `ext*.js` (regex `ext\w*.js`);
  - `<lang>.json`, for lang in en, fi, no, ko, it, de, fr, nl, cs, da, zh-Hans, sv, es, ru, pt, pl, ja, th, tr, he, el, zh-Hant, id.
  - Consequence: anything in subdirectories, or other file names (for example `step*.js` and README files), is **not** shipped. Keep every asset at the project root.
- The submission form also asks for:
  - a **banner image**;
  - a **"Sports app – screen image" / watch preview**. Developers report it at **466×466 px**; dimensions for the other assets were not found.
  - When uploading, partners are asked for watch images made with the screenshot option. SuuntoPartnerTeam's forum staff say the Editor screenshot tool is not required; any correctly sized image is fine (topic 14767 #1–2). The simulator screenshot feature was stated to be non-functional in March 2026.
- Store text fields are **single-line text fields** (topic 14766 #37). Exact length limits are not documented.

### 1.3 Review and publication
- Suunto reviews the package and its content before publishing (apizone /suuntoplus; forum "How to get started!", topic 14651).
- **No published review checklist was found.** The only stated criteria are complete and truthful information, no misleading content and no unauthorized images.
- SuuntoPartnerTeam: "I don't believe we test the battery consumption of submitted applications". Crashing apps are usually disabled by the firmware (topic 14783 #12).
- Observed review time: the fastest case was HR-ZoneTracker, submitted 2026-06-20 23:58 and published 2026-06-21 (topic 15396). Approval notices are informal: "Today my app was approved" (topic 14766 #29).
- **Costs:** none documented. The apizone FAQ says Suunto does not charge for API use, and the Suunto article calls the apps free tools. There is **no paid-app or in-app-purchase mechanism**. One developer (Live.τ) monetises through an optional subscription in his separate phone companion app, not through the store.
- **No hidden or beta listings:** SuuntoPartnerTeam confirmed that visibility-limited beta testing exists technically but is not available to partners (topic 14766 #4, #7).

### 1.4 Versioning, updates and feedback
- `version` is a string of **max 4 characters** (schema `maxLength: 4`; `limit.js` `MAX_MANIFEST_VERSION_LENGTH=4`; the validator warns if it is too long).
- SuuntoPartnerTeam: `version` must change every time you re-upload to ApiZone (topic 14770). Re-uploading the same version is rejected with an "already uploaded" error (topic 15784 #14).
- Keep `modificationTime` a valid integer (Unix seconds). A wrong value causes "An error occurred when updating the sports app" in ApiZone (topic 15473).
- Update latency, as observed by the community:
  - Binary updates are usually immediate to about 2 hours after first approval (topics 15383, 15784 #2).
  - Store text updates propagate right away.
  - Banner and screen-image changes appear much more slowly, or are cached on phones that already have the app installed (topics 15383, 15390, 15606). Inferred: image changes may go through moderation or a CDN cache.
  - In August–September 2026 a backend bug stopped binary updates propagating for weeks, on both iOS and Android. Suunto fixed it around 2026-09-23. Developers had to push a new "dummy" version to recover (topic 15784).
  - The support reply quoted in that thread ("staging/sandbox", "Store Sync Engine") reads as boilerplate. It should not be treated as a documented mechanism.
- How to check which version the store serves: click "Sports app file" in the console and inspect `manifest.json` (topic 15784 #4). Users can see an app's update date in the Suunto app (watch settings → synced apps).
- **User feedback and ratings:** the store shows a star rating and a review count. Review texts are emailed to the email address of the developer's ApiZone account; the store itself does not show them (topic 14836; apizone /suuntoplus). The developer is responsible for acting on them. Developers commonly put a support email in the store description (oCycler, topic 15787).
- Store deep link format observed: `com.sports-tracker.suunto://campaign/suuntoplusstore/sportsapp/<appId>`, e.g. `zzanch01`.
  - App IDs are 8 characters. Observed IDs: `zzpara01`, `zzanch01`, `climbl01`, `zztrph01` (TrainingPeaks); Suunto's own apps look like `zzgearen` and `zzmoveen`.
  - Inferred: the ID is assigned or derived at publish time. The Editor's local `getAppId` uses the first 6 ASCII characters of the name + `01`.
  - The FIT file carries `suuntoplus_plugin_owner_id` (UUID) and `suuntoplus_plugin_external_id` metadata (apizone FIT example). Inferred: these correspond to the manifest's optional `authorId` / `externalId`, filled by Suunto.

### 1.5 Distribution constraints relevant to the app
- **Development builds are wiped** whenever the watch syncs with the Suunto mobile app. Only store-installed apps persist (topics 14789 #7, 14897).
- So **settings edited in the Suunto app cannot be tested end-to-end before publishing** (topic 15618). The simulator does not support settings editing either. The practical route is to publish and then iterate quickly.
- **The store cannot restrict installs by watch model or display** (topics 14783 #84, 15396 #6). State compatibility in the description, for example "UI2 watches: 9 Peak Pro, Vertical, Race, Race S, Ocean" (Gustin, topic 15661).
- Users can enable up to 2 apps per sport mode (apizone /suuntoplus-sports-apps) or **3** since FW 2.50.26 (forum, topic 15692). The two sources conflict; the newer firmware note says 3.
- Data from `out` entries with `log:true` is saved into the workout FIT as developer fields (`name` = field name, `shownName` = label, `format`) and is reachable via the Suunto Cloud API.

---

## 2. Technical requirements checklist

### 2.1 manifest.json
Sources: `schema/manifest.json`; `node_modules/@suunto-internal/suuntoplus-tools/lib/project/manifest-schema.json`; `manifest.js`; `ng/limit.js`.
- `additionalProperties: false`. Unknown keys fail schema validation.
- **Required fields:** `name`, `version`, `author`, `type`, `usage`, `modificationTime`. For non-watch-face, non-sequence types, `description` and `template` are also required.
- `name`: 1–60, measured in **UTF-8 bytes**, checked per language when localized. The UI width also limits it.
- `description`: 1–100 UTF-8 bytes. SuuntoPartnerTeam recommends **under about 22 characters**, because it shows under the name in the on-watch selection list (topic 14770).
- `type`:
  - `feature` for a normal sports app; it builds a `.fea`;
  - `device` for a BLE device app; it builds a `.dev`;
  - `sequence` and `widget` exist in the schema;
  - `watchface` exists only in the tools schema.
- `usage`: "workout".
- `modificationTime`: integer, seconds since 1970.
- `in`: max **10** entries, each `{name, source, type: get|subscribe|critical}`. A nonexistent source path makes the app fail to load on the watch. The validator warns on unsupported resources.
- `out`: limits conflict.
  - The schema says `maxItems 25`; the validator enforces `MAX_RESOURCES_OUT=20` as an error. Design for **≤20**.
  - Names must not contain `/` or `.`.
  - `format` must be a known formatter (warning otherwise).
  - `log:true` max: the reference doc says **5**; the 1.42 validator says `MAX_LOGGED_OUTPUTS=6`. Design for **≤5**.
- `getSummaryOutputs`: max 8 (`MAX_SUMMARY_OUTPUTS=8`).
- `template`: `[{name, displays?: [s,m,l,n,o,q]}]`. HTML files in the folder that are not listed get a warning. Every listed template is validated.
- `image`: `[{name, type: a64|alpha2bit|alpha8bit|c64|rgba4444|tsc6a}]`.
  - PNG only.
  - Max 64 colours.
  - Base name ≤**10 characters** (`MAX_IMAGE_NAME_LENGTH`).
  - Every `<img>` must be listed in the manifest.
  - No duplicates.
  - Image count conflict: the reference doc says **max 2 images per app**; the 1.42 validator allows `MAX_IMAGE_COUNT=16` **per display ID**; SuuntoPartnerTeam says the built-in images (btn-shape-top.png, hint-btn-*.png in `suuntoplus-tools/image/q`) are not counted that strictly (topic 14772).
  - `tsc6a` needs an internal "Nema" tool permission. Avoid it.
- `settings` / `variables`: see 2.4.
- `languages`: optional array. Allowed values are the 22 Editor languages plus `id` (Indonesian).
- `activities` (int array) and `localDate` exist but are not documented for store use.

### 2.2 JavaScript (main.js, ext*.js)
Source: `lib/javascript/validate.js`, `check.js`, `function.js`.
- Linted with ESLint at **ecmaVersion 5**. On the watch, `let`, `const` and `async` fail.
- `Date` is forbidden ("Date object is not supported").
- **`getUserInterface` is the only required function.** It became a validation error in 1.41.
- Function declarations at top level are allowed **only** for the event callbacks and native functions:
  - Event callbacks: `onLoad`, `evaluate`, `onLap`, `onAutoLap`, `onInterval`, `onPoolLength`, `onExerciseStart`, `onExercisePause`, `onExerciseContinue`, `onExerciseEnd`, `onActivityChange`, `getUserInterface`, `getSummaryOutputs`, `onEvent`, `onAccelerometer`, `onUnload`, and others.
  - Other helpers must be `var f = function(){}`.
  - Nested function declarations are an error.
  - Duplicate functions are an error.
- `input.x` / `output.x` must exist in the manifest.
- Undeclared globals produce warnings.
- Community-observed watch-only failures:
  - **Regex** breaks on the watch and shows up as "Maximum SuuntoPlus Apps reached" (topic 14940).
  - `output.textField` does not work on the watch; use `setText`.
  - Subscribed inputs go undefined → NaN → value, so guard them with `isFinite`.
  - Do not allocate variables in hot functions.
  - Large literal arrays in main.js can stop the app activating.

### 2.3 HTML / CSS
- One `<uiView>` root per template.
- Only the supported elements and attributes are allowed (`schema/html-data.json`):
  - `div`, `span`, `img`, `eval`, `graph`, `range`, `line`, `path`, `svg`, `object`, `uiViewSet`, `userInput`, `pushButton`, `import`, `include`, `pagination`.
  - Unsupported elements and attributes are errors.
- The character set used is verified per font. Use `sp-b-cjk` for full-charset text such as CJK.
- On hardware only basic CSS works:
  - `width`, `height`, `color`, `background-color`, `opacity`, `border` (solid, all sides), `visibility`;
  - units px and % only;
  - no `right`/`bottom`; use the `%e` calc syntax instead;
  - no image zoom (topic 14767, SuuntoPartnerTeam).
- Unknown CSS classes trigger warnings. They can be suppressed with `nextgen-ignore.json`.

### 2.4 Settings (data.json + manifest `settings`/`variables`)
- Settings work only on UI2 displays n, o and q (`supportsSettings` → NG version 3).
- `data.json` must exist if `settings` or `variables` are declared. Each `path` must exist in it. Top-level values must be strings or objects.
- Setting types:
  - `int` / `float`, with optional `min`/`max`;
  - `inputType: "slider"`, which requires `min` and `max`;
  - `string`, with optional `maxLength` in bytes;
  - `boolean`;
  - `enum`, with `values` or `valuePath`; stored as an index.
- `mandatory` marks a setting that has no meaningful default.
- A trailing `[unit]` in `shownName` is shown as the unit.
- Settings are edited in the Suunto app ("My Apps") and persist per app. The fields are single-line only.
- Community-reported bugs: apps with settings can trigger "Maximum SuuntoPlus Apps reached" after a settings sync; an enum dropdown crashed the Suunto app.

### 2.5 Localization
- HTML text uses `{{key}}` identifiers, resolved from `<lang>.json` at the project root.
- main.js, ext*.js and the manifest (name, description, etc.) are localizable too: Editor 1.12, 1.22 and 1.28.
- "Build For All Languages" builds every language.
- If a language file is missing, the build falls back to `en`, otherwise to the alphabetically first file.
- Name and description byte limits are validated per language.
- Watch languages (22): da, de, en, es, fr, it, nl, no, pt, fi, sv, zh-Hans, ja, ko, cs, pl, ru, th, tr, he, el, zh-Hant. `id` is also accepted.

### 2.6 Supported watches and displays
Source: reference doc, "Watch displays".

| Display ID | Size (px) | UI version | Watches | Status |
|---|---|---|---|---|
| s | 218 | UI1 | Suunto 3, 5, 5 Peak | **No longer maintained** |
| m | 240 | UI1 | 9 Peak | **No longer maintained** |
| l | 320×300 | UI1 | 9, 9 Baro | **No longer maintained** |
| n | 240 | UI2 | 9 Peak Pro | Supported |
| o | 280 | UI2 | Vertical | Supported |
| q | 466 | UI2 | Race, Race S, Race 2, Vertical 2, Ocean, Ocean Lite | Supported |

- The apizone page lists only 9 Peak Pro, Race, Race 2, Vertical and Vertical 2.
- Practical target: n, o and q. UI1 watches have far less memory and no settings, and the store cannot block installs on them.

### 2.7 Size and performance limits
- Official guidance:
  - Use the `displays` property on templates and images to strip assets per watch.
  - Keep file names short.
  - Use typed arrays and bitmasks to save memory.
  - Load rarely used code with `evalFile('{file_path}/extN.js')`, which avoids stack overflows at load.
  - `evaluate` runs about 1 Hz.
  - Logged outputs are written about once per second.
- **No official memory budget is published.**
- Community measurements on Race 2 and Vertical 2:
  - The JS heap is **133,120 B, shared by all enabled apps** (`JsTotMem` in the system log).
  - Disabling a single app from the in-exercise menu does not free its JS context, so repeated toggling or eviction can freeze the watch (topics 15490, 15692).
- Community canvas limits on Race S: about 24 `lineTo` per path and about 200 units per frame per canvas.
- Memory errors appear in the system events as `Zapp: releaseMemoryCb (exec. zapp)` (JS) or `(exec. ui)` (UI memory).
- For debugging, read the system events from the watch via Explorer → Suunto Watch. Add your own trace lines with `systemEvent('[tag] …')`.

---

## 3. Design and UX guidelines
Suunto has published no formal HIG. What exists is in the reference doc, tooling and forum tips.

### 3.1 Typography
Use the display-independent `sp-*` classes, because older watches lack some font sizes and render missing sizes as squares:
- data fonts: `sp-d-xxl` … `sp-d-xs`;
- title fonts: `sp-t-l/m/s`;
- body fonts: `sp-b-l/m/s`;
- full-charset font: `sp-b-cjk`;
- monospace numbers: `f-num`.

UI2 font sizes are given in px for medium and large displays, e.g. `f-d-xxxl` 85/155 px.

### 3.2 Colour and themes
- `cm-fg` (black on white) and `cm-bg` (white on black) swap automatically in the light theme. `cm-mid` is a theme-dependent grey.
- Accent classes: `sp-c-*` and `sp-bc-*` for blue, cyan, green, orange, purple, red and yellow.
- Title classes: `sp-title-bg` and `sp-title-text`.
- Use the theme classes rather than hard-coded colours so the app respects light and dark themes.

### 3.3 Layout
- Put one wrapper `<div>` under `<uiView>`.
- Center elements with `p-m` / `p-hc` and `calc(x% - 50%e)`.
- `sp-scale-display` corrects the uneven `l` display.
- Separate templates per display are allowed, using UI-specific classes.

### 3.4 Icons and images
- Icon fonts: `f-ico` / `f-ico-m` / `f-ico-l`.
- Built-in system images give a native look: `btn-shape-top.png`, `hint-btn-top.png`, `btn-shape-btm.png`, `hint-btn-bottom.png`.
- Alpha-only `a64` images can be tinted with CSS colour.
- Dither gradients to avoid banding.

### 3.5 Buttons
- Button names: up, next, down, upleft, downleft.
- The lap button works by default. Handle it with `onLap` / `onAutoLap` and do not override its input unless intended.
- A click is ≤0.6 s.
- `longPressDuration` must be >0.6 s; the default is 2 s.
- The button-lock behaviour (`type`/`longType`: normal, action, lock) should be respected.
- **AMOLED:** a click that arrives while the display is off is ignored by default. Opt in with `enabledWhileDisplayOff`, or suppress clicks during always-on with `disabledWhileAOD`. Both are aliases of `getIsEnabled`.
- **Touch** (`onTap` and related) is optional. Suunto says it drains battery and is not available on all watches; the user must enable Touch per exercise.

### 3.6 AMOLED vs MIP and low-power mode
- From general knowledge (inferred, not in the docs): display q watches are AMOLED; 9 Peak Pro (n) and Vertical (o) are MIP.
- A dedicated low-power view (`ViewMode.Lowp`, `wf-lowp-*.html`) exists **only for watch faces**. No low-power or always-on template mechanism is documented for sports apps.

### 3.7 Simulator vs hardware
The simulator is more permissive than the watch. Always test on hardware.

---

## 4. Store page requirements (as far as is known)
- **Description:** must be truthful and complete; single-line text fields. The on-watch manifest description should be short (about 22 characters recommended).
- **Images:**
  - a **banner**;
  - a **watch screen image of 466×466 px**;
  - all images must accurately represent the app and must not be unauthorized (third-party logos or brands are a risk; inferred).
- **Package:** the source package zip.
- **Contact:** a support email, by convention in the description.
- **Compatibility:** state it in the text, since the store cannot filter by watch.
- **Not found:** categories, tags, privacy policy fields, age ratings, and exact banner dimensions or text limits. These need to be checked in the signed-in console.

---

## 5. BLE device apps (`"type": "device"`)
- **Manifest:**
  - set `"type": "device"` (required since FW 2.22.32);
  - include `{"name":"con"}` in `out`;
  - set `output.con` to a non-zero value to close the system "Searching" popup.
  - The build produces a `.dev` (template `templates/New-SuuntoPlus-BLE-Sport-App`).
- **API:**
  - `appConn.connect(enabledZappId, handler, searchParam1, searchParam2?)`. Search params are byte arrays of up to 16 bytes; the first byte selects the advertising field (2–9 for service UUID lists or name, 255 for manufacturer data).
  - `appConn.regUuid` (UUIDs as little-endian byte arrays), `readChar`, `writeChar` (**max 20 bytes**, no MTU negotiation), `enaCharNotf`.
  - Event IDs: 100–112.
  - Error codes: 0–14.
  - Disconnect happens automatically on unload, and the system retries reconnection automatically.
  - Connection limits: UI2 allows 2 connections with ATT MTU 127; UI1 allows 1 connection with MTU 23.
- **The BLE device does not need to be paired with the watch first** (community manager, topic 14783).
- **Store and partner requirements:**
  - **No evidence was found of extra requirements, certification or third-party hardware agreements** for publishing device apps.
  - Community device apps are live in the store, for example oCycler (FTMS indoor bikes, published 2026-09-01) and ErgSync.
  - Not verified: whether Suunto requires permission from the hardware brand, or whether naming or logo use of third-party brands triggers rejection. The "unauthorized images" rule suggests it could.
- **Practical limits reported:**
  - A device app can only write custom FIT developer fields. It cannot feed native power, cadence or TSS (topic 15787).
  - The same device may not be usable by the watch's native sensor connection and the app at the same time.
  - Eviction under memory pressure kills the BLE link for the rest of the exercise (topic 15692).
  - The app has no internet or HTTP access through the phone (feature request, topic 15935).


## Key facts
- Submitting requires acceptance into the Suunto Partner Program; individuals are accepted and the program is free. You then submit from the SuuntoPlus Sports Apps console on your ApiZone Profile page. [apizone.suunto.com/suuntoplus; forum topics 14766, 14986]
- The upload is the Source Package zip ('SuuntoPlus: Create Source Package'), not the compiled .fea/.dev. It contains only top-level main.js, manifest.json, data.json, *.html, *.png, ext*.js and <lang>.json files; subfolders are not included. [suuntoplus-tools/lib/source-package.js; forum topic 15473]
- A submission needs the package, a well-written description and accurate images: a banner plus a watch screen image of 466x466 px. Missing, misleading or unauthorized content blocks publication, and submitting grants Suunto distribution rights. [apizone.suunto.com/suuntoplus; forum topics 15383, 15606]
- manifest version is at most 4 characters and must change on every re-upload; re-uploading the same version is rejected. An invalid modificationTime makes the ApiZone update fail. [schema/manifest.json; forum topics 14770, 15784, 15473]
- Required manifest keys are name, version, author, type, usage and modificationTime, plus description and template for sports apps; additionalProperties is false. name is limited to 60 UTF-8 bytes and description to 100 bytes, checked per language; Suunto recommends a description under about 22 characters. [schema/manifest.json; lib/project/manifest.js; lib/ng/limit.js; forum topic 14770]
- Validator limits: at most 10 'in' resources and 20 'out' (the schema says 25), 5 logged outputs per the doc (6 per the validator), 8 summary outputs, image names of at most 10 characters, PNG only with 64 colours. Image count conflicts: the doc says 2 per app, the validator allows 16 per display. [lib/ng/limit.js; reference docs]
- JavaScript must be ES5. Date is forbidden, getUserInterface is the only required function, nested functions are not allowed, and top-level function declarations are allowed only for event or native callbacks. The community reports that regex fails on the watch. [lib/javascript/validate.js, check.js, function.js; forum topic 14940]
- Supported displays are n (240, 9 Peak Pro), o (280, Vertical) and q (466: Race, Race S, Race 2, Vertical 2, Ocean, Ocean Lite). UI1 (s, m, l) is no longer maintained. The store cannot restrict installs by watch model, so state compatibility in the description. [reference docs 'Watch displays'; forum topics 14783, 15396]
- Settings work only on UI2 watches and are edited in the Suunto app. Dev builds are wiped on every phone sync and there is no hidden or beta store listing, so settings cannot be tested end-to-end before publishing. [lib/suunto-plus.js supportsSettings; forum topics 14766, 14789, 15618]
- Review time and approval criteria are undocumented. The fastest observed case was submitted 2026-06-20 and published 2026-06-21. Suunto says it does not test battery consumption. Store user reviews are emailed to the ApiZone account email. [forum topics 15396, 14783, 14836; apizone /suuntoplus]
- Updates: binaries usually go live from immediately to about 2 hours; banner and screen images update slowly or stay cached. An Aug-Sep 2026 backend bug blocked updates until about 2026-09-23. [forum topics 15383, 15784]
- Shared JS heap measured by the community at 133,120 B across all enabled apps. Disabling an app from the in-exercise menu does not free its JS context. Up to 3 apps per sport mode since FW 2.50.26; the apizone page still says 2. [forum topics 15490, 15692; apizone /suuntoplus-sports-apps]
- Device apps: type 'device' builds a .dev and needs a 'con' output that closes the Searching popup. BLE writes are at most 20 bytes; UI2 allows 2 connections with MTU 127. No evidence of extra store requirements; community FTMS and ErgSync device apps are live. [reference docs 'BLE Device Connection'; forum topics 15787, 14836]
- Design: use the display-independent sp-* font classes and the theme classes cm-fg/cm-bg/cm-mid (they flip in the light theme). On AMOLED, button clicks while the display is off are ignored unless the button has enabledWhileDisplayOff; disabledWhileAOD suppresses them. A low-power (lowp) view exists only for watch faces. [reference docs CSS/pushButton; templates/*Watch-Face*/wf-lowp-*.html]
- Watch faces are not open to community store submission yet; only sports apps are. [forum topic 14789]

## Open questions
- Terms of the SuuntoPlus Developer License Agreement ('Part II', referenced in LICENSE.txt and accepted at submission): IP, liability, takedown, monetisation and branding rules. It was not found publicly and must be read in the signed-in ApiZone console.
- Exact fields in the signed-in SuuntoPlus Sports Apps console: text length limits, whether there are categories or tags, banner image dimensions and format, and the number of screenshots. Only the 466x466 screen image is attested.
- Formal review criteria and SLA; whether rejections come with written reasons; whether image changes are re-reviewed or only cached.
- Whether BLE device apps for third-party branded hardware need the hardware maker's permission, or face any extra review. No evidence was found either way; community FTMS and ErgSync device apps are live.
- Whether Suunto builds per-language binaries from the uploaded <lang>.json files, and how a localized manifest name or description appears in the store listing.
- The real per-app memory budget on each watch. Suunto publishes none; 133,120 B shared heap is a community measurement on Race 2 and Vertical 2.
- Which conflicting limits the firmware actually enforces: 2 vs 16 images, 5 vs 6 logged outputs, 20 vs 25 outputs, 2 vs 3 apps per sport mode. Needs hardware testing.
- Whether apps installed from the store on UI1 watches (Suunto 9, 9 Baro, 5, 3) are hidden or simply fail. The store has no filter, and UI1 is 'no longer maintained'.
- What the pre-q.c64.png (272x272) in the New-SuuntoPlus-Sport-App template is for. It is not referenced by the template manifest but would be included in the source package because all top-level *.png files are; possibly a selection-list preview (unverified).
- How the store app ID (e.g. zzpara01 vs climbl01) is assigned, and whether the manifest authorId/externalId should be set by the developer or left empty.

## Sources
- https://apizone.suunto.com/suuntoplus — Official SuuntoPlus development flow: join the Partner Program, develop, submit via the ApiZone Profile page, Suunto reviews and publishes, feedback by email. Lists what a submission contains and states the distribution-rights grant.
- https://apizone.suunto.com/suuntoplus-sports-apps — What sports apps are: up to 2 apps per sport mode (contradicted by FW 2.50.26), settings in the Suunto app 'My Apps', FIT developer fields, supported watches.
- https://apizone.suunto.com/suuntoplusEditor — Editor documentation; 'Create Source Package' is for submitting the app to Suunto; .fea vs .dev.
- https://apizone.suunto.com/faq — Partner-program FAQ, mostly about the Cloud API: acceptance within two weeks, partners@suunto.com, no charge for API use.
- https://apizone.suunto.com/ — ApiZone landing page: weekly review of applications, maximum two-week wait (Cloud API).
- https://apizone.suunto.com/fit-developer-fields-decoding-example-code — How SuuntoPlus outputs appear in FIT developer fields; app ID zztrph01; owner_id and external_id metadata.
- https://apizone.suunto.com/sitemap.xml — Shows the /suuntoplus-sports-apps-console page, which is only reachable when signed in.
- https://www.suunto.com/sports/News-Articles-container-page/open-suuntoplus-built-by-the-community.-powered-by-suunto — Suunto article of 2026-03-11 announcing community SuuntoPlus apps: Partner Program review, free tools, updates over time.
- https://www.suunto.com/welcomepartners — Partner Program landing page with the application form link.
- https://survey.alchemer.eu/s3/90553908/PARTNER-Become-a-Suunto-Partner — Partner application form (fields could not be rendered).
- https://forum.suunto.com/topic/14651 — Community manager's 'How to get started!': build, Create Source Package, submit via API Zone, review, publish.
- https://forum.suunto.com/topic/14770 — Examples explained (SuuntoPartnerTeam): description under about 22 characters; version must change when re-uploading to ApiZone.
- https://forum.suunto.com/topic/14766 — Share your projects: link works for individuals, no hidden or beta store listings, approval anecdotes, store fields are single-line.
- https://forum.suunto.com/topic/14783 — No stupid questions: battery not tested at review, crash handling, no device-restriction mechanism, BLE device needs no pairing, touch guidance.
- https://forum.suunto.com/topic/14767 — Simulator vs watch discrepancies (SuuntoPartnerTeam): supported CSS subset, setText, screenshot tool not required for store images.
- https://forum.suunto.com/topic/14986 — Partner approval wait times: about 7 days for one developer, longer with no feedback for others.
- https://forum.suunto.com/topic/15784 — Update propagation bug Aug-Sep 2026; duplicate-version rejection; checking the served version via the console's 'Sports app file' link.
- https://forum.suunto.com/topic/15383 — Update latency; screen image 466x466; image updates not refreshing.
- https://forum.suunto.com/topic/15606 — Submission form field 'Sports app - screen image'; image changes not appearing.
- https://forum.suunto.com/topic/15473 — Uploading a source-package zip; a bad modificationTime causes the update error.
- https://forum.suunto.com/topic/15396 — HR-ZoneTracker submitted 2026-06-20, published 2026-06-21; the store cannot restrict by display.
- https://forum.suunto.com/topic/14836 — Store reviews delivered to developers by email.
- https://forum.suunto.com/topic/14789 — Partnership is needed only for store upload; sync wipes non-store apps; watch faces not open at launch.
- https://forum.suunto.com/topic/14897 — Dev builds deleted on sync; motivation to publish.
- https://forum.suunto.com/topic/15618 — No way to test settings end-to-end before publishing.
- https://forum.suunto.com/topic/14940 — 'Maximum SuuntoPlus Apps reached' caused by regex, large literals and settings sync.
- https://forum.suunto.com/topic/15692 — Device app eviction; shared 133,120 B JS heap; 3 apps per sport mode since FW 2.50.26.
- https://forum.suunto.com/topic/15490 — Vertical 2 heap leak when toggling apps; JsTotMem 133120; app ID examples.
- https://forum.suunto.com/topic/15279 — Canvas render limits on Race S (community).
- https://forum.suunto.com/topic/14772 — Built-in system images, dithering, image limits (SuuntoPartnerTeam).
- https://forum.suunto.com/topic/14734 — CSS layout tips: wrapper div, %e syntax (SuuntoPartnerTeam).
- https://forum.suunto.com/topic/15787 — oCycler FTMS BLE device app published in the store; FIT developer fields only; support email in the description.
- https://forum.suunto.com/topic/15217 — Bosch eBike BLE device app (open source) via an ESP32 bridge.
- https://forum.suunto.com/topic/15661 — Gustin publication; compatibility stated in the text (UI2 watches).
- https://forum.suunto.com/topic/13251 — Pre-2026 understanding that only companies could partner.
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/schema/manifest.json — Manifest JSON schema: required fields, lengths, enums, maxItems.
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/project/manifest.js — validateManifest: byte-length checks per language, modificationTime, in/out limits, image validation.
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/project/validate.js — validateProject: HTML templates, settings and data.json checks, image rules.
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/ng/limit.js — Hard limits: IN 10, OUT 20, logged 6, summary 8, version 4, name 60, description 100, images 16, image name 10.
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/source-package.js — createSourcePackage: the exact list of files included in the submission zip.
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/javascript/validate.js — ESLint at ES5, Date forbidden, required getUserInterface, function declaration rules.
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/CHANGELOG.md — Editor history: manifest localization (1.22), source package (1.18/1.22), getUserInterface required (1.41).
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/LICENSE.txt — Editor license; refers to a separate Developer License Agreement ('Part II') for submissions that is not included in the file.
- PROJECTS/SUUNTOPO/reference/suuntoplus_reference_docs.md — Reference doc: watch displays, manifest fields, settings, localization, BLE device API, optimisation, errors, CSS classes, buttons and AOD attributes.
