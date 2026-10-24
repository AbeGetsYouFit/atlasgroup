import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/* A2P 10DLC: carriers reject the business registration over website copy, and a
   rejection looks like nothing at all on the site — the form keeps working while
   texting stays switched off. These pin the wording the reviewer checks against
   https://help.followupboss.com/hc/en-us/articles/16610775410839 */
const form = readFileSync(new URL('../src/components.tsx', import.meta.url), 'utf8');
const pages = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('the sms consent checkbox is never required', () => {
  const checkbox = form.match(/<input[^>]*name="smsConsent"[^>]*>/)?.[0];
  assert.ok(checkbox, 'the smsConsent checkbox is missing from the inquiry form');
  assert.doesNotMatch(checkbox, /required/, 'requiring SMS opt-in to submit the form gets the registration rejected');
});

test('the general contact consent stays required', () => {
  const checkbox = form.match(/<input[^>]*name="consent"[^>]*>/)?.[0];
  assert.match(checkbox ?? '', /required/);
});

test('the phone field is optional', () => {
  const phone = form.match(/<input[^>]*name="phone"[^>]*>/)?.[0];
  assert.ok(phone, 'the phone field is missing from the inquiry form');
  assert.doesNotMatch(phone, /required/);
});

test('the opt-in carries every element a carrier checks for', () => {
  for (const required of [
    'I agree to be contacted',        // a clear statement of agreement
    'Atlas Insurances LLC',           // the sender, matching the EIN record
    'life insurance services',        // the purpose of the messages
    'rates may apply',                // the cost disclosure
    'Message frequency varies',       // how often
    'STOP',                           // how to opt out
    'HELP',                           // how to get help
    '/privacy',                       // a link to the privacy policy
  ]) assert.ok(form.includes(required), `the opt-in language no longer says: ${required}`);
});

test('the privacy notice refuses to sell phone numbers', () => {
  assert.match(pages, /do not sell, rent, or share your phone number/);
});

/* GHL's A2P checklist requires the registered brand's legal name, address, phone and
   email to be visible on the website, and requires that NO other phone/SMS-consent form
   exists on any page carrying the chat widget. Both are attestations we ticked, so a
   later edit that quietly drops them would make the filing false with nothing failing. */
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the footer publishes the brand details carriers verify', () => {
  for (const required of [
    'Atlas Insurances LLC',              // must match the EIN record exactly
    '8409 Fenton St',
    'Dearborn Heights, MI 48127',
    '+13135133017',
    'info@atlasgroupmi.com',
  ]) assert.ok(form.includes(required), `the footer no longer publishes: ${required}`);
});

test('the chat widget is kept off every page that has the sms consent form', () => {
  const blocked = indexHtml.match(/var BLOCKED = \[([^\]]*)\]/)?.[1] ?? '';
  for (const route of ["'/'", "'/about'", "'/contact'"])
    assert.ok(blocked.includes(route), `ContactSection renders on ${route}, so the widget must be blocked there`);
  assert.match(indexHtml, /data-widget-id/, 'the chat widget loader is missing entirely');
});

/* Meta verifies the domain by scraping this tag from the static head. If it moves into a
   React-rendered head or is dropped, Meta un-verifies atlasgroupmi.com and the pixel and
   lead-ad permissions go with it — silently, while the site keeps working. */
test('the meta domain verification tag stays in the static head', () => {
  const head = indexHtml.slice(indexHtml.indexOf('<head>'), indexHtml.indexOf('</head>'));
  assert.match(head, /name="facebook-domain-verification"[^>]*content="buws3kk4nrk6z6vr1khfmr1h5qqrgn"/,
    'the Meta domain verification tag is missing from the static <head>');
});

test('both legal pages carry the required sms terms', () => {
  for (const required of [
    'wireless provider',              // who to ask about a text plan
    'Carriers are not liable',        // the carrier liability disclaimer
    'confirming that you have been unsubscribed', // the STOP confirmation
  ]) assert.ok(pages.includes(required), `the SMS terms no longer say: ${required}`);
});
