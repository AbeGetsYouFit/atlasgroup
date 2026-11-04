import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanUtm,sourceTags,leadSourceLabel} from '../shared/source.mjs';
import {rememberUtm} from '../shared/leadPayload.mjs';
import {validateInquiry,completeInquiry} from '../server/inquiries.mjs';

const valid={name:'Test Person',email:'test@example.com',service:'Insurance',message:'Hi',consent:true};
function memStore(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v))}}

test('cleanUtm slugifies, bounds and ignores junk',()=>{
  assert.deepEqual(cleanUtm({source:'Meta',campaign:'Vet Nov',content:'v17',x:'y'}),{source:'meta',campaign:'vet-nov',content:'v17'});
  assert.deepEqual(cleanUtm(null),{source:'',campaign:'',content:''});
  assert.equal(cleanUtm({campaign:'A'.repeat(500)}).campaign.length,40);
});
test('sourceTags and label for a Meta click',()=>{
  const u=cleanUtm({source:'meta',campaign:'vet-nov',content:'v17'});
  assert.deepEqual(sourceTags(u),['src-meta','campaign-vet-nov','ad-v17']);
  assert.equal(leadSourceLabel(u),'Meta Ads, v17');
  assert.deepEqual(sourceTags(cleanUtm({})),[]);
  assert.equal(leadSourceLabel(cleanUtm({})),'Website');
});
test('rememberUtm keeps the ad source across page changes in one visit',()=>{
  const s=memStore();
  assert.equal(rememberUtm('?utm_source=meta&utm_content=v17',s).content,'v17');
  assert.equal(rememberUtm('',s).source,'meta');            /* later page, no query */
  assert.equal(rememberUtm('?utm_source=google',s).source,'google'); /* a new click wins */
  assert.equal(rememberUtm('',null).source,'');             /* storage blocked: no crash */
  const broken={getItem(){throw new Error('denied')},setItem(){throw new Error('denied')}};
  assert.equal(rememberUtm('?utm_source=meta',broken).source,'meta');
});
test('inquiry carries the ad source into GHL',async()=>{
  const seen=[];
  const ghl={async upsertContact(p){seen.push(p);return {id:'c1',isNew:true}},async removeTags(){}};
  const {value}=validateInquiry({...valid,utm:{source:'meta',campaign:'vet-nov',content:'v17'}});
  await completeInquiry({ghl,value:{...value,page:'/insurance'},log:{error:()=>{}}});
  for(const t of ['src-meta','campaign-vet-nov','ad-v17']) assert.ok(seen[0].tags.includes(t),t);
  assert.equal(seen[0].customFields.find(f=>f.key==='lead_source').field_value,'Meta Ads, v17');
});
test('inquiry without utm still says Website',async()=>{
  const seen=[];
  const ghl={async upsertContact(p){seen.push(p);return {id:'c1',isNew:true}},async removeTags(){}};
  const {value}=validateInquiry(valid);
  await completeInquiry({ghl,value:{...value,page:'/insurance'},log:{error:()=>{}}});
  assert.equal(seen[0].customFields.find(f=>f.key==='lead_source').field_value,'Website');
  assert.ok(!seen[0].tags.includes('src-meta'));
});
