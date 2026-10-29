import {normalisePhone,emailRe,services} from './inquiries.mjs';
import {slugify} from '../shared/slug.mjs';
import {BlockList} from 'node:net';
import {createHmac,timingSafeEqual} from 'node:crypto';

export const stages=['partial','book','reachout'];
export const pages={'/':'home-form','/insurance':'insurance-form','/contact':'contact-form','/about':'about-form','/book':'book','/start':'start'};
export const planSlugs=['final-expense','income-replacement','mortgage-protection','whole-life','iul'];
export const purposeSlugs=['final-expense','income-replacement','mortgage-protection','other'];

function str(v,max){return typeof v==='string'?v.trim().slice(0,max):''}
function isRealDob(s){ if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d=new Date(s+'T00:00:00Z'); if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s) return false; const y=d.getUTCFullYear(); return y>=1900&&d.getTime()<=Date.now(); }

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
  /* plan/purpose ride in from the ad URL, not only our form: a bad value drops the field, never the lead. */
  let plan=str(input.plan,40); if(!planSlugs.includes(plan)) plan='';
  let purpose=str(input.purpose,40); if(!purposeSlugs.includes(purpose)) purpose='';
  const state=str(input.state,20).toLowerCase(); if(state&&!/^[a-z]{2}$/.test(state)) return {error:'bad state'};
  const dateOfBirth=str(input.dateOfBirth,10); if(dateOfBirth&&!isRealDob(dateOfBirth)) return {error:'bad date of birth'};
  const utmIn=input.utm&&typeof input.utm==='object'?input.utm:{};
  const value={stage,page,firstName,lastName:rest.join(' '),email,phone:phoneError?'':phone,service,plan,purpose,state,dateOfBirth,
    veteran:input.veteran===true?true:input.veteran===false?false:null,
    policyHolder:input.policyHolder===true?true:input.policyHolder===false?false:null,
    wantsCallback:input.wantsCallback===true,
    consent:input.consent===true,
    /* SMS consent only counts alongside the general consent in the same payload (security review #1) */
    smsConsent:input.smsConsent===true&&input.consent===true,
    utm:{source:slugify(str(utmIn.source,80)),campaign:slugify(str(utmIn.campaign,200)),content:slugify(str(utmIn.content,200))}};
  return {value};
}

