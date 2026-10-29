# Partial Lead Capture + /start Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every visitor who types a phone or email into an Atlas form becomes a GHL contact at once; /book and the new /start ad page capture the lead first and then book through a native time picker on the GHL calendar.

**Architecture:** A thin GHL client (`server/ghl.mjs`) is used by three Express routes (`/api/leads`, `/api/slots`, `/api/book`) plus a completion hook on the existing `/api/inquiries`. The React side gets one capture hook, one shared lead form, one time picker, and a new `/start` route. GHL routing (round-robin, notifications, smart list) is configured by hand in the sub-account and verified from its execution logs.

**Tech Stack:** Node 22 ESM, Express 5, `node --test`, React 19 + Vite + react-router 7, GHL REST API v2 (`services.leadconnectorhq.com`, header `Version: 2021-07-28`), Render.

**Spec:** `docs/superpowers/specs/2026-10-29-partial-lead-capture-design.md`

## Global Constraints

- Never block, slow, or error the visitor's form because GHL failed; capture is best-effort from the browser's side.
- `GHL_PIT_TOKEN` is read from env on the server only; it never appears in client code, logs, tests, or git.
- Every GHL failure is logged with `console.error` including HTTP status and response body; every 429 from our limiter is logged with `console.warn('leads: rate-limited', ip)`.
- No automated SMS to anyone without `sms-consent-yes`; /book and /start forms carry no SMS consent box (tag `sms-consent-no`).
- Copy rules: "Benefits Coordinator", never "agent"; no "family-run", no "serving Michigan"; headlines have no terminal period; the registered A2P checkbox sentence in `InquiryForm` stays word for word.
- `tests/a2p-compliance.test.mjs` (21 tests) and `tests/inquiries.test.mjs` must pass unchanged. Run tests as `node --test tests/*.test.mjs` (a bare `node --test tests/` false-fails on this repo).
- GHL requests send a browser-like `User-Agent` (Cloudflare 1010 otherwise).
- Upsert requires valid email or valid US 10-digit phone; name-only input is never sent.
- Deploy is `git push fork main`; Render builds from the fork. Commit after each task; never `--no-verify`.
- Plan slugs: `final-expense`, `income-replacement`, `mortgage-protection`, `whole-life`, `iul`. Purpose slugs: `final-expense`, `income-replacement`, `mortgage-protection`, `other`.

## Review Focus

1. A visitor types `313-676-2298` then edits it to `313-676-229` and leaves: the server must not upsert the broken number; the last valid phone stays on the contact. (Task 2 test `partial with invalid phone and no email is skipped`.)
2. The same person submits the inquiry form twice in a minute: the second completion must not re-add `partial-lead` or create a second contact. (Task 3 test `completion never adds partial-lead`.)
3. Slot chosen, then taken by someone else before `POST /api/book`: GHL answers 4xx; the visitor must see "that time just went" and a refreshed list, never a success. (Task 4 test `book returns slot-taken on GHL 4xx`.)
4. Render's proxy: with `trust proxy` off every visitor shares one rate bucket; the deploy checklist proves `req.ip` is the caller's IP from the live process. (Task 3 boot log + Task 10 verification.)
5. `/start?utm_campaign=<script>` or a 2 kB `plan` value: tags are slugified to `[a-z0-9-]{1,40}` and everything else dropped. (Task 2 test `utm and plan values are slugified and bounded`.)

---

### Task 1: GHL client

**Files:**
- Create: `server/ghl.mjs`
- Test: `tests/ghl.test.mjs`

