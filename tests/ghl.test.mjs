import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeGhlClient,GhlError} from '../server/ghl.mjs';

function fakeFetch(status,body){
  const calls=[];
  const fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})};
  return {fetch,calls};
}

test('upsertContact sends locationId, +1 phone, tags and the three headers',async()=>{
  const {fetch,calls}=fakeFetch(200,{contact:{id:'c1'},new:true});
  const ghl=makeGhlClient({token:'tok',locationId:'loc1',fetch});
  await ghl.upsertContact({firstName:'Abdallah',lastName:'Hage',phone:'3136762298',tags:['partial-lead']});
  const [{url,init}]=calls;
  assert.equal(url,'https://services.leadconnectorhq.com/contacts/upsert');
  assert.equal(init.method,'POST');
  assert.equal(init.headers.Authorization,'Bearer tok');
  assert.equal(init.headers.Version,'2021-07-28');
  assert.match(init.headers['User-Agent'],/^Mozilla\/5\.0/);
  const body=JSON.parse(init.body);
  assert.equal(body.locationId,'loc1');
  assert.equal(body.phone,'+13136762298');
  assert.deepEqual(body.tags,['partial-lead']);
  assert.equal(body.firstName,'Abdallah');
});

test('upsertContact returns id and isNew from the response',async()=>{
  const {fetch}=fakeFetch(200,{contact:{id:'c1'},new:true});
  const ghl=makeGhlClient({token:'tok',locationId:'loc1',fetch});
  assert.deepEqual(await ghl.upsertContact({email:'a@example.com'}),{id:'c1',isNew:true});
});

test('removeTags uses DELETE on /contacts/c1/tags',async()=>{
  const {fetch,calls}=fakeFetch(200,{tags:[]});
  const ghl=makeGhlClient({token:'tok',locationId:'loc1',fetch});
  await ghl.removeTags('c1',['partial-lead']);
  assert.equal(calls[0].url,'https://services.leadconnectorhq.com/contacts/c1/tags');
  assert.equal(calls[0].init.method,'DELETE');
  assert.deepEqual(JSON.parse(calls[0].init.body),{tags:['partial-lead']});
});

test('freeSlots strips traceId and keeps dates',async()=>{
  const {fetch,calls}=fakeFetch(200,{'2026-10-30':{slots:['2026-10-30T10:00:00-04:00']},traceId:'x'});
  const ghl=makeGhlClient({token:'tok',locationId:'loc1',fetch});
  const slots=await ghl.freeSlots({calendarId:'cal1',startMs:1000,endMs:2000,timezone:'America/Detroit'});
  assert.deepEqual(slots,{'2026-10-30':['2026-10-30T10:00:00-04:00']});
  assert.match(calls[0].url,/\/calendars\/cal1\/free-slots\?startDate=1000&endDate=2000&timezone=America%2FDetroit$/);
});

test('createAppointment posts calendar, contact and start time',async()=>{
  const {fetch,calls}=fakeFetch(201,{id:'appt1'});
  const ghl=makeGhlClient({token:'tok',locationId:'loc1',fetch});
  const r=await ghl.createAppointment({calendarId:'cal1',contactId:'c1',startTime:'2026-10-30T10:00:00-04:00',title:'T'});
  assert.deepEqual(r,{id:'appt1'});
  const body=JSON.parse(calls[0].init.body);
  assert.equal(body.calendarId,'cal1');assert.equal(body.contactId,'c1');assert.equal(body.locationId,'loc1');
  assert.equal(body.startTime,'2026-10-30T10:00:00-04:00');
});

test('non-2xx throws GhlError with status and body',async()=>{
  const {fetch}=fakeFetch(502,{message:'bad gateway'});
  const ghl=makeGhlClient({token:'tok',locationId:'loc1',fetch});
  await assert.rejects(()=>ghl.addTags('c1',['x']),e=>e instanceof GhlError&&e.status===502&&e.body.includes('bad'));
});

/* Review I2: a stalled GHL must not hold a visitor; every request carries an abort signal. */
test('every request carries a timeout signal',async()=>{
  const {fetch,calls}=fakeFetch(200,{contact:{id:'c1'},new:true});
  const ghl=makeGhlClient({token:'tok',locationId:'loc1',fetch});
  await ghl.upsertContact({email:'a@example.com'});
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});
