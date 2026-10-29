#!/usr/bin/env node
/* Post-deploy smoke test for lead capture. Run by hand from the deploy checklist, never in CI.
   Env: SITE_ORIGIN (e.g. https://atlasgroupmi.com), GHL_PIT_TOKEN, GHL_LOCATION_ID.
   Posts a synthetic partial lead, reads the contact back from GHL, asserts the tags, deletes it.
   Exit 0 = OK; anything else prints the mismatch and exits 1. */
import {makeGhlClient} from '../server/ghl.mjs';
const {SITE_ORIGIN,GHL_PIT_TOKEN,GHL_LOCATION_ID}=process.env;
if(!SITE_ORIGIN||!GHL_PIT_TOKEN||!GHL_LOCATION_ID){console.error('smoke: set SITE_ORIGIN, GHL_PIT_TOKEN, GHL_LOCATION_ID');process.exit(2)}
const PHONE='3135550199';
const H={Authorization:`Bearer ${GHL_PIT_TOKEN}`,Version:'2021-07-28',Accept:'application/json','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AtlasSite/1.0'};
let created=null;
const fail=async(msg)=>{console.error('smoke: FAIL',msg);if(created){await fetch(`https://services.leadconnectorhq.com/contacts/${created}`,{method:'DELETE',headers:H}).catch(()=>{})}process.exit(1)};

const cfg=await fetch(`${SITE_ORIGIN}/api/config`).then(r=>r.json());
if(cfg.captureMode!=='ghl') await fail(`captureMode is ${cfg.captureMode}, expected ghl`);

const post=await fetch(`${SITE_ORIGIN}/api/leads`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stage:'partial',page:'/insurance',name:'Smoke Test',phone:PHONE,smsConsent:false})});
const body=await post.json().catch(()=>({}));
if(post.status!==201||!body.ok||!body.contactId) await fail(`POST /api/leads -> ${post.status} ${JSON.stringify(body)}`);

/* Read by id: GHL's contact search index lags a few seconds behind an upsert. */
const got=await fetch(`https://services.leadconnectorhq.com/contacts/${body.contactId}`,{headers:H});
const contact=got.ok?(await got.json()).contact:null;
created=body.contactId;
if(!contact) await fail(`contact ${body.contactId} not readable: ${got.status}`);
const tags=contact.tags||[];
for(const t of ['partial-lead','src-insurance-form','sms-consent-no']) if(!tags.includes(t)) await fail(`missing tag ${t}; tags=${tags.join(',')}`);
if(tags.includes('sms-consent-yes')) await fail(`sms-consent-yes present on a no-consent lead; tags=${tags.join(',')}`);

const del=await fetch(`https://services.leadconnectorhq.com/contacts/${body.contactId}`,{method:'DELETE',headers:H});
if(!del.ok) await fail(`cleanup DELETE -> ${del.status}`);
makeGhlClient; // referenced so a future refactor that renames the client breaks this script loudly
console.log('smoke: OK',{contactId:body.contactId,tags});
