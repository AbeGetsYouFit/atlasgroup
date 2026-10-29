import {useCallback,useEffect,useState} from 'react';
import {LoaderCircle} from 'lucide-react';

/* Native time picker on the GHL calendar: reads /api/slots, books through /api/book on the
   contact step 1 created. A taken slot (409) refreshes the list and says so; nothing is
   reported as booked unless the server answered 201. */
type Day={date:string;slots:string[]};
const PHONE='(313) 513-0268';
const tz='America/Detroit';
const dayLabel=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
const timeLabel=(iso:string)=>new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:tz});

export function TimePicker({contactId,onBooked}:{contactId:string|null;onBooked:(appointmentId:string,startTime:string)=>void}){
  const [days,setDays]=useState<Day[]|null>(null);
  const [state,setState]=useState<'loading'|'ready'|'unavailable'>('loading');
  const [day,setDay]=useState(0);
  const [pick,setPick]=useState('');
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState('');
  const load=useCallback(async()=>{
    setState('loading');
    try{const r=await fetch('/api/slots');if(!r.ok)throw new Error(String(r.status));const data=await r.json();const ds=(data.days as Day[]).filter(d=>d.slots.length);setDays(ds);setDay(0);setState(ds.length?'ready':'unavailable')}
    catch{setDays(null);setState('unavailable')}
  },[]);
  useEffect(()=>{void load()},[load]);
  async function book(){
    if(!contactId||!pick||busy)return;setBusy(true);setNote('');
    try{
      const r=await fetch('/api/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contactId,startTime:pick})});
      const data=await r.json().catch(()=>({}));
      if(r.status===201&&data.ok){onBooked(data.appointmentId,pick);return}
      if(r.status===409){setNote('That time just went. Pick another.');setPick('');await load();return}
      setNote(`We couldn't book that. Call or text ${PHONE} and we'll set it up.`);
    }catch{setNote(`We couldn't book that. Call or text ${PHONE} and we'll set it up.`)}
    finally{setBusy(false)}
  }
  if(state==='loading') return <div className="time-picker time-picker-state"><LoaderCircle className="spinner" size={22}/><p>Finding open times</p></div>;
  if(state==='unavailable'||!days) return <div className="time-picker time-picker-state"><p>Times aren't loading right now. Call or text <strong>{PHONE}</strong> and we'll set it up, or wait for your Coordinator's call.</p></div>;
  const cur=days[day];
  return <div className="time-picker">
    <div className="time-days" role="tablist">{days.map((d,i)=><button key={d.date} type="button" role="tab" aria-selected={i===day} className={i===day?'is-on':''} onClick={()=>{setDay(i);setPick('')}}>{dayLabel(d.date)}</button>)}</div>
    <div className="time-grid">{cur.slots.map(s=><button key={s} type="button" className={pick===s?'time-slot is-on':'time-slot'} onClick={()=>setPick(s)}>{timeLabel(s)}</button>)}</div>
    <p className="time-meta">Times shown in Eastern. 30 minutes, by phone.</p>
    {note&&<p className="form-error" role="alert">{note}</p>}
    {contactId
      ?<button type="button" className="button lead-submit" disabled={!pick||busy} onClick={book}>{busy?<>Booking<LoaderCircle className="spinner" size={20}/></>:pick?`Book my call for ${timeLabel(pick)}`:'Pick a time'}</button>
      :<p className="form-error" role="alert">We couldn't save your details. Call or text <strong>{PHONE}</strong> and we'll book it for you.</p>}
  </div>;
}
