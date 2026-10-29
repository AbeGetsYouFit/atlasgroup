import {useCallback,useEffect,useRef,useState} from 'react';
import {buildLeadPayload,fingerprint,readUtm,type LeadFields,type LeadCtx} from '../shared/leadPayload.mjs';

/* Progressive lead capture. `capture` is called on blur/change and posts to /api/leads
   2 s after the last change, only when the payload is sendable and differs from the last
   one sent. `flushNow` posts immediately (form submits on /book and /start). Every error
   is swallowed on purpose: capture must never slow or block the visitor. */
export type CaptureStage=LeadCtx['stage'];
export function useLeadCapture({page,stage,debounceMs=2000}:{page:string;stage:CaptureStage;debounceMs?:number}){
  const timer=useRef<number|null>(null);
  const lastSent=useRef('');
  const pending=useRef<LeadFields|null>(null);
  const [contactId,setContactId]=useState<string|null>(null);
  const [token,setToken]=useState<string|null>(null);
  const utm=useRef(typeof window==='undefined'?{source:'',campaign:'',content:'',plan:''}:readUtm(window.location.search));

  const post=useCallback(async(fields:LeadFields,extraStage?:CaptureStage):Promise<{contactId?:string;token?:string}>=>{
    const payload=buildLeadPayload(fields,{page,stage:extraStage??stage,utm:utm.current});
    if(!payload) return {};
    const key=fingerprint(payload);
    if(key===lastSent.current) return contactId?{contactId,token:token??undefined}:{};
    lastSent.current=key;
    try{
      const res=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true});
      if(!res.ok) return {};
      const data=await res.json().catch(()=>({}));
      if(typeof data?.contactId==='string'){setContactId(data.contactId);const t=typeof data?.token==='string'?data.token:undefined;if(t)setToken(t);return {contactId:data.contactId,token:t}}
      return {};
    }catch{return {}}
  },[page,stage,contactId,token]);

  const cancel=useCallback(()=>{if(timer.current!==null){window.clearTimeout(timer.current);timer.current=null}pending.current=null},[]);

  const capture=useCallback((fields:LeadFields)=>{
    pending.current=fields;
    if(timer.current!==null) window.clearTimeout(timer.current);
    timer.current=window.setTimeout(()=>{timer.current=null;const f=pending.current;pending.current=null;if(f) void post(f)},debounceMs);
  },[post,debounceMs]);

  const flushNow=useCallback((fields:LeadFields,extraStage?:CaptureStage)=>{cancel();return post(fields,extraStage)},[cancel,post]);

  useEffect(()=>cancel,[cancel]);
  return {capture,flushNow,cancel,contactId,token};
}

export function formFields(form:HTMLFormElement):LeadFields{
  const fd=new FormData(form);
  const s=(k:string)=>{const v=fd.get(k);return typeof v==='string'?v:''};
  return {name:s('name'),email:s('email'),phone:s('phone'),service:s('service'),consent:fd.get('consent')==='on',smsConsent:fd.get('smsConsent')==='on'};
}
