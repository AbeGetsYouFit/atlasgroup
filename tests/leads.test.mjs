import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateLead,leadTags,oppositeConsentTag,captureMode} from '../server/leads.mjs';
import {slugify} from '../shared/slug.mjs';

const base={stage:'partial',page:'/insurance'};

test('honeypot rejects',()=>assert.equal(validateLead({...base,phone:'3136762298',website:'x'}).error,'rejected'));
test('unknown page rejects',()=>assert.ok(validateLead({...base,page:'/nope',phone:'3136762298'}).error));
test('unknown stage rejects',()=>assert.ok(validateLead({...base,stage:'zap',phone:'3136762298'}).error));
test('partial with invalid phone and no email is skipped',()=>assert.equal(validateLead({...base,phone:'31367622'}).skipped,'no-contact-info'));
test('name only is skipped',()=>assert.equal(validateLead({...base,name:'Abdallah Hage'}).skipped,'no-contact-info'));
test('phone normalises and splits name',()=>{
  const {value}=validateLead({...base,name:'  Abdallah Hage ',phone:'(313) 676-2298'});
  assert.equal(value.phone,'3136762298');assert.equal(value.firstName,'Abdallah');assert.equal(value.lastName,'Hage');
});
test('email alone is enough and is lowercased',()=>assert.equal(validateLead({...base,email:'Abe@Example.com'}).value.email,'abe@example.com'));
test('tags for insurance partial with sms consent',()=>{
  const {value}=validateLead({...base,phone:'3136762298',service:'Insurance',consent:true,smsConsent:true});
  const tags=leadTags(value);
  for(const t of ['partial-lead','src-insurance-form','service-insurance','sms-consent-yes']) assert.ok(tags.includes(t),t);
  assert.ok(!tags.includes('sms-consent-no'));
});
test('sms consent without phone is sms-consent-no',()=>{
  const {value}=validateLead({...base,email:'a@example.com',smsConsent:true});
  assert.ok(leadTags(value).includes('sms-consent-no'));
});
test('page tags for home, contact, book and start',()=>{
  for(const [page,tag] of [['/','src-home-form'],['/contact','src-contact-form'],['/book','src-book'],['/start','src-start']]){
    const {value}=validateLead({stage:'partial',page,phone:'3136762298'});
    assert.ok(leadTags(value).includes(tag),tag);
  }
});
test('book stage adds reached-calendar',()=>assert.ok(leadTags(validateLead({stage:'book',page:'/book',phone:'3136762298'}).value).includes('reached-calendar')));
test('reachout stage adds reachout',()=>assert.ok(leadTags(validateLead({stage:'reachout',page:'/start',phone:'3136762298'}).value).includes('reachout')));
test('start fields become tags and dob is kept',()=>{
  const {value,error}=validateLead({stage:'reachout',page:'/start',phone:'3136762298',purpose:'mortgage-protection',state:'mi',veteran:true,policyHolder:false,dateOfBirth:'1962-04-09'});
  assert.equal(error,undefined);
  const tags=leadTags(value);
  for(const t of ['purpose-mortgage-protection','state-mi','veteran-yes','policy-no']) assert.ok(tags.includes(t),t);
  assert.equal(value.dateOfBirth,'1962-04-09');
});
test('bad purpose, plan, state or dob reject',()=>{
  assert.ok(validateLead({...base,phone:'3136762298',purpose:'<script>'}).error);
  assert.ok(validateLead({...base,phone:'3136762298',plan:'nope'}).error);
  assert.ok(validateLead({...base,phone:'3136762298',state:'Michigan'}).error);
  assert.ok(validateLead({...base,phone:'3136762298',dateOfBirth:'04/09/1962'}).error);
});
test('utm and plan values are slugified and bounded',()=>{
  const {value}=validateLead({...base,phone:'3136762298',plan:'final-expense',utm:{source:'Meta',campaign:'A'.repeat(200)+'!!',content:'v17 cut B'}});
  const tags=leadTags(value);
  assert.ok(tags.includes('plan-final-expense'));
  assert.ok(tags.includes('src-meta'));
  assert.ok(tags.includes('campaign-'+'a'.repeat(40)));
  assert.ok(tags.includes('ad-v17-cut-b'));
});
test('oppositeConsentTag flips',()=>{
  assert.equal(oppositeConsentTag(['partial-lead','sms-consent-yes']),'sms-consent-no');
  assert.equal(oppositeConsentTag(['sms-consent-no']),'sms-consent-yes');
});
test('captureMode off when either env var missing',()=>{
  assert.equal(captureMode({GHL_PIT_TOKEN:'t',GHL_LOCATION_ID:'l'}),'ghl');
  assert.equal(captureMode({GHL_PIT_TOKEN:'t'}),'off');
  assert.equal(captureMode({}),'off');
});
test('slugify lowercases, collapses runs, trims and caps at 40',()=>{
  assert.equal(slugify('  Final  Expense!! '),'final-expense');
  assert.equal(slugify('x'.repeat(50)).length,40);
  assert.equal(slugify('---'),'');
});
