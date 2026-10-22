import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateInquiry,makeLimiter,assertMailConfigured,mailVars} from '../server/inquiries.mjs';
const valid={name:'Website Test',email:'test@example.com',service:'Real estate',message:'A synthetic inquiry.',consent:true};
test('accepts a valid inquiry and trims user input',()=>assert.equal(validateInquiry({...valid,name:' Test '}).value.name,'Test'));
test('rejects missing consent, unknown services and header injection',()=>{
  for(const input of [{...valid,consent:false},{...valid,service:'bogus'},{...valid,email:'a@example.com\r\nBcc: x@example.com'}]) assert.ok(validateInquiry(input).error);
});
test('rejects unbounded messages and nonstring input',()=>{
  assert.ok(validateInquiry({...valid,message:'x'.repeat(3001)}).error);
  assert.ok(validateInquiry({...valid,name:{}}).error);
});
test('rate limiter expires and isolates clients',()=>{
 const allow=makeLimiter({max:2,windowMs:100});
 assert.equal(allow('a',0),true);assert.equal(allow('a',1),true);assert.equal(allow('a',2),false);
 assert.equal(allow('b',2),true);assert.equal(allow('a',101),true);
});

/* A2P 10DLC compliance: phone optional, SMS consent optional and separate. */
test('accepts an inquiry with no phone and no sms consent',()=>{
  const {value,error}=validateInquiry(valid);
  assert.equal(error,undefined);
  assert.equal(value.phone,'');
  assert.equal(value.smsConsent,false);
});
test('accepts a phone number and normalises it to digits',()=>{
  assert.equal(validateInquiry({...valid,phone:'(313) 555-0100'}).value.phone,'3135550100');
  assert.equal(validateInquiry({...valid,phone:'1-313-555-0100'}).value.phone,'3135550100');
});
test('rejects a malformed or oversized phone number',()=>{
  for(const phone of ['not a phone','1'.repeat(40),'+44 20 7946 0958','31355501'])
    assert.ok(validateInquiry({...valid,phone}).error,`should reject: ${phone}`);
});
test('sms consent without a phone number is not recorded as consent',()=>{
  const {value,error}=validateInquiry({...valid,smsConsent:true});
  assert.equal(error,undefined);
  assert.equal(value.smsConsent,false);
});
test('sms consent with a phone number is recorded',()=>{
  assert.equal(validateInquiry({...valid,phone:'3135550100',smsConsent:true}).value.smsConsent,true);
});
test('a phone number without sms consent is still captured',()=>{
  const {value}=validateInquiry({...valid,phone:'3135550100'});
  assert.equal(value.phone,'3135550100');
  assert.equal(value.smsConsent,false);
});

/* Production must refuse to start rather than file leads nobody reads. */
test('production refuses to start when any mail var is missing',()=>{
  const full={NODE_ENV:'production',SMTP_HOST:'h',SMTP_USER:'u',SMTP_PASS:'p',INQUIRY_TO:'t',MAIL_FROM:'f'};
  for(const key of mailVars){
    const env={...full}; delete env[key];
    assert.throws(()=>assertMailConfigured(env),new RegExp(key));
  }
  assert.equal(assertMailConfigured(full),true);
});
test('non-production still allows preview mode',()=>{
  assert.equal(assertMailConfigured({NODE_ENV:'development'}),false);
});
