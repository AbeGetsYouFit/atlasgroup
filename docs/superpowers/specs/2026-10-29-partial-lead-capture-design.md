# Partial lead capture — design

Date: 2026-10-29. Owner: Abe Hage. Repo: AbeGetsYouFit/atlasgroup (deploys to https://atlasgroupmi.com on Render).

## Intent

Today a visitor who types a phone number into the question form on /insurance and leaves, or who opens /book and
never finishes the calendar, is gone. Nothing is recorded anywhere. Abe wants those people **collected as leads in
GoHighLevel (GHL) the moment they type contact information**, assigned round-robin to the Atlas team, and called
back by a Benefits Coordinator (later: by Grace, the Retell voice agent). This is the feeder for the
"interested, never booked" nurture (Sequence B), which is a separate, later build.

Abe's words: "those people simply become leads to be collected, lets start there, maybe have it either the
coordinator calls or grace herself with knowledge and context on how this system works" and "this lead collection
will be distributed evenly among me adam and moe".

## Goals

1. A visitor who enters a valid phone number **or** email on the /insurance question form becomes a GHL contact
   within seconds, tagged as a partial lead, even if they never submit.
2. A visitor who reaches the calendar on /book has already given name + phone (+ email) on an Atlas-owned form and
   exists in GHL before the calendar is shown.
3. Every new partial lead is assigned round-robin to a GHL user and that user is notified in GHL.
4. Completing the form or booking a call clears the partial state automatically.
5. Nothing automated is ever texted to a person who did not tick the SMS consent box.

## Non-goals

- The nurture sequences themselves (Sequence A no-show, Sequence B never-booked). Designed separately; this build
  only produces the tags they will filter on.
- Grace calling partial leads out. Phase two. Needs Retell outbound + a second Grace script, designed with Abe.
- Capturing what is typed inside GHL's booking iframe (cross-origin, impossible). Solved by the pre-calendar step.
- Meta lead-form integration (no ads yet).

## Anti-goals (failure even if it "works")

- The form ever becomes slower, blocks, or shows an error because the GHL call failed. Capture is invisible and
  best-effort from the visitor's side.
- The GHL token reaches the browser.
- Duplicate contacts created on every keystroke or every blur.
- A text message sent to someone whose SMS consent is not on record.
- Capture silently off in production (token missing, scope wrong) while everyone believes leads are flowing.

## Constraints and facts the builder must respect

- Stack: React 19 + Vite SPA prerendered by `scripts/prerender.mjs`, Express 5 server `server.mjs`, Node test
  runner (`npm test` = `node --test tests/*.test.mjs`). No TypeScript on the server side. Deploy = `git push fork
  main` (origin denies push); Render builds from the fork.
- Existing inquiry pipeline: `server/inquiries.mjs` (`validateInquiry`, `normalisePhone`, `makeLimiter`,
  `assertMailConfigured`) and `POST /api/inquiries` in `server.mjs`, which emails `INQUIRY_TO` via SMTP. This stays
  exactly as is and keeps working if GHL is down.
- A2P 10DLC rules already encoded in `tests/a2p-compliance.test.mjs` (21 tests) and `tests/inquiries.test.mjs`:
  phone is optional, general "contact me" consent is required to submit, SMS consent is a separate optional checkbox
  and is never a condition of submitting. Those tests must keep passing untouched.
- The form (`InquiryForm` in `src/components.tsx`) has fields `name, email, phone, service, message, consent,
  smsConsent, website` (honeypot). `/api/config` returns `{inquiryMode, publicEmail, publicPhone}`.
- /book (`BookPage` in `src/App.tsx`) renders the GHL widget iframe
  `https://api.leadconnectorhq.com/widget/booking/3ZhO43EjFGe3gF5wvfdd` and loads `link.msgsndr.com/js/form_embed.js`.
- GHL: sub-account "Atlas Group", location `cS6OcK9m4UqGvMydqAsv`. Private Integration token "Grace Voice Agent"
  has scopes **contacts r/w, calendars r/w, calendar events r/w, users.readonly**: it can upsert contacts, add
  tags and read users, but **cannot** create custom fields or read the tag list (401 verified 10-29). Token lives in
  `C:\Users\hagea\Atlas\ATLAS-CREDENTIALS-AND-IDS.txt` and must be set as a Render env var; never committed.
- GHL users with seats today: Abe Hage (`7BsiUzhN2PaEvPP0ipCH`), Hadi Hage (`iVdiMcfOBSG7CzfqaoOw`). Adam and Moe
  have **no GHL seat yet** (open item with Adam). Round-robin starts with Abe only and widens as seats are added.
- GHL contact upsert (`POST /contacts/upsert`) dedupes on email or phone. A contact with neither cannot be deduped,
  so name-only input is **not** sent (my call, see below).
- GHL API calls from Node need a browser-like `User-Agent` or Cloudflare returns error 1010 (verified 10-29).
- Brand copy rules: "Benefits Coordinator", never "agent"; no terminal periods in headlines; no "family-run",
  no "serving Michigan".

## The design

### 1. Server endpoint `POST /api/leads` (new file `server/leads.mjs`)

Request body (JSON, 16 kB limit already enforced on `/api`):

```
{ stage: 'partial' | 'book',          // where the capture came from
  name?, email?, phone?,               // whatever is filled so far
  service?, plan?,                     // service select on /insurance; plan slug from /book?plan=
  consent: boolean, smsConsent: boolean,
  page: '/insurance' | '/contact' | '/book', website?: '' }   // website = honeypot
```

Behaviour:
- Honeypot filled: 400, nothing sent.
- Validate with the same `normalisePhone` rules as inquiries (US 10-digit only) and the same email regex. Name
  trimmed, max 100 chars, split on first space into first/last. `service` must be in `services`; `plan` must be one
  of `final-expense | income-replacement | mortgage-protection | whole-life | iul` or absent.
- **Requires at least one of valid email or valid phone**; otherwise 202 `{skipped:'no-contact-info'}` and no GHL
  call. (My call: name alone can't be contacted and can't be deduped.)
- Rate limit per IP: 30 per 15 minutes (a visitor blurs a field many times); reuse `makeLimiter`.
- Upsert to GHL: `POST https://services.leadconnectorhq.com/contacts/upsert` with
  `{locationId, firstName, lastName, email, phone:'+1'+digits, source:'atlasgroupmi.com', tags:[...]}` and headers
  `Authorization: Bearer <GHL_PIT_TOKEN>`, `Version: 2021-07-28`, browser-like `User-Agent`.
  Tags added, by stage:
  - always: `partial-lead`, `src-<page>` (`src-insurance-form` / `src-contact-form` / `src-book`), `plan-<slug>`
    when present, `service-<slug>` when present
  - `sms-consent-yes` when `smsConsent && phone`, otherwise `sms-consent-no`
  - stage `book`: also `reached-calendar`
- **Consent is "latest signal wins".** After the upsert, the server removes the opposite consent tag
  (`DELETE /contacts/{id}/tags`), so a contact never carries both `sms-consent-yes` and `sms-consent-no`. The smoke
  test asserts this. GHL's native DND field is not touched.
- **Existing contacts.** The upsert response says whether the contact is new. The server always adds
  `partial-lead` (so the person shows on the call list), but the GHL intake workflow only round-robin-assigns when
  the contact has **no assigned user**; a contact who already has an owner is left with that owner, who gets the
  notification instead. Nobody's client is reassigned by typing into a form.
- **Behind Render's proxy** `req.ip` is the proxy address unless Express trusts it, which would make the limiter one
  global bucket for the whole site and silently 429 real visitors under ad traffic. The server sets
  `app.set('trust proxy', 1)`; the deploy checklist confirms from the live process (one request, log line showing
  `req.ip` equals the caller's public IP) before the limiter is relied on. Every 429 is logged with
  `console.warn('leads: rate-limited', ip)` so a stuck bucket is visible in Render logs.
- Response: 201 `{ok:true, contactId}`; on GHL failure 502 `{ok:false}` **and** a `console.error` line with
  status + body (never swallowed). The browser ignores the response for partial captures; the /start and /book
  submits keep `contactId` for the native time picker.
- In local preview mode (`NODE_ENV !== 'production'` and no GHL env) the endpoint logs the payload and returns 202
  `{preview:true}`; local development never creates real contacts.
- Boot: `GHL_PIT_TOKEN` and `GHL_LOCATION_ID` are read from env. If either is missing the endpoint answers 503
  `{error:'lead capture not configured'}`, the boot log prints a loud warning, and `/api/config` reports
  `captureMode:'off'` (otherwise `'ghl'`). Production does **not** refuse to start (the email path must keep working)
  but the deploy checklist reads `/api/config` and fails if `captureMode !== 'ghl'`.

### 2. Completion clears the partial state

- `POST /api/inquiries` (existing): after a successful email send, also upsert the contact to GHL with tags
  `inquiry-complete`, `src-<page>`, `service-<slug>`, consent tags; then remove `partial-lead` via
  `DELETE /contacts/{id}/tags` with `{tags:['partial-lead']}`. If GHL fails here the email has already gone and
  the response to the visitor is unchanged; the failure is logged with `console.error` and the contact stays tagged
  `partial-lead` (worst case: an extra call-back).
- A booking: handled inside GHL (see section 4), not by the site.

### 3. Client

**InquiryForm (/insurance and /contact):** a `useLeadCapture()` hook posts to `/api/leads` with
`stage:'partial'` when the phone or email field blurs with a valid value, and again on any later change to name,
phone, email, service or the two consent boxes, debounced 2 s. It keeps a `sent` fingerprint and skips identical
payloads. It uses `fetch(..., {keepalive:true})` so a tab close still delivers. It never surfaces errors and never
blocks submit; submit cancels any pending capture. The `smsConsent` checkbox moves **above** the phone field; the
phone field gets helper text along the lines of "Optional. Tick the box above if texting is OK" (exact copy is the
builder's call; the registered A2P sentence on the checkbox stays word for word).

**/book two-step:** `BookPage` gets an Atlas-styled form before the time picker: first name, last name, mobile,
email, the general consent checkbox (required, same wording as the inquiry form). "Show available times" posts
`stage:'book'` (same hook, immediate, not debounced) and then renders the **native time picker** (below).
`/book?plan=<slug>` is read from the URL and sent as `plan`. The form remembers its values in `sessionStorage` so
a back-navigation does not re-ask. If the capture call fails the picker still shows (anti-goal: never block).

**Native time picker (Abe 10-29: "if native looks like the move minus any delays I'd prefer that").** The GHL
booking iframe is replaced on /book and /start by an Atlas-styled picker, one component shared by both pages:
- `GET /api/slots` (server, new in `server/booking.mjs`): proxies GHL `GET /calendars/3ZhO43EjFGe3gF5wvfdd/free-slots`
  for the next 3 days in `America/Detroit` (the calendar's own 3-day cap and 1-hour lead apply server-side), returns
  `{days:[{date, slots:[iso...]}]}`, cached for 60 s. Day tabs + a 3-column grid of times, exactly the step-2 card
  in the mockups.
- `POST /api/book` `{contactId, startTime, plan?}`: validates the slot is still in the cached free list, then GHL
  `POST /calendars/events/appointments` with `{calendarId, locationId, contactId, startTime, title:'{{contact.name}}'}`
  (round-robin assignment is the calendar's; `assignedUserId` is not sent). A 409 from GHL (slot taken) returns
  `{error:'slot-taken'}` and the picker refreshes the list. Success returns the appointment id; the page shows the
  same confirmation copy the widget used to show, with (313) 513-0268.
- Verified 10-29 that an API-created appointment with status confirmed fires "Atlas Call Reminders" (the trigger
  is Appointment status = confirmed), so confirmation SMS/email and reminders behave identically to a widget
  booking. `contactId` comes from the step-1 capture response (`/api/leads` returns it), so booking is always on
  the captured contact; never create a second contact from the picker.
- Prefill into the GHL widget was verified to work and remains the documented fallback if the native picker is
  pulled: `?first_name=&last_name=&email=&phone=` on the widget URL.

**Prefill verified 2026-10-29:** opening
`https://api.leadconnectorhq.com/widget/booking/3ZhO43EjFGe3gF5wvfdd?first_name=Prefill&last_name=Spike&email=prefill.spike@example.com&phone=3135550100`
and reaching the details step showed all four fields filled (phone rendered as "(313) 555-0100"). No spike needed.

**Plan slugs.** `/book?plan=<slug>` is emitted by the five plan cards on /insurance (`PlanBody` in `src/App.tsx`,
today a bare `/book` link). Mapping: Final Expense = `final-expense`, Income Replacement Coverage =
`income-replacement`, Mortgage Protection Assurance = `mortgage-protection`, Whole Life = `whole-life`, Indexed
Universal Life = `iul`. The landing page (section 6) passes the slug through too.

**SMS consent on /book:** the /book pre-form collects phone and the general "contact me" consent only. It does
**not** show the SMS consent checkbox, so the A2P campaign filing (which attests the inquiry-form checkbox is the
sole SMS opt-in) stays accurate. /book partials are tagged `sms-consent-no` and are reached by call or email. The
booking widget's own consent checkbox covers the appointment reminders, which are transactional.

**Which forms capture:** `InquiryForm` renders on `/` (Home), `/insurance` and `/contact`; all three capture, with
`page` set accordingly (`src-home-form`, `src-insurance-form`, `src-contact-form`). A non-insurance `service`
(Real estate, Mortgages, Construction) is still captured and tagged `service-<slug>`; the GHL intake workflow
branches on that tag (section 4) so a mortgage typer is not called by an insurance Coordinator.

### 4. GHL side (configured by hand in the Atlas Group sub-account, documented in the plan)

- **Tags** are created implicitly by the API on first use; no setup.
- **Workflow "Partial lead intake"** (published): trigger *Contact tag added* = `partial-lead`, then
  If/Else *assigned user is empty*: yes, *Assign to user* round-robin among the users that have seats (today: Abe;
  add Adam and Moe when seated); no, keep the owner. Then If/Else on `service-*` tag: insurance or none,
  *Internal notification* to the assigned user (in-app + SMS to their cell) with name, phone, email, page, plan;
  other services, notification to Abe only. Then *Wait 30 days*, then If/Else: still tagged `partial-lead` and no
  appointment, add tag `lead-cold`.
  Settings: allow re-entry ON (a second partial from the same person re-notifies), stop on response OFF.
- **Removal:** a second small workflow: trigger *Contact tag added* `inquiry-complete` OR *Appointment status*
  confirmed on Your Atlas Call, then remove tag `partial-lead` and remove the contact from "Partial lead intake".
- **Smart list "Partial leads"** in Contacts: tag `partial-lead`, sorted newest first. This is the morning call
  list for Abe, Adam and Moe.
- Consent is carried as tags (`sms-consent-yes|no`); Sequence B will filter on `sms-consent-yes`.

### 6. Ad landing page `/start` (lead first, booking second)

Meta ads send traffic to the site, not to an Instant Form (decided 10-25). Abe's direction 10-29: the page must
carry the ad's promise and intent (ad #1 = final expense, "a dollar a day, no medical exam, see if you qualify"),
and the visitor does **not** yet know a Coordinator call is coming. They fill in their details first, which is the
lead; booking is offered afterwards as the fastest way to get their number. Someone who stops after the fields is
a lead on the Coordinator/Grace call route. Mockups: https://claude.ai/artifact/THbYXKSKihcsAyjDcYkYSE

- **Hero** carries the pitch Abe specified: "Contracted with the top 100 A+ rated carriers, one tied to your
  personal circumstances." The carrier claim is gated on Adam's carrier list exactly like the ad. On desktop the
  hero background is the /insurance hero itself (Abe 10-29): the `atlas-hero.mp4` film with the existing
  `.ins-hero-film` / `.ins-hero-veil` treatment (navy gradient veil, film hidden under reduced-motion). Under the
  three bullets the desktop hero carries two seals: "Independent agency · Top 100 A+ rated carriers" (gated on
  Adam's list) and "No medical exam · options with a few simple questions". **No licence number or NPN is shown
  anywhere on the page (Abe 10-29).** Then an "Appointed carriers" strip using the ten logos already in
  `public/carriers/` in the order of the `carriers` array in `src/App.tsx` (Mutual of Omaha, AIG, Transamerica,
  Gerber Life, Foresters Financial, Americo, Aetna, Prosperity Life, Royal Neighbors of America, American
  Amicable), shown only while `SHOW_CARRIERS` is on, the same gate as /insurance. No review quotes, no invented
  counts. On phone the hero is the plain navy band with one headline and one line; the
  form follows immediately and the seals are left out. **The page is the hero and the form, then the footer.
  Nothing else** (Abe 10-29: no "what happens next", no purpose strip, no FAQ on either desktop or phone).
- **Step 1 form "Tell us a little about you"** (Abe 10-29: no "see if you qualify" anywhere; the promise is that
  a Coordinator reaches out). Sub-line: "A licensed Atlas Benefits Coordinator will reach out, match the carrier to
  your situation, and give you your number." Fields in the order Abe set: **name**, **date of birth** (age
  derived), **state**, **mobile number**, **email (optional)**, **veteran** yes/no, **current policy holder**
  yes/no, then **Purpose** (Final Expense: burial and cremation expenses / Income Replacement / Mortgage
  Protection / Something else), then the general consent checkbox. Button **"Have a Coordinator reach out"**.
  Posts `stage:'reachout'` through the same `/api/leads`
  endpoint; the extra answers are written as tags `purpose-<slug>`, `state-<xx>`, `veteran-yes|no`,
  `policy-yes|no` and the date of birth into the contact's native `dateOfBirth` field (no custom-field scope
  needed). The ad's UTM values ride along as tags `src-meta`, `campaign-<slug>`, `ad-<slug>`. Partial capture
  applies here too (phone or email on blur). Email is optional here, so phone is the dedupe key for most leads.
- **Step 2 card delivers exactly what the button promised.** "Thanks, Adam. A Coordinator will reach out", then:
  a licensed Atlas Benefits Coordinator will call the number given within one business day, match the carrier and
  give the number. Then the optional upgrade: "Prefer to pick the exact time? Choose one and that's when we call",
  the native time picker (section 3) booking on the contact created in step 1, and underneath "I'll wait for the
  Coordinator's call", which ends the flow
  with "you're on the list, save (313) 513-0268". The submit itself is the lead (tag `reachout`); booking adds
  `reached-calendar` and the appointment; choosing to wait adds `wants-callback`. Leaving the page after the
  submit is the same outcome as waiting, minus the tag. No eligibility result and no dollar figure appear on the
  page; the Coordinator gives both on the call.
- **Meta pixel**: `Lead` when step 1's capture returns 201, `Schedule` when the widget reports a booking (the
  embed script posts a message on booking; if that proves unreliable, `Schedule` is fired from the GHL side later).
- **GHL**: `wants-callback` and `reached-calendar` route into the same "Partial lead intake" workflow; the
  notification names the ad and the answers so the Coordinator opens the call knowing what the person came for.
- Each future ad gets its own variant of the hero and plan tag; the form, the step-2 card and the server path are
  shared.

### 5. Observability (CLAUDE.md standing tests)

- Boot log states whether capture is on. `/api/config.captureMode` is the live truth.
- Every GHL failure logs status + response body. Render log search for `GHL` finds them.
- Post-deploy smoke test (in the plan): POST a synthetic lead with a known test phone, read it back from GHL via
  `GET /contacts/?query=`, assert the tags, delete the test contact. Run from the deploy checklist, never from CI.

## Decided by Abe

- Partial typers become leads in GHL; no automated text without consent; a Coordinator (later Grace) calls them.
- Leads distributed evenly between Abe, Adam and Moe.
- Build it now, before ads run.

## My calls (Abe can veto)

- Capture needs phone or email; name alone is not sent.
- Debounce 2 s + blur; `keepalive` fetch; 30 per 15 minutes rate limit.
- Consent box above the phone field; copy keeps the registered A2P sentence.
- Missing GHL config does not stop production boot; it goes loud in logs and `/api/config`.
- 30 days before `lead-cold`.
- Round-robin starts with Abe alone until Adam and Moe have seats; a contact who already has an owner keeps it.
- All three inquiry-form placements capture; non-insurance services are captured, tagged, and routed to Abe only.
- No SMS consent checkbox on the /book pre-form, to keep the A2P filing accurate; /book partials get calls or email.
- Consent flip: latest signal wins, opposite tag removed.
- `trust proxy` on, verified from the live process; 429s logged.

## Left to the builder

- File layout for the hook and the /book form component; CSS matching the existing `book-frame` styling.
- Exact debounce implementation and fingerprinting.
- Test doubles for the GHL client (inject `fetch`).
- Wording of helper text (within the brand rules above).
