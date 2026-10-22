# Atlas Insurance — A2P-Compliant Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the existing Atlas Group site live at `atlasgroupmi.com` with everything A2P 10DLC registration requires, so the 2–3 week carrier review clock can start.

**Architecture:** The site is already built — a 345-line Vite/React/Express SSR app where `src/content.ts` holds all copy and one `DivisionPage` renders the four company pages. This plan changes five things and deploys: the inquiry form gains an optional phone field and a separate optional SMS-consent checkbox; the preview-era privacy page is replaced and a terms page added; `server.mjs` refuses to boot in production without mail configured rather than filing leads nobody reads; public contact details go into `content.ts`; `noindex` comes off.

**Tech Stack:** Node ≥22.13.0, Express 5, React 19, Vite 8, `node:test`, nodemailer, Railway or Render (must run `server.mjs` as-is).

**Spec:** No separate design doc. The requirements are the A2P 10DLC Business Registration criteria as shown in Follow Up Boss's registration form on 2026-10-22, reproduced verbatim in Global Constraints below. The deferred `/insurance` rebuild is mocked at https://claude.ai/artifact/E2R1sE8kYYZvHiPSwnevqW and is explicitly out of scope here.

## Global Constraints

- **SMS consent MUST be optional.** Carrier rule, verbatim: *"If SMS opt-in is required in order to submit the contact form, the Business Registration will be rejected."* The existing general consent checkbox stays required; the SMS one is separate and never required.
- **Opt-in copy, exact, on every form collecting a phone number:**
  > By providing your phone number, you agree to receive calls and text messages from **Atlas Insurances LLC** about life insurance services. Msg & data rates may apply. Message frequency varies. Reply STOP to unsubscribe or HELP for help. See our Privacy Policy and Terms.
- **Sender name is `Atlas Insurances LLC`** in opt-in copy and legal pages — must match the EIN record, not the "Atlas Group" brand.
- **Privacy policy must state** that lead phone numbers are not sold or shared with third parties for promotional purposes.
- **Terms page must carry SMS terms** and be reachable at a stable URL.
- Public phone: `(313) 513-3017`. Registered address: `8409 Fenton St, Dearborn Heights, MI 48127`. EIN entity: `Atlas Insurances LLC`.
- Node `>=22.13.0`. Add no new runtime dependencies.
- Design tokens already in use: Manrope; `#3268F5`, `#14263D`, `#FFFFFF`, `#F4F6F8`, muted `#657181`, borders `#DCE1E7`; 2px max border-radius; no card grids; Lucide outline icons.
- Legal pages follow the existing `legal-page container` markup pattern in `src/App.tsx`.

## Review Focus

1. **SMS consent ticked, phone left blank** — submission must still succeed, and the stored record must not claim SMS consent without a number to send to.
2. **Phone supplied, SMS consent unticked** — must succeed; the phone is captured for calling, and nothing marks them as textable.
3. **Malformed phone input** (letters, 400 characters, `+44 20 7946 0958`) — must be rejected with a readable message, never silently truncated into the email body.
4. **Production boot with 4 of the 5 mail vars set** — must refuse to start, not fall back to filing leads on disk.
5. **SMTP authentication fails at send time** — the visitor must see a failure, and the lead must not be reported as delivered.

---

### Task 1: Phone field and separate optional SMS consent

**Files:**
- Modify: `server/inquiries.mjs` (validateInquiry)
- Modify: `src/components.tsx:77-100` (ContactSection form and its fetch body)
- Test: `tests/inquiries.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `validateInquiry(input)` returns `{value}` where `value` now also carries `phone: string` (`''` when omitted) and `smsConsent: boolean`. Task 2 reads both when composing the notification email.

- [ ] **Step 1: Write the failing tests**

```js
test('accepts an inquiry with no phone and no sms consent', () => {
  const {value, error} = validateInquiry(valid);
  assert.equal(error, undefined);
  assert.equal(value.phone, '');
  assert.equal(value.smsConsent, false);
});

test('accepts a phone number and normalises it to digits', () => {
  assert.equal(validateInquiry({...valid, phone: '(313) 555-0100'}).value.phone, '3135550100');
});

test('rejects a malformed or oversized phone number', () => {
  for (const phone of ['not a phone', '1'.repeat(40), '+44 20 7946 0958'])
    assert.ok(validateInquiry({...valid, phone}).error);
});

test('sms consent without a phone number is not recorded as consent', () => {
  const {value, error} = validateInquiry({...valid, smsConsent: true});
  assert.equal(error, undefined);
  assert.equal(value.smsConsent, false);
});

test('sms consent with a phone number is recorded', () => {
  assert.equal(validateInquiry({...valid, phone: '3135550100', smsConsent: true}).value.smsConsent, true);
});

