import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildLeadPayload,fingerprint,readUtm} from '../shared/leadPayload.mjs';

const ctx={page:'/insurance',stage:'partial',utm:{source:'',campaign:'',content:'',plan:''}};

test('null until phone or email is valid',()=>{
  assert.equal(buildLeadPayload({name:'Abe',phone:'313-676',email:'not-an-email'},ctx),null);
  assert.ok(buildLeadPayload({phone:'(313) 676-2298'},ctx));
  assert.ok(buildLeadPayload({email:'abe@example.com'},ctx));
});
test('payload carries ctx and consent flags',()=>{
  const p=buildLeadPayload({name:'Abdallah Hage',phone:'3136762298',service:'Insurance',consent:true,smsConsent:false},ctx);
  assert.equal(p.page,'/insurance');assert.equal(p.stage,'partial');assert.equal(p.name,'Abdallah Hage');
  assert.equal(p.phone,'3136762298');assert.equal(p.consent,true);assert.equal(p.smsConsent,false);
  assert.deepEqual(p.utm,{source:'',campaign:'',content:''});
});
test('plan from ctx wins over empty field and start fields pass through',()=>{
  const p=buildLeadPayload({phone:'3136762298',purpose:'other',state:'MI',dob:'1962-04-09',veteran:true,policyHolder:false,wantsCallback:true},{...ctx,page:'/start',stage:'reachout',utm:{...ctx.utm,plan:'final-expense'}});
  assert.equal(p.plan,'final-expense');assert.equal(p.purpose,'other');assert.equal(p.state,'MI');assert.equal(p.dateOfBirth,'1962-04-09');
  assert.equal(p.veteran,true);assert.equal(p.policyHolder,false);assert.equal(p.wantsCallback,true);
});
test('fingerprint equal for same payload, differs on consent flip',()=>{
  const a=buildLeadPayload({phone:'3136762298',smsConsent:true},ctx),b=buildLeadPayload({phone:'3136762298',smsConsent:true},ctx),c=buildLeadPayload({phone:'3136762298',smsConsent:false},ctx);
  assert.equal(fingerprint(a),fingerprint(b));assert.notEqual(fingerprint(a),fingerprint(c));
});
test('readUtm parses and ignores unknown keys',()=>{
  assert.deepEqual(readUtm('?utm_source=meta&utm_campaign=fe-oct&utm_content=v17&plan=whole-life&foo=bar'),{source:'meta',campaign:'fe-oct',content:'v17',plan:'whole-life'});
  assert.deepEqual(readUtm(''),{source:'',campaign:'',content:'',plan:''});
});
test('browser side also rejects a non-NANP ten digit string',()=>assert.equal(buildLeadPayload({phone:'1313676229'},ctx),null));
