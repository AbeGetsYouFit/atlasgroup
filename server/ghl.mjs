/* Thin GoHighLevel (LeadConnector) REST client. The token never leaves the server.
   Every failure surfaces as GhlError{status, body} so callers can log the real reason;
   nothing here swallows. Cloudflare in front of GHL rejects a bare Node User-Agent
   with error 1010, hence the browser-like UA. */
const BASE='https://services.leadconnectorhq.com';
export const USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AtlasSite/1.0';

export class GhlError extends Error {
  constructor(status,body,path){super(`GHL ${path} -> ${status}: ${body.slice(0,300)}`);this.name='GhlError';this.status=status;this.body=body;this.path=path}
}

export function makeGhlClient({token,locationId,fetch=globalThis.fetch}){
  if(!token||!locationId) throw new Error('makeGhlClient needs token and locationId');
  async function request(method,path,body){
    const init={method,headers:{Authorization:`Bearer ${token}`,Version:'2021-07-28',Accept:'application/json','User-Agent':USER_AGENT}};
    if(body!==undefined){init.headers['Content-Type']='application/json';init.body=JSON.stringify(body)}
    const res=await fetch(BASE+path,init);
    const text=await res.text();
    if(!res.ok) throw new GhlError(res.status,text,path);
    return text?JSON.parse(text):{};
  }
  return {
    async upsertContact({firstName,lastName,email,phone,tags,source='atlasgroupmi.com',dateOfBirth}){
      const payload={locationId,source};
      if(firstName) payload.firstName=firstName;
      if(lastName) payload.lastName=lastName;
      if(email) payload.email=email;
      if(phone) payload.phone='+1'+String(phone).replace(/\D/g,'').slice(-10);
      if(tags?.length) payload.tags=tags;
      if(dateOfBirth) payload.dateOfBirth=dateOfBirth;
      const r=await request('POST','/contacts/upsert',payload);
      return {id:r.contact?.id??r.id,isNew:r.new===true};
    },
    addTags:(contactId,tags)=>request('POST',`/contacts/${contactId}/tags`,{tags}).then(()=>undefined),
    removeTags:(contactId,tags)=>request('DELETE',`/contacts/${contactId}/tags`,{tags}).then(()=>undefined),
    async freeSlots({calendarId,startMs,endMs,timezone}){
      const q=new URLSearchParams({startDate:String(startMs),endDate:String(endMs),timezone});
      const r=await request('GET',`/calendars/${calendarId}/free-slots?${q}`);
      const out={};
      for(const [k,v] of Object.entries(r)) if(v&&Array.isArray(v.slots)) out[k]=v.slots;
      return out;
    },
    async createAppointment({calendarId,contactId,startTime,title}){
      const r=await request('POST','/calendars/events/appointments',{calendarId,locationId,contactId,startTime,title,appointmentStatus:'confirmed'});
      return {id:r.id??r.appointment?.id};
    },
  };
}