**Interfaces:**
- Produces: `makeGhlClient({token, locationId, fetch = globalThis.fetch}) -> client` with
  - `client.upsertContact({firstName, lastName, email, phone, tags, source, dateOfBirth}) -> Promise<{id:string, isNew:boolean}>` (POST `/contacts/upsert`; phone sent as `+1` + 10 digits; `isNew` from the response's `new` field)
  - `client.addTags(contactId, tags:string[]) -> Promise<void>` (POST `/contacts/{id}/tags`)
  - `client.removeTags(contactId, tags:string[]) -> Promise<void>` (DELETE `/contacts/{id}/tags`)
  - `client.freeSlots({calendarId, startMs, endMs, timezone}) -> Promise<Record<string, string[]>>` (GET `/calendars/{id}/free-slots`, returns `{ 'YYYY-MM-DD': [iso...] }`, drops `traceId`)
  - `client.createAppointment({calendarId, contactId, startTime, title}) -> Promise<{id:string}>` (POST `/calendars/events/appointments`)
  - `class GhlError extends Error { status:number; body:string }` thrown on any non-2xx.
- Every request carries headers `Authorization: Bearer <token>`, `Version: 2021-07-28`, `Accept: application/json`, `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AtlasSite/1.0`.

- [ ] **Step 1: Write the failing tests** in `tests/ghl.test.mjs` with an injected `fetch` that records `(url, init)` and returns a canned `Response`:
  - `upsertContact sends locationId, +1 phone, tags and the three headers` (assert `init.headers.Version === '2021-07-28'`, body `phone === '+13136762298'`, `locationId === 'loc1'`)
  - `upsertContact returns id and isNew from the response` (`{contact:{id:'c1'}, new:true}` → `{id:'c1', isNew:true}`)
  - `removeTags uses DELETE on /contacts/c1/tags`
  - `freeSlots strips traceId and keeps dates`
  - `non-2xx throws GhlError with status and body` (`assert.rejects(..., e => e.status === 502 && e.body.includes('bad'))`)
- [ ] **Step 2: Run** `node --test tests/ghl.test.mjs` → FAIL (module not found)
- [ ] **Step 3: Implement `server/ghl.mjs`** exporting `makeGhlClient` and `GhlError`; one private `request(method, path, body)` builds headers and throws `GhlError`.
- [ ] **Step 4: Run** `node --test tests/ghl.test.mjs` → PASS (5 tests)
- [ ] **Step 5: Commit** `feat(server): GHL client with injected fetch`

### Task 2: Lead validation and tagging

**Files:**
- Create: `server/leads.mjs`
- Modify: `server/inquiries.mjs` (export `normalisePhone`, add `export const emailRe`)
- Create: `shared/slug.mjs` (`slugify(s) -> string` lowercases, maps runs of non `[a-z0-9]` to `-`, trims `-`, caps at 40 chars, returns `''` for empty)
- Test: `tests/leads.test.mjs`

**Interfaces:**
- Consumes: `normalisePhone`, `services` from `server/inquiries.mjs`; `slugify` from `shared/slug.mjs`.
- Produces:
  - `validateLead(input) -> {value} | {error:string} | {skipped:'no-contact-info'}` where `value = {stage, firstName, lastName, email, phone, service, plan, purpose, state, veteran, policyHolder, dateOfBirth, page, consent, smsConsent, utm:{source,campaign,content}}`; `stage ∈ 'partial'|'book'|'reachout'`; `page ∈ '/'|'/insurance'|'/contact'|'/book'|'/start'`; `plan` must be one of the five slugs or `''`; `purpose` one of the four or `''`; `state` two letters or `''`; `dateOfBirth` `YYYY-MM-DD` or `''`; honeypot `website` non-empty → `{error:'rejected'}`.
  - `leadTags(value) -> string[]`: always `partial-lead`, `src-<page-slug>` (`src-home-form`, `src-insurance-form`, `src-contact-form`, `src-book`, `src-start`), plus `service-<slug>`, `plan-<slug>`, `purpose-<slug>`, `state-<xx>`, `veteran-yes|no`, `policy-yes|no` when present, `sms-consent-yes` iff `smsConsent && phone` else `sms-consent-no`, `reached-calendar` when `stage==='book'`, `reachout` when `stage==='reachout'`, `src-meta` + `campaign-<slug>` + `ad-<slug>` when `utm.source==='meta'`/campaign/content present.
  - `oppositeConsentTag(tags) -> string` (`sms-consent-no` ↔ `sms-consent-yes`).
  - `captureMode(env) -> 'ghl'|'off'` (`'ghl'` iff `GHL_PIT_TOKEN` and `GHL_LOCATION_ID` both set).

- [ ] **Step 1: Write the failing tests** in `tests/leads.test.mjs`:
  - `honeypot rejects`, `unknown page rejects`, `unknown stage rejects`
  - `partial with invalid phone and no email is skipped` (`{phone:'31367622', page:'/insurance', stage:'partial'}` → `skipped`)
  - `name only is skipped`
  - `phone normalises and splits name` (`'Abdallah Hage'` → `firstName:'Abdallah', lastName:'Hage'`; `'(313) 676-2298'` → `'3136762298'`)
  - `tags for insurance partial with sms consent` → contains `partial-lead`, `src-insurance-form`, `service-insurance`, `sms-consent-yes`
  - `sms consent without phone is sms-consent-no`
  - `book stage adds reached-calendar`, `reachout stage adds reachout`
  - `utm and plan values are slugified and bounded` (`plan:'<script>'` → error; `utm.campaign:'A'.repeat(200)` → `campaign-` + 40 chars)
  - `captureMode off when either env var missing`
- [ ] **Step 2: Run** `node --test tests/leads.test.mjs` → FAIL
- [ ] **Step 3: Implement** `shared/slug.mjs`, the `normalisePhone`/`emailRe` exports, and `server/leads.mjs` per the interfaces.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` → all PASS (a2p 21, inquiries unchanged, ghl 5, leads 12)
- [ ] **Step 5: Commit** `feat(server): lead validation and tag derivation`

### Task 3: `/api/leads`, config, trust proxy, inquiry completion hook

**Files:**
- Modify: `server.mjs` (imports at lines 8–12, config at line 24, inquiries handler lines 25–43, add route before the `/api` 404 at line 45)
- Modify: `server/leads.mjs` (add handler factory)
- Modify: `server/inquiries.mjs` (add `completeInquiry`)
- Modify: `.env.example` (add `GHL_PIT_TOKEN=`, `GHL_LOCATION_ID=`), `README.md` (one paragraph under the SMTP section: what capture does, the two vars, `captureMode`)
- Test: `tests/leads.test.mjs` (handler tests), `tests/inquiries.test.mjs` (completion tests; append only)

**Interfaces:**
- Consumes: Task 1 client, Task 2 validation.
- Produces:
  - `makeLeadHandler({ghl, allow, mode, log = console}) -> (req, res) => Promise<void>`; `allow` is `makeLimiter({max:30, windowMs:15*60*1000})`. Behaviour: honeypot → 400; limiter → 429 + `log.warn`; `mode==='off'` → 503 `{error:'lead capture not configured'}`; `mode==='preview'` → 202 `{preview:true}` + `log.info(payload)`; skipped → 202 `{skipped}`; success → 201 `{ok:true, contactId}`; `GhlError` → 502 `{ok:false}` + `log.error('GHL upsert failed', status, body)`. After a successful upsert it calls `ghl.removeTags(id, [oppositeConsentTag(tags)])` (latest-wins).
  - `completeInquiry({ghl, value, log}) -> Promise<void>`: upsert with tags `inquiry-complete`, `src-<page>`, `service-<slug>`, consent tags; then `removeTags(id, ['partial-lead'])`; any error is logged, never thrown.
  - `/api/config` adds `captureMode: 'ghl'|'off'`.
  - `app.set('trust proxy', 1)` before any route; boot log line `Atlas lead capture: ghl` or `Atlas lead capture: OFF (set GHL_PIT_TOKEN and GHL_LOCATION_ID)`.
  - `POST /api/inquiries` body gains optional `page` (same enum) so completion can tag the source; absent → `/contact`.

- [ ] **Step 1: Write failing handler tests** (fake `ghl` object, fake `res` with `status().json()`): `503 when mode off`, `202 preview never calls ghl`, `201 with contactId and removes opposite consent tag`, `502 and log.error on GhlError`, `429 logs warn`.
- [ ] **Step 2: Write failing completion tests** in `tests/inquiries.test.mjs`: `completion never adds partial-lead` (assert upsert tags exclude it and `removeTags` called with `['partial-lead']`), `completion swallows and logs GhlError`.
- [ ] **Step 3: Run** `node --test tests/*.test.mjs` → new tests FAIL
- [ ] **Step 4: Implement** the handler factory, `completeInquiry`, and the `server.mjs` wiring (mode = `process.env.NODE_ENV!=='production' && captureMode(env)==='off' ? 'preview' : captureMode(env)`; `completeInquiry` is awaited only after `transport.sendMail` resolved).
- [ ] **Step 5: Run** `node --test tests/*.test.mjs` → all PASS; `npm run build` → OK
- [ ] **Step 6: Manual check** `NODE_ENV=development node server.mjs` then `curl -s -X POST localhost:5173/api/leads -H 'content-type: application/json' -d '{"stage":"partial","page":"/insurance","phone":"3135550100"}'` → `{"preview":true}` and the payload in the server log.
- [ ] **Step 7: Commit** `feat(api): /api/leads capture endpoint, captureMode, trust proxy, inquiry completion`

### Task 4: Slots and booking endpoints

**Files:**
- Create: `server/booking.mjs`
- Modify: `server.mjs` (two routes before the `/api` 404)
- Test: `tests/booking.test.mjs`

**Interfaces:**
- Consumes: Task 1 `freeSlots`, `createAppointment`.
- Produces:
  - `makeSlotsHandler({ghl, calendarId, now = Date.now, ttlMs = 60_000}) -> (req, res)`: GET; window `[now, now + 3 days]`, timezone `America/Detroit`; response `{days:[{date:'YYYY-MM-DD', slots:[iso]}]}` sorted; cached per process for `ttlMs`; GHL failure → 502 `{error:'slots-unavailable'}` + `console.error`.
  - `makeBookHandler({ghl, calendarId, slots}) -> (req, res)`: POST `{contactId, startTime}`; `contactId` must match `/^[A-Za-z0-9]{10,40}$/`; `startTime` must be present in the slots cache (refresh once if the cache is stale) else 409 `{error:'slot-taken'}`; GHL 4xx → 409 `{error:'slot-taken'}`; GHL 5xx → 502 `{error:'booking-failed'}`; success → 201 `{ok:true, appointmentId}` and the cache entry for that slot is dropped. Rate limit 10 per 15 minutes per IP via `makeLimiter`.
  - Routes: `GET /api/slots`, `POST /api/book`. `calendarId` = `process.env.GHL_CALENDAR_ID || '3ZhO43EjFGe3gF5wvfdd'`.

- [ ] **Step 1: Write failing tests**: `slots returns sorted days and caches for ttl` (fake ghl called once across two requests), `slots 502 on GhlError`, `book rejects unknown contactId shape`, `book 409 when startTime not in free list`, `book returns slot-taken on GHL 4xx`, `book 201 drops the slot from cache`.
- [ ] **Step 2: Run** `node --test tests/booking.test.mjs` → FAIL
- [ ] **Step 3: Implement** `server/booking.mjs` and wire routes (title `'{{contact.name}}'`, `locationId` from env).
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` → all PASS
- [ ] **Step 5: Commit** `feat(api): native booking endpoints on the Atlas calendar`

### Task 5: Shared lead payload helpers (client-side logic, node-tested)

**Files:**
- Create: `shared/leadPayload.mjs`
- Test: `tests/leadPayload.test.mjs`

**Interfaces:**
- Produces:
  - `buildLeadPayload(fields, ctx) -> object|null`: `fields` = raw form values (`name, email, phone, service, plan, purpose, state, dob, veteran, policyHolder, consent, smsConsent`), `ctx = {page, stage, utm}`; returns `null` unless `phone` has 10 digits (after stripping) or `email` matches `emailRe`; otherwise the JSON body for `/api/leads`.
  - `fingerprint(payload) -> string` (stable JSON of the payload's own keys, sorted).
  - `readUtm(search:string) -> {source, campaign, content, plan}` from `utm_source`, `utm_campaign`, `utm_content`, `plan`.
- [ ] **Step 1: Write failing tests**: `null until phone or email is valid`, `payload carries ctx and consent flags`, `fingerprint equal for same payload, differs on consent flip`, `readUtm parses and ignores unknown keys`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `node --test tests/*.test.mjs` → PASS. **Step 5: Commit** `feat(shared): lead payload builder`

### Task 6: `useLeadCapture` hook and the inquiry form

**Files:**
- Create: `src/leadCapture.ts`
- Modify: `src/components.tsx` lines 78–110 (`ContactSection`)
- Modify: `src/App.tsx` where `ContactSection` is rendered (Home line 61, insurance line 163, contact line 178) to pass `page`

**Interfaces:**
- Consumes: Task 5 helpers (Vite imports `.mjs` directly).
- Produces: `useLeadCapture({page, stage}) -> {capture:(fields)=>void, flushNow:(fields)=>Promise<{contactId?:string}>, cancel:()=>void, contactId:string|null}`. `capture` debounces 2 s, skips when `buildLeadPayload` is `null` or the fingerprint equals the last sent, posts with `fetch('/api/leads', {method:'POST', keepalive:true, ...})`, swallows every error. `flushNow` posts immediately (used on submit of /book and /start). `cancel` clears the timer.
- `ContactSection` gains prop `page: '/'|'/insurance'|'/contact'`; calls `capture` on `blur` of `phone` and `email` and on `change` of `name, phone, email, service, consent, smsConsent`; calls `cancel()` at the top of `submit`; sends `page` in the `/api/inquiries` body. The `smsConsent` label block moves above the phone field; the phone helper reads "Optional. Tick the box above if texting is OK." The A2P sentence is untouched.

- [ ] **Step 1: Run** `node --test tests/a2p-compliance.test.mjs` → PASS (baseline, 21)
- [ ] **Step 2: Implement** `src/leadCapture.ts` and the form changes.
- [ ] **Step 3: Run** `node --test tests/*.test.mjs` → a2p still 21/21 (the checkbox regexes still match); `npm run build` → OK
- [ ] **Step 4: Manual check** `node server.mjs`, open `/insurance#ask`, type a phone, tab out → server log shows the preview payload with `page:'/insurance'`; type the same again → no second log line.
- [ ] **Step 5: Commit** `feat(site): progressive lead capture on the inquiry form`

### Task 7: Lead form + native time picker on /book

**Files:**
- Create: `src/LeadForm.tsx`, `src/TimePicker.tsx`
- Modify: `src/App.tsx` `BookPage` (lines 294–302), remove the `form_embed.js` effect and the iframe
- Modify: `src/styles.css` line 29–30 (`.book-frame` keeps; add `.lead-form`, `.time-picker`, `.time-day`, `.time-slot`, `.time-slot.is-on`, `.book-done`)

**Interfaces:**
- Consumes: Task 6 hook; `/api/slots`, `/api/book` from Task 4.
- Produces:
  - `<LeadForm variant="book"|"start" page stage onCaptured={(contactId, fields)=>void} />`: variant `book` = first name, last name, mobile, email, general consent; variant `start` = name, date of birth, state, mobile, email (optional), veteran, current policy holder, purpose (4), general consent. Submit button copy: `book` "Show available times"; `start` "Have a Coordinator reach out". On submit: `flushNow(fields)`; on success or failure call `onCaptured` (contactId may be null; never block). Values persist in `sessionStorage` key `atlas-lead`.
  - `<TimePicker contactId onBooked={(appointmentId, startTime)=>void} />`: loads `/api/slots`, day tabs + 3-column grid, "Book my call for h:mm a"; on 409 shows "That time just went. Pick another." and reloads slots; without `contactId` the Book button reads "We couldn't save your details, call (313) 513-0268" and is disabled.
  - `BookPage`: step 1 `LeadForm variant="book"`, step 2 `TimePicker`, done state with the thank-you copy from the spec (`A licensed Atlas Benefits Coordinator will call you ... (313) 513-0268`). `?plan=` read with `useSearchParams` and sent as `plan`.
- [ ] **Step 1: Implement** the two components and the page; mobile: single column, 48 px targets, no horizontal scroll.
- [ ] **Step 2: Run** `npm run build` → OK; `node --test tests/*.test.mjs` → PASS
- [ ] **Step 3: Manual check** in dev: `/book?plan=whole-life` → fill form → preview log shows `stage:'book', plan:'whole-life'` → picker renders slots from `/api/slots` (dev needs the two GHL env vars in `.env` to show real slots; otherwise the 503 state must render the phone number, not a blank).
- [ ] **Step 4: Commit** `feat(site): /book two-step with native time picker`

### Task 8: `/start` ad landing page

**Files:**
- Create: `src/StartPage.tsx`
- Modify: `src/App.tsx` routes (line 193), `pageTitles` (line 7: `'/start':'Atlas Insurance'`)
- Modify: `scripts/prerender.mjs:8` and `server.mjs` routes array (add `'/start'`)
- Modify: `src/styles.css` (`.start-hero` reuses `.ins-hero`, `.ins-hero-film`, `.ins-hero-veil`; `.start-card`)
- Modify: `index.html` only if the Meta pixel snippet is absent (check first; pixel id `1509881880899534`)

**Interfaces:**
- Consumes: `LeadForm variant="start"`, `TimePicker`, `readUtm`.
- Produces: `/start` = header (logo, phone), hero (film + veil on desktop, navy band on phone) with the spec's headline "Coverage tied to your circumstances, not a one-size policy" and the carrier line; `LeadForm` in the hero; after capture a card "Thanks, {first name}. A Coordinator will reach out" with the picker and "I'll wait for the Coordinator's call" (posts `flushNow` with stage `reachout` plus tag via field `wantsCallback:true` → server adds `wants-callback`; add that field to Task 2's `validateLead` and `leadTags`). Under the hero bullets on desktop: two seals (Independent agency · Top 100 A+ rated carriers; No medical exam · options with a few simple questions) and the carrier strip labelled "Appointed with the top 100 A+ rated carriers, including" using the `carriers` array from `src/App.tsx` plus a "+ 90 more" tile, all behind `SHOW_CARRIERS`. No licence number or NPN anywhere. Then the footer. **No other sections on desktop or phone.** Mockups: https://claude.ai/artifact/THbYXKSKihcsAyjDcYkYSE `window.fbq?.('track','Lead')` after a 201 from `/api/leads`, `window.fbq?.('track','Schedule')` after a 201 from `/api/book`.
- [ ] **Step 1: Add** `wantsCallback` to `validateLead`/`leadTags` with a test `wantsCallback adds wants-callback` → run → PASS.
- [ ] **Step 2: Implement** `StartPage` and the route/prerender entries.
- [ ] **Step 3: Run** `npm run build` → `dist/start/index.html` exists; `node --test tests/*.test.mjs` → PASS
- [ ] **Step 4: Manual check** `/start?utm_source=meta&utm_campaign=fe-oct&utm_content=v17&plan=final-expense` → preview log shows tags `src-meta`, `campaign-fe-oct`, `ad-v17`, `plan-final-expense`, `purpose-final-expense`; phone width shows header, headline, one line, form, footer only.
- [ ] **Step 5: Commit** `feat(site): /start ad landing page`

### Task 9: Plan slugs on the /insurance plan cards

**Files:**
- Modify: `src/App.tsx` `PlanBody` (line 82) and the plans array (lines 66–75: add `slug` per plan)
- [ ] **Step 1: Implement** `to={`/book?plan=${p.slug}`}` with the five slugs from Global Constraints.
- [ ] **Step 2: Run** `npm run build` → OK. **Step 3: Commit** `feat(site): plan cards carry the plan slug to /book`

### Task 10: Deploy, env, smoke test

**Files:**
- Create: `scripts/smoke-leads.mjs` (reads `SITE_ORIGIN`, `GHL_PIT_TOKEN`, `GHL_LOCATION_ID` from env; POSTs `{stage:'partial', page:'/insurance', name:'Smoke Test', phone:'3135550199', smsConsent:false}` to `${SITE_ORIGIN}/api/leads`; GETs `/contacts/?locationId&query=3135550199`; asserts tags include `partial-lead`, `src-insurance-form`, `sms-consent-no` and exclude `sms-consent-yes`; DELETEs the contact; exits non-zero on any mismatch)
- [ ] **Step 1: Set Render env** `GHL_PIT_TOKEN` (from the credentials notepad) and `GHL_LOCATION_ID=cS6OcK9m4UqGvMydqAsv` on service `srv-dbd8ppjrjlhs73cdf3sg` (Render dashboard → Environment → Edit; "Save, rebuild, and deploy").
- [ ] **Step 2: Push** `git push fork main`; wait for Render "Live".
- [ ] **Step 3: Verify from the live process** `curl -s https://atlasgroupmi.com/api/config` → contains `"captureMode":"ghl"`; Render logs contain `Atlas lead capture: ghl`.
- [ ] **Step 4: Verify trust proxy** Render logs for one `leads: rate-limited` line must show a public IP, not `10.x`: trigger by sending 31 partial posts from one shell loop, then confirm the logged IP equals `curl -s https://api.ipify.org`.
- [ ] **Step 5: Run** `SITE_ORIGIN=https://atlasgroupmi.com node scripts/smoke-leads.mjs` → `OK` and exit 0.
- [ ] **Step 6: Live booking test** on `/start`: real contact Abdallah Hage, pick a slot → GHL calendar shows the appointment, "Atlas Call Reminders" execution log shows Add to workflow + SMS + Email within a minute; then cancel the appointment via API and remove the enrollment, as done 10-29.
- [ ] **Step 7: Commit** `chore: lead capture smoke test` (the script only; no env values).

### Task 11: GHL routing (manual, in the Atlas Group sub-account)

- [ ] **Step 1: Workflow "Partial lead intake"** (Automation → Create workflow): trigger *Contact Tag* added, tag `partial-lead`; If/Else "Assigned user is empty" → yes: *Assign to user* round-robin, users: Abe Hage (add Adam, Moe when seated); then If/Else on tag `service-insurance` OR no `service-*` tag → yes: *Internal notification* to Assigned user, in-app + SMS, body `New partial lead: {{contact.name}} {{contact.phone}} {{contact.email}} · page {{contact.tags}}`; no: notification to Abe only; *Wait* 30 days; If/Else tag `partial-lead` still present AND no appointment → *Add tag* `lead-cold`. Settings: Allow re-entry ON, Stop on response OFF. Publish.
- [ ] **Step 2: Workflow "Partial lead cleared"**: triggers *Contact Tag* added `inquiry-complete` OR *Appointment status* confirmed, calendar Your Atlas Call → *Remove tag* `partial-lead` → *Remove from workflow* "Partial lead intake". Publish.
- [ ] **Step 3: Smart list "Partial leads"**: Contacts → filter tag `partial-lead` → sort Date added desc → save.
- [ ] **Step 4: Verify** with the Task 10 smoke contact before deleting it: Enrollment history of "Partial lead intake" shows the contact, assigned user Abe, notification Executed; after an `inquiry-complete` tag is added by hand, "Partial lead cleared" shows Remove tag Executed and the smart list no longer lists it.
- [ ] **Step 5: Record** the two workflow ids and the smart list name in `C:\Users\hagea\Atlas\ATLAS-CREDENTIALS-AND-IDS.txt` and in memory.

### Task 12: Pre-ship review

- [ ] **Step 1:** `pr-review-toolkit:silent-failure-hunter` over `server/*.mjs`, `src/leadCapture.ts`, `src/TimePicker.tsx` (every swallowed error must be logged; the only intentional swallow is the browser-side capture).
- [ ] **Step 2:** `pr-review-toolkit:code-reviewer` over the diff since `da5b679`.
- [ ] **Step 3:** `security-scanning:security-auditor` on `server/ghl.mjs`, `server/leads.mjs`, `server/booking.mjs` (token handling, input bounds, tag injection, rate limits).
- [ ] **Step 4:** Fix findings, re-run `node --test tests/*.test.mjs`, commit, push, re-run Task 10 steps 3 and 5.
