import {useEffect,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight,LoaderCircle} from 'lucide-react';
import {useLeadCapture} from './leadCapture';
import type {LeadFields} from '../shared/leadPayload.mjs';

/* Step 1 on /book (variant "book") and /start (variant "start"). Captures partials on blur,
   posts the full lead on submit, and hands the GHL contactId to the caller for booking.
   Never blocks: a failed capture still calls onCaptured with null. */
export type LeadFormVariant='book'|'start';
export type LeadFormValues=LeadFields&{firstName?:string;lastName?:string};
const STORAGE_KEY='atlas-lead';
const US_STATES=['MI','OH','IN','IL','WI','FL','TX','GA','NC','PA','NY','NJ','AZ','CA','CO','KY','TN','VA','MN','MO','Other'];
const PURPOSES:[string,string,string][]=[['final-expense','Final Expense','Burial and cremation expenses'],['income-replacement','Income Replacement','The paychecks keep coming'],['mortgage-protection','Mortgage Protection','The house gets paid off'],['other','Something else','Tell your Coordinator on the call']];

function load():LeadFormValues{try{const raw=sessionStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):{}}catch{return {}}}
function save(v:LeadFormValues){try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(v))}catch{/* private mode */}}

export function LeadForm({variant,page,plan='',onCaptured}:{variant:LeadFormVariant;page:'/book'|'/start';plan?:string;onCaptured:(contactId:string|null,fields:LeadFormValues,token:string|null)=>void}){
  const [v,setV]=useState<LeadFormValues>(()=>({veteran:false,policyHolder:false,purpose:'final-expense',state:'MI',...load()}));
  const [busy,setBusy]=useState(false);
  const lead=useLeadCapture({page,stage:'partial'});
  useEffect(()=>{save(v)},[v]);
  const fields=():LeadFields=>({...v,name:variant==='book'?`${v.firstName??''} ${v.lastName??''}`.trim():(v.name??''),plan});
  const set=(k:keyof LeadFormValues)=>(e:{target:{value:string}})=>setV(p=>({...p,[k]:e.target.value}));
  const blur=()=>lead.capture(fields());
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;setBusy(true);
    const f=fields();
    const {contactId,token}=await lead.flushNow(f,variant==='book'?'book':'reachout');
    setBusy(false);onCaptured(contactId??null,v,token??null);
  }
  const consent=<label className="consent lead-consent"><input type="checkbox" required checked={v.consent===true} onChange={e=>{setV(p=>({...p,consent:e.target.checked}));}}/><span>I agree to be contacted by Atlas Insurances LLC about my inquiry. See our <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms</Link>.</span></label>;
  if(variant==='book') return <form className="lead-form" onSubmit={submit} noValidate={false}>
    <div className="lead-pair"><label>First name<input name="first_name" autoComplete="given-name" required maxLength={60} value={v.firstName??''} onChange={set('firstName')} onBlur={blur}/></label><label>Last name<input name="last_name" autoComplete="family-name" required maxLength={60} value={v.lastName??''} onChange={set('lastName')} onBlur={blur}/></label></div>
    <label>Mobile number<input name="phone" autoComplete="tel" type="tel" inputMode="tel" required maxLength={20} placeholder="(313) 555-0100" value={v.phone??''} onChange={set('phone')} onBlur={blur}/><span className="field-help">This is the number your Coordinator calls</span></label>
    <label>Email<input name="email" autoComplete="email" type="email" required maxLength={254} placeholder="you@example.com" value={v.email??''} onChange={set('email')} onBlur={blur}/></label>
    {consent}
    <button className="button lead-submit" type="submit" disabled={busy}>{busy?<>One moment<LoaderCircle className="spinner" size={20}/></>:<>Show available times<ArrowUpRight size={22}/></>}</button>
    <p className="form-note">Step 2: pick a time. Your Coordinator calls you right then.</p>
  </form>;
  return <form className="lead-form" onSubmit={submit}>
    <label>Name<input name="name" autoComplete="name" required maxLength={100} value={v.name??''} onChange={set('name')} onBlur={blur}/></label>
    <div className="lead-pair"><label>Date of birth<input name="dob" autoComplete="bday" type="date" required value={v.dob??''} onChange={set('dob')} onBlur={blur}/></label><label>State<span className="select-wrap"><select name="state" autoComplete="address-level1" required value={v.state??'MI'} onChange={set('state')} onBlur={blur}>{US_STATES.map(s=><option key={s} value={s==='Other'?'':s}>{s==='Other'?'Other':s}</option>)}</select></span></label></div>
    <div className="lead-pair"><label>Mobile number<input name="phone" autoComplete="tel" type="tel" inputMode="tel" required maxLength={20} placeholder="(313) 555-0100" value={v.phone??''} onChange={set('phone')} onBlur={blur}/></label><label><span>Email <span className="optional">(optional)</span></span><input name="email" autoComplete="email" type="email" maxLength={254} placeholder="you@example.com" value={v.email??''} onChange={set('email')} onBlur={blur}/></label></div>
    <div className="lead-pair">
      <div className="lead-toggle"><span>Veteran?</span><div className="toggle-pair" role="group" aria-label="Veteran"><button type="button" className={v.veteran===true?'is-on':''} onClick={()=>setV(p=>({...p,veteran:true}))}>Yes</button><button type="button" className={v.veteran!==true?'is-on':''} onClick={()=>setV(p=>({...p,veteran:false}))}>No</button></div></div>
      <div className="lead-toggle"><span>Current policy holder?</span><div className="toggle-pair" role="group" aria-label="Current policy holder"><button type="button" className={v.policyHolder===true?'is-on':''} onClick={()=>setV(p=>({...p,policyHolder:true}))}>Yes</button><button type="button" className={v.policyHolder!==true?'is-on':''} onClick={()=>setV(p=>({...p,policyHolder:false}))}>No</button></div></div>
    </div>
    <fieldset className="lead-purpose"><legend>Purpose</legend>{PURPOSES.map(([slug,title,sub])=><label key={slug} className={v.purpose===slug?'is-on':''}><input type="radio" name="purpose" value={slug} checked={v.purpose===slug} onChange={()=>setV(p=>({...p,purpose:slug}))}/><span><strong>{title}</strong><small>{sub}</small></span></label>)}</fieldset>
    {consent}
    <button className="button lead-submit" type="submit" disabled={busy}>{busy?<>One moment<LoaderCircle className="spinner" size={20}/></>:<>Have a Coordinator reach out<ArrowUpRight size={22}/></>}</button>
    <p className="form-note">No quote is given on this page. You can pick the time of the call on the next step.</p>
  </form>;
}
