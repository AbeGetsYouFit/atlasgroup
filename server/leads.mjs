import {normalisePhone,emailRe,services} from './inquiries.mjs';
import {slugify} from '../shared/slug.mjs';

export const stages=['partial','book','reachout'];
export const pages={'/':'home-form','/insurance':'insurance-form','/contact':'contact-form','/about':'about-form','/book':'book','/start':'start'};
export const planSlugs=['final-expense','income-replacement','mortgage-protection','whole-life','iul'];
export const purposeSlugs=['final-expense','income-replacement','mortgage-protection','other'];

function str(v,max){return typeof v==='string'?v.trim().slice(0,max):''}

/* Returns {value} | {error} | {skipped:'no-contact-info'}. A lead needs a valid US phone or
   a valid email: name alone can neither be called nor deduped in GHL. Invalid optional
   fields reject (they come from our own forms; a bad value means tampering, not a typo). */
export function validateLead(input){
  if(!input||typeof input!=='object') return {error:'rejected'};
  if(input.website) return {error:'rejected'};
  const stage=str(input.stage,20), page=str(input.page,20);
  if(!stages.includes(stage)) return {error:'unknown stage'};
  if(!(page in pages)) return {error:'unknown page'};
  const {phone,error:phoneError}=normalisePhone(input.phone);
  let email=str(input.email,254).toLowerCase();
  if(email&&(!emailRe.test(email)||/[\r\n]/.test(email))) email='';
  if(!email&&(phoneError||!phone)) return {skipped:'no-contact-info'};
  const name=str(input.name,100).replace(/\s+/g,' ');
  const [firstName='',...rest]=name?name.split(' '):[];
  const service=str(input.service,40); if(service&&!services.includes(service)) return {error:'unknown service'};
  const plan=str(input.plan,40); if(plan&&!planSlugs.includes(plan)) return {error:'unknown plan'};
  const purpose=str(input.purpose,40); if(purpose&&!purposeSlugs.includes(purpose)) return {error:'unknown purpose'};
  const state=str(input.state,20).toLowerCase(); if(state&&!/^[a-z]{2}$/.test(state)) return {error:'bad state'};
  const dateOfBirth=str(input.dateOfBirth,10); if(dateOfBirth&&!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return {error:'bad date of birth'};
  const utmIn=input.utm&&typeof input.utm==='object'?input.utm:{};
  const value={stage,page,firstName,lastName:rest.join(' '),email,phone:phoneError?'':phone,service,plan,purpose,state,dateOfBirth,
    veteran:input.veteran===true?true:input.veteran===false?false:null,
    policyHolder:input.policyHolder===true?true:input.policyHolder===false?false:null,
    wantsCallback:input.wantsCallback===true,
    consent:input.consent===true,
    smsConsent:input.smsConsent===true,
    utm:{source:slugify(str(utmIn.source,80)),campaign:slugify(str(utmIn.campaign,200)),content:slugify(str(utmIn.content,200))}};
  return {value};
}

export function leadTags(v){
  const tags=['partial-lead','src-'+pages[v.page]];
  if(v.service) tags.push('service-'+slugify(v.service));
  if(v.plan) tags.push('plan-'+v.plan);
  if(v.purpose) tags.push('purpose-'+v.purpose);
  if(v.state) tags.push('state-'+v.state);
  if(v.veteran!==null) tags.push(v.veteran?'veteran-yes':'veteran-no');
  if(v.policyHolder!==null) tags.push(v.policyHolder?'policy-yes':'policy-no');
  tags.push(v.smsConsent&&v.phone?'sms-consent-yes':'sms-consent-no');
  if(v.stage==='book') tags.push('reached-calendar');
  if(v.stage==='reachout') tags.push('reachout');
  if(v.wantsCallback) tags.push('wants-callback');
  if(v.utm.source==='meta') tags.push('src-meta');
  if(v.utm.campaign) tags.push('campaign-'+v.utm.campaign);
  if(v.utm.content) tags.push('ad-'+v.utm.content);
  return tags;
}

export function oppositeConsentTag(tags){return tags.includes('sms-consent-yes')?'sms-consent-no':'sms-consent-yes'}

export function captureMode(env){return env.GHL_PIT_TOKEN&&env.GHL_LOCATION_ID?'ghl':'off'}

/* Express handler for POST /api/leads. `mode`: 'ghl' | 'preview' | 'off'. The browser
   ignores the response for partial captures; /start and /book keep contactId for booking.
   Nothing is swallowed: every GHL failure is logged with status + body, every 429 is logged. */
export function makeLeadHandler({ghl,allow,mode,log=console}){
  return async function handleLead(req,res){
    if(req.body?.website) return res.status(400).json({error:'rejected'});
    const key=clientKey(req);
    if(!allow(key)){log.warn('leads: rate-limited',key);return res.status(429).json({error:'slow down'})}
    if(mode==='off') return res.status(503).json({error:'lead capture not configured'});
    const checked=validateLead(req.body);
    if(checked.error) return res.status(400).json({error:checked.error});
    if(checked.skipped) return res.status(202).json({skipped:checked.skipped});
    const value=checked.value, tags=leadTags(value);
    if(mode==='preview'){log.info('leads: preview capture',{...value,tags});return res.status(202).json({preview:true})}
    try{
      const {id}=await ghl.upsertContact({firstName:value.firstName,lastName:value.lastName,email:value.email,phone:value.phone,tags,dateOfBirth:value.dateOfBirth});
      await ghl.removeTags(id,[oppositeConsentTag(tags)]);
      return res.status(201).json({ok:true,contactId:id});
    }catch(err){
      log.error('leads: GHL upsert failed',err.status??'',err.body??err.message);
      return res.status(502).json({ok:false});
    }
  };
}

/* Rate-limit key. atlasgroupmi.com is proxied by Cloudflare in front of Render's proxy, so
   req.ip (one trusted hop) is a Cloudflare edge address that changes per request. Cloudflare
   sets CF-Connecting-IP to the real client; fall back to req.ip when it is absent (local dev). */
export function clientKey(req){return (typeof req.get==='function'&&req.get('cf-connecting-ip'))||req.ip}
