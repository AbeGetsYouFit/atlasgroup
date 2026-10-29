/* Native booking on the GHL calendar: GET /api/slots serves the calendar's open slots for
   the next 3 days (cached per process), POST /api/book creates the appointment on the
   contact that /api/leads already created. GHL failures are logged, never swallowed. */
const DAY_MS=24*60*60*1000;
export const TIMEZONE='America/Detroit';
const CONTACT_ID=/^[A-Za-z0-9]{10,40}$/;

export function makeSlotCache({ghl,calendarId,now=Date.now,ttlMs=60_000,windowDays=3}){
  let days=null, fetchedAt=-Infinity, inflight=null;
  /* One GHL call at a time; a forced refresh inside 10 s of the last fetch reuses the cache (security review #4). */
  function load(){
    if(inflight) return inflight;
    inflight=(async()=>{
      try{
        const start=now();
        const raw=await ghl.freeSlots({calendarId,startMs:start,endMs:start+windowDays*DAY_MS,timezone:TIMEZONE});
        days=Object.keys(raw).sort().map(date=>({date,slots:[...raw[date]].sort()}));
        fetchedAt=now();
        return days;
      } finally { inflight=null; }
    })();
    return inflight;
  }
  return {
    async get(){ if(days&&now()-fetchedAt<ttlMs) return days; return load(); },
    async refresh(){ if(days&&now()-fetchedAt<10_000) return days; return load(); },
    has(startTime){ return !!days&&days.some(d=>d.slots.includes(startTime)); },
    drop(startTime){ if(days) days=days.map(d=>({date:d.date,slots:d.slots.filter(s=>s!==startTime)})); },
  };
}

export function makeSlotsHandler({cache,log=console}){
  return async function handleSlots(_req,res){
    try{ return res.status(200).json({days:await cache.get()}); }
    catch(err){ log.error('slots: GHL free-slots failed',err.status??'',String(err.body??err.message).slice(0,300)); return res.status(502).json({error:'slots-unavailable'}); }
  };
}

import {clientKey,signContact,verifyContactToken,originOk} from './leads.mjs';
export {signContact};
export function makeBookHandler({ghl,cache,calendarId,allow,log=console,secret=''}){
  return async function handleBook(req,res){
    const key=clientKey(req);
    if(!allow(key)){log.warn('book: rate-limited',key);return res.status(429).json({error:'slow down'})}
    const contactId=typeof req.body?.contactId==='string'?req.body.contactId:'';
    const startTime=typeof req.body?.startTime==='string'?req.body.startTime:'';
    if(!CONTACT_ID.test(contactId)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(startTime)) return res.status(400).json({error:'rejected'});
    if(!originOk(req)){log.warn('book: foreign origin',req.get('origin'),key);return res.status(403).json({error:'rejected'})}
    if(secret&&!verifyContactToken(contactId,req.body?.token,secret)){log.warn('book: bad or expired token for',contactId,key);return res.status(403).json({error:'rejected'})}
    let step='free-slots';
    try{
      await cache.get();
      if(!cache.has(startTime)){ await cache.refresh(); if(!cache.has(startTime)) return res.status(409).json({error:'slot-taken'}); }
      step='appointment';
      const {id}=await ghl.createAppointment({calendarId,contactId,startTime,title:'{{contact.name}}'});
      cache.drop(startTime);
      return res.status(201).json({ok:true,appointmentId:id});
    }catch(err){
      log.error(`book: GHL ${step} failed`,err.status??'',String(err.body??err.message).slice(0,300));
      /* 422 is GHL's general validation status; only a body that talks about the slot is a conflict */
      const taken=step==='appointment'&&(err.status===409||(err.status===422&&/slot|availab|busy|booked|taken/i.test(err.body||'')));
      if(taken){cache.drop(startTime);return res.status(409).json({error:'slot-taken'})}
      return res.status(502).json({error:'booking-failed'});
    }
  };
}