test('a phone number without sms consent is still captured', () => {
  const {value} = validateInquiry({...valid, phone: '3135550100'});
  assert.equal(value.phone, '3135550100');
  assert.equal(value.smsConsent, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `value.phone` is `undefined`.

- [ ] **Step 3: Extend `validateInquiry` in `server/inquiries.mjs`**

`phone` is optional. When present it must be a string; strip everything but digits; accept 10 digits, or 11 beginning `1` (store the trailing 10); reject anything else. `smsConsent` is `input.smsConsent === true && phone !== ''`. Leave the existing required `consent` check exactly as it is — it is the general contact consent, not the SMS one.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, including the four pre-existing tests.

- [ ] **Step 5: Add the phone field and SMS consent checkbox to the form**

In `src/components.tsx`, inside the existing `<form>`: a `Phone (optional)` labelled `<input name="phone" type="tel" autoComplete="tel" maxLength={20}>` after the Email field, and below the existing required consent label a second `<label className="consent">` holding an **unchecked, not `required`** `<input type="checkbox" name="smsConsent">` with the Global Constraints opt-in copy, linking to `/privacy` and `/terms` with `<Link>`. Add `phone` and `smsConsent` to the `JSON.stringify` body in the submit handler, matching how `consent` is read (`fd.get('smsConsent')==='on'`).

- [ ] **Step 6: Verify the checkbox is genuinely optional**

Run: `npm run dev`, submit the form with SMS consent unticked.
Expected: submission succeeds. The browser must not block on the SMS checkbox.

- [ ] **Step 7: Commit**

```bash
git add server/inquiries.mjs src/components.tsx tests/inquiries.test.mjs
git commit -m "feat: capture phone number with separate optional SMS consent"
```

---

### Task 2: Production refuses to start without mail configured

**Files:**
- Modify: `server.mjs:21` (mailReady) and the inquiry handler
- Create: `tests/mail-config.test.mjs`

**Interfaces:**
- Consumes: `value.phone`, `value.smsConsent` from Task 1.
- Produces: `assertMailConfigured(env)` exported from `server/inquiries.mjs` — throws an `Error` naming every missing variable when `env.NODE_ENV === 'production'` and any of the five mail vars is absent; returns `false` (preview mode permitted) otherwise.

- [ ] **Step 1: Write the failing tests**

```js
test('production refuses to start when any mail var is missing', () => {
  const full = {NODE_ENV:'production', SMTP_HOST:'h', SMTP_USER:'u', SMTP_PASS:'p', INQUIRY_TO:'t', MAIL_FROM:'f'};
  for (const key of ['SMTP_HOST','SMTP_USER','SMTP_PASS','INQUIRY_TO','MAIL_FROM']) {
    const env = {...full}; delete env[key];
    assert.throws(() => assertMailConfigured(env), new RegExp(key));
  }
  assert.equal(assertMailConfigured(full), true);
});

test('non-production still allows preview mode', () => {
  assert.equal(assertMailConfigured({NODE_ENV:'development'}), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `assertMailConfigured` is not exported.

- [ ] **Step 3: Implement `assertMailConfigured(env)` in `server/inquiries.mjs` and call it in `server.mjs`**

In `server.mjs` replace the `mailReady` expression with a call to it, at module scope so the process exits before `listen`. Also add `Phone: ${value.phone || 'not provided'}` and `SMS consent: ${value.smsConsent ? 'yes' : 'no'}` to the notification email body, beside the existing `Consent:` line.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify the guard from the running process**

Run: `NODE_ENV=production SMTP_HOST=h SMTP_USER=u SMTP_PASS=p INQUIRY_TO=t node server.mjs` (MAIL_FROM deliberately absent)
Expected: non-zero exit, stderr naming `MAIL_FROM`. No listening server.

- [ ] **Step 6: Commit**

```bash
git add server.mjs server/inquiries.mjs tests/mail-config.test.mjs
git commit -m "fix: refuse to boot in production without mail configured"
```

---

### Task 3: Real privacy policy and a terms page

**Files:**
- Modify: `src/App.tsx:7` (pageTitles), `:74` (Privacy), `:77` (Routes)
- Modify: `scripts/prerender.mjs:8` (route list)
- Modify: `server.mjs` production route list
- Modify: `src/components.tsx:70` (footer links)
- Test: `tests/routes.test.mjs` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: a `/terms` route rendering a `Terms()` component; both `/privacy` and `/terms` prerendered to `dist/<route>/index.html`.

- [ ] **Step 1: Write the failing test**

```js
test('privacy and terms are prerendered and carry the A2P statements', async () => {
  for (const [route, needle] of [
    ['/privacy', 'do not sell'],
    ['/privacy', 'Atlas Insurances LLC'],
    ['/terms', 'STOP'],
    ['/terms', 'Msg & data rates may apply'],
  ]) {
    const html = await readFile(`dist${route}/index.html`, 'utf8');
    assert.ok(html.includes(needle), `${route} missing: ${needle}`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build && npm test`
Expected: FAIL — `dist/terms/index.html` does not exist.

- [ ] **Step 3: Rewrite `Privacy()` and add `Terms()` in `src/App.tsx`**

Both follow the existing `<section className="legal-page container">` pattern. Delete every sentence in `Privacy()` describing a preview — "this website preview", "when the form is in preview mode", the "Before public launch" section — and replace with the live position. Privacy must state plainly that phone numbers and other contact details collected through the site are **not sold or shared with third parties for promotional purposes**, name `Atlas Insurances LLC` at `8409 Fenton St, Dearborn Heights, MI 48127`, and describe SMS: what is sent, that frequency varies, that msg & data rates may apply, and how to stop. `Terms()` covers use of the site, the SMS programme (STOP to unsubscribe, HELP for help, carrier non-liability), and that a website inquiry does not bind coverage.

- [ ] **Step 4: Register the route in all four places**

`pageTitles` gets `'/terms':'Terms'`; `<Route path="/terms" element={<Terms/>}/>`; `/terms` added to the array in `scripts/prerender.mjs:8` and to the production `routes` array in `server.mjs`; a `Terms` link added beside Privacy in the footer in `src/components.tsx:70`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components.tsx scripts/prerender.mjs server.mjs tests/routes.test.mjs
git commit -m "feat: live privacy policy and terms page with SMS terms"
```

---

### Task 4: Public contact details and indexing

**Files:**
- Modify: `src/content.ts` (founder block)
- Modify: `index.html:8`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: `PUBLIC_PHONE`, `PUBLIC_EMAIL`, `PUBLIC_ORIGIN` documented in `.env.example`; `/api/config` already surfaces the first two.

- [ ] **Step 1: Remove the robots meta**

Delete `<meta name="robots" content="noindex,nofollow" />` from `index.html:8`.

- [ ] **Step 2: Put the public details in `src/content.ts`**

Public phone `(313) 513-3017`, public email `info@atlasgroupmi.com`. In the `founder` block, replace `credentialNote` with the real licence numbers **if Adam has supplied them**; if he has not, leave the note and record the decision in the commit message — the live site currently promises these before launch, and shipping without them is a deliberate choice, not an oversight.

- [ ] **Step 3: Document the environment**

`.env.example` gains `PUBLIC_ORIGIN=https://atlasgroupmi.com` and confirms all five mail vars plus `PUBLIC_EMAIL` and `PUBLIC_PHONE`.

- [ ] **Step 4: Verify the build carries them**

Run: `npm run build && grep -r "513-3017" dist/ | head -3`
Expected: the number appears in the prerendered HTML.

- [ ] **Step 5: Commit**

```bash
git add src/content.ts index.html .env.example
git commit -m "feat: publish contact details and allow indexing"
```

---

### Task 5: Deploy and verify from production

**Files:**
- Create: `docs/DEPLOY.md`
- No application code changes.

**Interfaces:**
- Consumes: everything above.
- Produces: a live origin at `https://atlasgroupmi.com` serving the Express app.

- [ ] **Step 1: Create the Google Workspace App Password**

2FA must be enabled on the sending mailbox first. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` = the sending mailbox, `SMTP_PASS` = the 16-character app password, `INQUIRY_TO=leads@atlasgroupmi.com`, `MAIL_FROM` = an address on `atlasgroupmi.com` so the SPF and DKIM already in DNS cover it.

- [ ] **Step 2: Deploy to Railway or Render**

Either runs `server.mjs` unchanged. Build `npm run build`, start `npm start`, Node 22. Set all five mail vars plus `PUBLIC_ORIGIN`, `PUBLIC_EMAIL`, `PUBLIC_PHONE`, `NODE_ENV=production`, and bind `HOST=0.0.0.0` (the default `127.0.0.1` will not accept traffic from the platform's proxy).

- [ ] **Step 3: Point DNS and clear the parking records**

In Namecheap Advanced DNS for `atlasgroupmi.com`: delete the `CNAME www → parkingpage.namecheap.com` and the `URL Redirect @` records, then add the host's records. Leave the four TXT records (verification, SPF, DKIM, DMARC) and the Google MX records untouched.

- [ ] **Step 4: Verify from the running site, not the source**

```bash
curl -s https://atlasgroupmi.com/api/config          # inquiryMode must be "email"
curl -sI https://atlasgroupmi.com/ | grep -i robots  # no noindex
curl -so /dev/null -w '%{http_code}' https://atlasgroupmi.com/terms   # 200
```

Then submit the real form on the live site with a phone number and SMS consent **unticked**, and confirm the message arrives in `leads@atlasgroupmi.com` carrying `Phone:` and `SMS consent: no`.

- [ ] **Step 5: Prove failure is visible**

Temporarily set `SMTP_PASS` to an invalid value and redeploy. Submit the form.
Expected: the visitor sees an error, not a success message, and nothing is written to `data/inquiries/`. Restore the correct password and redeploy.

- [ ] **Step 6: Write `docs/DEPLOY.md` and commit**

Record the host, the environment variables and where their values come from, the DNS records, and the four verification commands above.

```bash
git add docs/DEPLOY.md docs/superpowers/plans/2026-10-22-atlas-a2p-launch.md
git commit -m "docs: deployment and verification runbook"
```

---

## After this plan

Submit the A2P Business Registration in Follow Up Boss with `https://atlasgroupmi.com`, `https://atlasgroupmi.com/privacy` and `https://atlasgroupmi.com/terms`, answering **yes** to all three website-compliance questions. The business half of that form is already saved. Then begin the `/insurance` rebuild while the 2–3 week carrier review runs.
