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
  for(const [page,tag] of [['/','src-home-form'],['/contact','src-contact-form'],['/about','src-about-form'],['/book','src-book'],['/start','src-start']]){
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

/* ---- /api/leads handler ---- */
import {makeLeadHandler} from '../server/leads.mjs';
import {GhlError} from '../server/ghl.mjs';
function fakeRes(){const r={code:200,body:null,status(c){r.code=c;return r},json(b){r.body=b;return r}};return r}
function fakeLog(){const l={warn:[],error:[],info:[]};return {log:{warn:(...a)=>l.warn.push(a),error:(...a)=>l.error.push(a),info:(...a)=>l.info.push(a)},l}}
function fakeGhl(over={}){const calls={upsert:[],removeTags:[]};return {calls,ghl:{async upsertContact(p){calls.upsert.push(p);return over.upsert?over.upsert():{id:'c1',isNew:true}},async removeTags(id,tags){calls.removeTags.push([id,tags])},...over.methods}}}
const good={stage:'partial',page:'/insurance',phone:'3136762298',smsConsent:true};

test('503 when mode off',async()=>{
  const {log}=fakeLog();const res=fakeRes();
  await makeLeadHandler({ghl:null,allow:()=>true,mode:'off',log})({body:good,ip:'1.1.1.1'},res);
  assert.equal(res.code,503);assert.equal(res.body.error,'lead capture not configured');
});
test('202 preview never calls ghl',async()=>{
  const {ghl,calls}=fakeGhl();const {log,l}=fakeLog();const res=fakeRes();
  await makeLeadHandler({ghl,allow:()=>true,mode:'preview',log})({body:good,ip:'1.1.1.1'},res);
  assert.equal(res.code,202);assert.deepEqual(res.body,{preview:true});assert.equal(calls.upsert.length,0);assert.equal(l.info.length,1);
});
test('201 with contactId and removes opposite consent tag',async()=>{
  const {ghl,calls}=fakeGhl();const {log}=fakeLog();const res=fakeRes();
  await makeLeadHandler({ghl,allow:()=>true,mode:'ghl',log})({body:good,ip:'1.1.1.1'},res);
  assert.equal(res.code,201);assert.deepEqual(res.body,{ok:true,contactId:'c1'});
  assert.ok(calls.upsert[0].tags.includes('sms-consent-yes'));
  assert.deepEqual(calls.removeTags,[['c1',['sms-consent-no']]]);
});
test('400 on honeypot and 202 skipped without contact info',async()=>{
  const {ghl,calls}=fakeGhl();const {log}=fakeLog();
  const r1=fakeRes();await makeLeadHandler({ghl,allow:()=>true,mode:'ghl',log})({body:{...good,website:'x'},ip:'1.1.1.1'},r1);assert.equal(r1.code,400);
  const r2=fakeRes();await makeLeadHandler({ghl,allow:()=>true,mode:'ghl',log})({body:{stage:'partial',page:'/insurance',name:'A'},ip:'1.1.1.1'},r2);assert.equal(r2.code,202);assert.equal(r2.body.skipped,'no-contact-info');
  assert.equal(calls.upsert.length,0);
});
test('502 and log.error on GhlError',async()=>{
  const {ghl}=fakeGhl({upsert:()=>{throw new GhlError(500,'boom','/contacts/upsert')}});const {log,l}=fakeLog();const res=fakeRes();
  await makeLeadHandler({ghl,allow:()=>true,mode:'ghl',log})({body:good,ip:'1.1.1.1'},res);
  assert.equal(res.code,502);assert.deepEqual(res.body,{ok:false});assert.equal(l.error.length,1);assert.ok(String(l.error[0]).includes('500'));
});
test('429 logs warn',async()=>{
  const {ghl}=fakeGhl();const {log,l}=fakeLog();const res=fakeRes();
  await makeLeadHandler({ghl,allow:()=>false,mode:'ghl',log})({body:good,ip:'9.9.9.9'},res);
  assert.equal(res.code,429);assert.deepEqual(l.warn[0],['leads: rate-limited','9.9.9.9']);
});

/* Cloudflare fronts Render: with one trusted hop req.ip is a Cloudflare edge that changes per
   request, so the limiter must key on CF-Connecting-IP when it is present. */
import {clientKey} from '../server/leads.mjs';
test('clientKey prefers cf-connecting-ip over req.ip',()=>{
  assert.equal(clientKey({ip:'104.16.1.1',get:h=>h==='cf-connecting-ip'?'68.41.106.56':undefined}),'68.41.106.56');
  assert.equal(clientKey({ip:'10.0.0.9',get:()=>undefined}),'10.0.0.9');
});