export function leadTags(v){
  const tags=[v.stage==='reachout'?'lead':'partial-lead','src-'+pages[v.page]];
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

import {oppositeConsentTag} from '../shared/consent.mjs';
export {oppositeConsentTag};

export function captureMode(env){return env.GHL_PIT_TOKEN&&env.GHL_LOCATION_ID?'ghl':'off'}

/* Express handler for POST /api/leads. `mode`: 'ghl' | 'preview' | 'off'. The browser
   ignores the response for partial captures; /start and /book keep contactId for booking.
   Nothing is swallowed: every GHL failure is logged with status + body, every 429 is logged. */
export const TOKEN_TTL_MS=60*60*1000;
/* Booking token: HMAC over `${contactId}.${exp}`; one hour; compared constant-time. */
export function signContact(contactId,secret,issuedAt=Date.now()){
  const exp=issuedAt+TOKEN_TTL_MS;
  const mac=createHmac('sha256',secret).update(`${contactId}.${exp}`).digest('base64url');
  return `${exp}.${mac}`;
}
export function verifyContactToken(contactId,token,secret,now=Date.now()){
  if(typeof token!=='string') return false;
  const dot=token.indexOf('.'); if(dot<1) return false;
  const exp=Number(token.slice(0,dot)); if(!Number.isFinite(exp)||exp<now) return false;
  const expected=createHmac('sha256',secret).update(`${contactId}.${exp}`).digest('base64url');
  const given=token.slice(dot+1);
  if(given.length!==expected.length) return false;
  return timingSafeEqual(Buffer.from(given),Buffer.from(expected));
}
/* Same-site check, mirroring /api/inquiries: a browser Origin that is neither this host nor PUBLIC_ORIGIN is refused. */
export function originOk(req,publicOrigin=process.env.PUBLIC_ORIGIN){
  const origin=typeof req.get==='function'?req.get('origin'):undefined;
  if(!origin) return true;
  const self=`${req.protocol}://${typeof req.get==='function'?req.get('host'):''}`;
  return origin===self||(!!publicOrigin&&origin===publicOrigin);
}

export function makeLeadHandler({ghl,allow,mode,log=console,secret=''}){
  return async function handleLead(req,res){
    if(req.body?.website) return res.status(400).json({error:'rejected'});
    const key=clientKey(req);
    if(!originOk(req)){log.warn('leads: foreign origin',req.get('origin'),key);return res.status(403).json({error:'Please submit through the Atlas website.'})}
    if(!allow(key)){log.warn('leads: rate-limited',key);return res.status(429).json({error:'slow down'})}
    if(mode==='off'){log.error('leads: capture OFF, dropped lead from',req.body?.page??'?');return res.status(503).json({error:'lead capture not configured'})}
    const checked=validateLead(req.body);
    if(checked.error){log.warn('leads: rejected',checked.error,req.body?.page);return res.status(400).json({error:checked.error})}
    if(checked.skipped) return res.status(202).json({skipped:checked.skipped});
    const value=checked.value, tags=leadTags(value);
    if(mode==='preview'){log.info('leads: preview capture',{...value,tags});return res.status(202).json({preview:true})}
    let id;
    try{
      ({id}=await ghl.upsertContact({firstName:value.firstName,lastName:value.lastName,email:value.email,phone:value.phone,tags,dateOfBirth:value.dateOfBirth}));
    }catch(err){
      log.error('leads: GHL upsert failed',err.status??'',String(err.body??err.message).slice(0,300));
      return res.status(502).json({ok:false});
    }
    try{
      const drop=[oppositeConsentTag(tags)]; if(value.stage==='reachout') drop.push('partial-lead');
      await ghl.removeTags(id,drop);
    }catch(err){
      /* the contact exists; the visitor and the booking step must not be told otherwise */
      log.error('leads: GHL tag cleanup failed',id,err.status??'',String(err.body??err.message).slice(0,300));
    }
    const out={ok:true,contactId:id}; if(secret) out.token=signContact(id,secret);
    return res.status(201).json(out);
  };
}

/* Rate-limit key. atlasgroupmi.com is proxied by Cloudflare in front of Render's proxy, so
   req.ip (one trusted hop) is a Cloudflare edge address that changes per request. Cloudflare
   sets CF-Connecting-IP to the real client; fall back to req.ip when it is absent (local dev). */
/* Cloudflare's published egress ranges (https://www.cloudflare.com/ips/). The header is only trusted
   when the connecting hop really is Cloudflare; a direct hit on the Render origin cannot forge it. */
const CF_RANGES=['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32'];
const cf=new BlockList();
for(const r of CF_RANGES){const [ip,bits]=r.split('/');cf.addSubnet(ip,Number(bits),ip.includes(':')?'ipv6':'ipv4')}
export function isCloudflare(ip){if(!ip) return false;const v=String(ip).replace(/^::ffff:/,'');try{return cf.check(v,v.includes(':')?'ipv6':'ipv4')}catch{return false}}
/* IPv6 clients get a fresh address per connection inside their /64; key on the prefix. */
function foldIp(ip){
  if(!ip) return ip;
  const v=String(ip).replace(/^::ffff:/,'');
  if(!v.includes(':')) return v;
  const [head,tail='']=v.split('::');
  const h=head?head.split(':'):[], t=tail?tail.split(':'):[];
  const groups=[...h,...Array(Math.max(0,8-h.length-t.length)).fill('0'),...t].slice(0,8).map(g=>g.toLowerCase().replace(/^0+(?=.)/,''));
  return groups.slice(0,4).join(':')+'::/64';
}
export function clientKey(req){
  const hdr=typeof req.get==='function'?req.get('cf-connecting-ip'):undefined;
  return foldIp((hdr&&isCloudflare(req.ip))?hdr:req.ip);
}
