import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSlotsHandler,makeBookHandler,makeSlotCache} from '../server/booking.mjs';
import {GhlError} from '../server/ghl.mjs';

function fakeRes(){const r={code:200,body:null,status(c){r.code=c;return r},json(b){r.body=b;return r}};return r}
const S1='2026-10-30T10:00:00-04:00',S2='2026-10-30T10:30:00-04:00',S3='2026-10-31T11:00:00-04:00';
function fakeGhl(over={}){
  const calls={free:0,create:[]};
  return {calls,ghl:{
    async freeSlots(){calls.free++;if(over.freeError)throw over.freeError;return {'2026-10-31':[S3],'2026-10-30':[S1,S2]}},
    async createAppointment(p){calls.create.push(p);if(over.createError)throw over.createError;return {id:'appt1'}},
  }};
}

test('slots returns sorted days and caches for ttl',async()=>{
  const {ghl,calls}=fakeGhl();let t=1_000_000;
  const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>t,ttlMs:60_000});
  const h=makeSlotsHandler({cache});
  const r1=fakeRes();await h({},r1);const r2=fakeRes();await h({},r2);
  assert.equal(r1.code,200);
  assert.deepEqual(r1.body,{days:[{date:'2026-10-30',slots:[S1,S2]},{date:'2026-10-31',slots:[S3]}]});
  assert.equal(calls.free,1);
  t+=61_000;const r3=fakeRes();await h({},r3);assert.equal(calls.free,2);
});
test('slots 502 on GhlError',async()=>{
  const {ghl}=fakeGhl({freeError:new GhlError(500,'x','/free-slots')});
  const errors=[];const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeSlotsHandler({cache,log:{error:(...a)=>errors.push(a)}})({},res);
  assert.equal(res.code,502);assert.equal(res.body.error,'slots-unavailable');assert.equal(errors.length,1);
});
test('book rejects unknown contactId shape',async()=>{
  const {ghl}=fakeGhl();const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeBookHandler({ghl,cache,calendarId:'cal1',allow:()=>true})({body:{contactId:'../x',startTime:S1},ip:'1'},res);
  assert.equal(res.code,400);
});
test('book 409 when startTime not in free list',async()=>{
  const {ghl,calls}=fakeGhl();const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeBookHandler({ghl,cache,calendarId:'cal1',allow:()=>true})({body:{contactId:'wseU3X6FRfMhVno1u3Xk',startTime:'2026-10-30T23:00:00-04:00'},ip:'1'},res);
  assert.equal(res.code,409);assert.equal(res.body.error,'slot-taken');assert.equal(calls.create.length,0);
});
test('book returns slot-taken on GHL 4xx',async()=>{
  const {ghl}=fakeGhl({createError:new GhlError(422,'slot unavailable','/appointments')});const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeBookHandler({ghl,cache,calendarId:'cal1',allow:()=>true,log:{error:()=>{}}})({body:{contactId:'wseU3X6FRfMhVno1u3Xk',startTime:S1},ip:'1'},res);
  assert.equal(res.code,409);assert.equal(res.body.error,'slot-taken');
});
test('book 502 on GHL 5xx',async()=>{
  const {ghl}=fakeGhl({createError:new GhlError(503,'down','/appointments')});const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeBookHandler({ghl,cache,calendarId:'cal1',allow:()=>true,log:{error:()=>{}}})({body:{contactId:'wseU3X6FRfMhVno1u3Xk',startTime:S1},ip:'1'},res);
  assert.equal(res.code,502);assert.equal(res.body.error,'booking-failed');
});
test('book 201 drops the slot from cache',async()=>{
  const {ghl,calls}=fakeGhl();const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeBookHandler({ghl,cache,calendarId:'cal1',allow:()=>true})({body:{contactId:'wseU3X6FRfMhVno1u3Xk',startTime:S1},ip:'1'},res);
  assert.equal(res.code,201);assert.deepEqual(res.body,{ok:true,appointmentId:'appt1'});
  assert.equal(calls.create[0].calendarId,'cal1');assert.equal(calls.create[0].contactId,'wseU3X6FRfMhVno1u3Xk');
  const r2=fakeRes();await makeSlotsHandler({cache})({},r2);
  assert.deepEqual(r2.body.days[0].slots,[S2]);
});
test('book 429 when rate limited',async()=>{
  const {ghl}=fakeGhl();const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeBookHandler({ghl,cache,calendarId:'cal1',allow:()=>false,log:{warn:()=>{}}})({body:{contactId:'wseU3X6FRfMhVno1u3Xk',startTime:S1},ip:'1'},res);
  assert.equal(res.code,429);
});

/* Review I1: a slot GHL refuses must leave the served list, or the visitor re-picks the same time. */
test('book drops the slot from cache on GHL 4xx',async()=>{
  const {ghl}=fakeGhl({createError:new GhlError(422,'slot unavailable','/appointments')});const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeBookHandler({ghl,cache,calendarId:'cal1',allow:()=>true,log:{error:()=>{}}})({body:{contactId:'wseU3X6FRfMhVno1u3Xk',startTime:S1},ip:'1'},res);
  assert.equal(res.code,409);
  const r2=fakeRes();await makeSlotsHandler({cache})({},r2);
  assert.ok(!r2.body.days[0].slots.includes(S1));
});
/* Review M2: only a slot conflict reads as slot-taken; a revoked token must not. */
test('book maps 401 to booking-failed, not slot-taken',async()=>{
  const {ghl}=fakeGhl({createError:new GhlError(401,'bad token','/appointments')});const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeBookHandler({ghl,cache,calendarId:'cal1',allow:()=>true,log:{error:()=>{}}})({body:{contactId:'wseU3X6FRfMhVno1u3Xk',startTime:S1},ip:'1'},res);
  assert.equal(res.code,502);assert.equal(res.body.error,'booking-failed');
});

/* Review M7: a contact id alone must not let anyone book on someone else's record. */
import {signContact} from '../server/booking.mjs';
test('book rejects a contactId without a valid token',async()=>{
  const {ghl,calls}=fakeGhl();const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeBookHandler({ghl,cache,calendarId:'cal1',allow:()=>true,secret:'s3cret',log:{warn:()=>{}}})({body:{contactId:'wseU3X6FRfMhVno1u3Xk',startTime:S1,token:'nope'},ip:'1'},res);
  assert.equal(res.code,403);assert.equal(calls.create.length,0);
});
test('book accepts the token /api/leads issued',async()=>{
  const {ghl}=fakeGhl();const cache=makeSlotCache({ghl,calendarId:'cal1',now:()=>1,ttlMs:1000});
  const res=fakeRes();await makeBookHandler({ghl,cache,calendarId:'cal1',allow:()=>true,secret:'s3cret'})({body:{contactId:'wseU3X6FRfMhVno1u3Xk',startTime:S1,token:signContact('wseU3X6FRfMhVno1u3Xk','s3cret')},ip:'1'},res);
  assert.equal(res.code,201);
});
