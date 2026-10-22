export const services = ['Real estate','Insurance','Mortgages','Construction','Not sure yet'];
export const mailVars = ['SMTP_HOST','SMTP_USER','SMTP_PASS','INQUIRY_TO','MAIL_FROM'];

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) || /[\r\n]/.test(value.email)) return {error:'Please enter a valid email address.'};
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
function normalisePhone(raw) {
  if (raw === undefined || raw === null || raw === '') return {phone:''};
  if (typeof raw !== 'string' || raw.length > 20) return {error:'Please enter a valid phone number.'};
  if (raw.trim() === '') return {phone:''};
  const digits = raw.replace(/\D/g,'');
  if (digits.length === 11 && digits.startsWith('1')) return {phone:digits.slice(1)};
  if (digits.length !== 10) return {error:'Please enter a valid 10-digit US phone number.'};
  return {phone:digits};
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

export function makeLimiter({max=5,windowMs=15*60*1000}={}) {
  const attempts = new Map();
  return function allow(key,now=Date.now()) {
    for (const [k,v] of attempts) if(now-v.start>windowMs) attempts.delete(k);
    const record=attempts.get(key) || {start:now,count:0};
    record.count++; attempts.set(key,record);
    return record.count<=max;
  };
}
