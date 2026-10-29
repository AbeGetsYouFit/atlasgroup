/* Native booking on the GHL calendar: GET /api/slots serves the calendar's open slots for
   the next 3 days (cached per process), POST /api/book creates the appointment on the
   contact that /api/leads already created. GHL failures are logged, never swallowed. */
const DAY_MS=24*60*60*1000;
export const TIMEZONE='America/Detroit';
const CONTACT_ID=/^[A-Za-z0-9]{10,40}$/;

export function makeSlotCache({ghl,calendarId,now=Date.now,ttlMs=60_000,windowDays=3}){
  let days=null, fetchedAt=-Infinity;
  async function refresh(){
    const start=now();
    const raw=await ghl.freeSlots({calendarId,startMs:start,endMs:start+windowDays*DAY_MS,timezone:TIMEZONE});
    days=Object.keys(raw).sort().map(date=>({date,slots:[...raw[date]].sort()}));
    fetchedAt=now();
    return days;
  }
  return {
    async get(){ if(days&&now()-fetchedAt<ttlMs) return days; return refresh(); },
    refresh,
    has(startTime){ return !!days&&days.some(d=>d.slots.includes(startTime)); },
    drop(startTime){ if(days) days=days.map(d=>({date:d.date,slots:d.slots.filter(s=>s!==startTime)})); },
  };
}

export function makeSlotsHandler({cache,log=console}){
  return async function handleSlots(_req,res){
    try{ return res.status(200).json({days:await cache.get()}); }
    catch(err){ log.error('slots: GHL free-slots failed',err.status??'',err.body??err.message); return res.status(502).json({error:'slots-unavailable'}); }
  };
}

export function makeBookHandler({ghl,cache,calendarId,allow,log=console}){
  return async function handleBook(req,res){
    if(!allow(req.ip)){log.warn('book: rate-limited',req.ip);return res.status(429).json({error:'slow down'})}
    const contactId=typeof req.body?.contactId==='string'?req.body.contactId:'';
    const startTime=typeof req.body?.startTime==='string'?req.body.startTime:'';
    if(!CONTACT_ID.test(contactId)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(startTime)) return res.status(400).json({error:'rejected'});
    try{
      await cache.get();
      if(!cache.has(startTime)){ await cache.refresh(); if(!cache.has(startTime)) return res.status(409).json({error:'slot-taken'}); }
      const {id}=await ghl.createAppointment({calendarId,contactId,startTime,title:'{{contact.name}}'});
      cache.drop(startTime);
      return res.status(201).json({ok:true,appointmentId:id});
    }catch(err){
      log.error('book: GHL appointment failed',err.status??'',err.body??err.message);
      if(err.status>=400&&err.status<500) return res.status(409).json({error:'slot-taken'});
      return res.status(502).json({error:'booking-failed'});
    }
  };
}
