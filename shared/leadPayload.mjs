/* Shared by the browser (via Vite) and node tests. Builds the body for POST /api/leads from
   raw form values. Returns null until the visitor has typed a usable phone or email, so
   the browser never sends a request that the server would only skip. */
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits=v=>String(v??'').replace(/\D/g,'');
const tenDigits=v=>{const d=digits(v);return d.length===11&&d.startsWith('1')?d.slice(1):d.length===10?d:''};
const text=v=>typeof v==='string'?v.trim():'';
const tri=v=>v===true?true:v===false?false:undefined;

export function buildLeadPayload(fields={},ctx={}){
  const phone=tenDigits(fields.phone);
  const email=text(fields.email).toLowerCase();
  if(!phone&&!EMAIL.test(email)) return null;
  const utm=ctx.utm||{};
  const p={stage:ctx.stage,page:ctx.page,name:text(fields.name),phone,email:EMAIL.test(email)?email:'',
    service:text(fields.service),plan:text(fields.plan)||text(utm.plan),purpose:text(fields.purpose),state:text(fields.state),
    dateOfBirth:text(fields.dob||fields.dateOfBirth),consent:fields.consent===true,smsConsent:fields.smsConsent===true,
    utm:{source:text(utm.source),campaign:text(utm.campaign),content:text(utm.content)}};
  const veteran=tri(fields.veteran),policyHolder=tri(fields.policyHolder);
  if(veteran!==undefined) p.veteran=veteran;
  if(policyHolder!==undefined) p.policyHolder=policyHolder;
  if(fields.wantsCallback===true) p.wantsCallback=true;
  return p;
}

export function fingerprint(payload){
  if(!payload) return '';
  const sortKeys=o=>Array.isArray(o)?o.map(sortKeys):o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,sortKeys(o[k])])):o;
  return JSON.stringify(sortKeys(payload));
}

export function readUtm(search){
  const q=new URLSearchParams(search||'');
  const get=k=>(q.get(k)||'').trim().slice(0,200);
  return {source:get('utm_source'),campaign:get('utm_campaign'),content:get('utm_content'),plan:get('plan')};
}
