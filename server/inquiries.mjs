export const services = ['Real estate','Insurance','Mortgages','Construction','Not sure yet'];
export const mailVars = ['SMTP_HOST','SMTP_USER','SMTP_PASS','INQUIRY_TO','MAIL_FROM'];
export const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* A2P 10DLC: SMS consent is always optional. `consent` stays required — it is the
   general "contact me about this inquiry" consent, not permission to text. Carriers
   reject the registration if SMS opt-in is needed to submit the form. */
export function validateInquiry(input) {
  const value = {};
  for (const [key, limit] of Object.entries({name:100,email:254,service:40,message:3000})) {
    if (typeof input?.[key] !== 'string') return {error:'Please complete all required fields.'};
    value[key] = input[key].trim();
    if (!value[key] || value[key].length > limit) return {error:'Please check the length of your '+key+'.'};
  }
  if (!emailRe.test(value.email) || /[\r\n]/.test(value.email)) return {error:'Please enter a valid email address.'};
  if (!services.includes(value.service)) return {error:'Please choose a service.'};
  if (input.consent !== true) return {error:'Please agree to be contacted about this inquiry.'};
  const {phone,error} = normalisePhone(input.phone);
  if (error) return {error};
  value.phone = phone;
  value.smsConsent = input.smsConsent === true && phone !== '';
  return {value};
}

/* US ten-digit numbers only; Atlas is licensed in Michigan and the A2P campaign
   is US-only, so an international number cannot be texted under it. */
export function normalisePhone(raw) {
  if (raw === undefined || raw === null || raw === '') return {phone:''};
  if (typeof raw !== 'string' || raw.length > 20) return {error:'Please enter a valid phone number.'};
  if (raw.trim() === '') return {phone:''};
  const digits = raw.replace(/\D/g,'');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  /* NANP: area code and exchange never start with 0 or 1. */
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return {error:'Please enter a valid 10-digit US phone number.'};
  return {phone:ten};
}

/* Production must not silently fall back to filing inquiries on disk: a real lead
   would be told it was not sent while nobody reads the folder. Fail at boot instead. */
export function assertMailConfigured(env) {
  const missing = mailVars.filter(key => !env[key]);
  if (env.NODE_ENV === 'production' && missing.length) {
    throw new Error(`Refusing to start: mail delivery is not configured. Missing ${missing.join(', ')}. Set every one of ${mailVars.join(', ')} or do not run with NODE_ENV=production.`);
  }
  return missing.length === 0;
}

export function makeLimiter({max=5,windowMs=15*60*1000,maxKeys=5000}={}) {
  const attempts = new Map();
  return function allow(key,now=Date.now()) {
    for (const [k,v] of attempts) if(now-v.start>windowMs) attempts.delete(k);
    while (attempts.size >= maxKeys) attempts.delete(attempts.keys().next().value); /* evict oldest */
    const record=attempts.get(key) || {start:now,count:0};
    record.count++; attempts.set(key,record);
    return record.count<=max;
  };
}

/* After an inquiry email was accepted, mirror it into GHL and clear the partial state.
   Never throws: the visitor already got their success response from the mail path. */
const pageSlugs={'/':'home-form','/insurance':'insurance-form','/contact':'contact-form','/about':'about-form'};
export async function completeInquiry({ghl,value,log=console}) {
  try {
    const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    const tags=['lead','inquiry-complete','src-'+(pageSlugs[value.page]||'contact-form'),'service-'+slug(value.service),value.smsConsent&&value.phone?'sms-consent-yes':'sms-consent-no'];
    const [firstName='',...rest]=String(value.name).trim().split(/\s+/);
    const {id}=await ghl.upsertContact({firstName,lastName:rest.join(' '),email:value.email,phone:value.phone,tags});
    await ghl.removeTags(id,['partial-lead']);
  } catch (err) {
    log.error('inquiries: GHL completion failed',err.status??'',err.body??err.message);
  }
}
