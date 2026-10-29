import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Check} from 'lucide-react';
import {LeadForm,type LeadFormValues} from './LeadForm';
import {TimePicker} from './TimePicker';
import {useLeadCapture} from './leadCapture';
import {asset} from './content';

/* Ad landing page. Lead first, booking second (Abe 10-29). The page is the hero and the
   form, then a footer; nothing else. No licence number anywhere. Carrier strip and the
   "top 100" line share the SHOW_CARRIERS gate with /insurance. */
export const SHOW_START_CARRIERS=true;
const carriers:[string,string][]=[['mutual-of-omaha.png','Mutual of Omaha'],['aig.png','AIG'],['transamerica.png','Transamerica'],['gerber.png','Gerber Life'],['foresters.png','Foresters Financial'],['americo.png','Americo'],['aetna.svg','Aetna'],['prosperity.png','Prosperity Life'],['royal-neighbors.png','Royal Neighbors of America'],['american-amicable.png','American Amicable']];
const PHONE='(313) 513-0268';
declare global{interface Window{fbq?:(...args:unknown[])=>void}}
const track=(event:string)=>{try{window.fbq?.('track',event)}catch{/* pixel absent */}};

export function StartPage(){
  const [step,setStep]=useState<'form'|'next'|'booked'|'wait'>('form');
  const [contactId,setContactId]=useState<string|null>(null);
  const [fields,setFields]=useState<LeadFormValues>({});
  const [when,setWhen]=useState('');
  const lead=useLeadCapture({page:'/start',stage:'reachout'});
  const first=(fields.name??'').trim().split(/\s+/)[0]||'';
  useEffect(()=>{if(step!=='form')document.querySelector('.start-card')?.scrollIntoView({block:'start',behavior:'smooth'})},[step]);
  async function wait(){await lead.flushNow({...fields,wantsCallback:true},'reachout');setStep('wait')}
  return <>
    <div className="start-bar"><img src="/brand/atlas-insurance-primary.svg" alt="Atlas Insurance" className="start-logo"/><a href="#start-form" className="start-phone">Questions? <strong>{PHONE}</strong></a></div>
    <section className="ins-hero start-hero">
      <video className="ins-hero-film" src={asset('/media/atlas-hero.mp4')} autoPlay muted loop playsInline aria-hidden="true"/><div className="ins-hero-veil"/>
      <div className="container start-grid">
        <div className="start-copy">
          <h1>Coverage tied to your circumstances, not a one-size policy</h1>
          <p className="ins-lead">{SHOW_START_CARRIERS?'Contracted with the top 100 A+ rated carriers. ':''}We match one carrier to your personal situation and tell you the number.</p>
          <ul className="start-points">
            {SHOW_START_CARRIERS&&<li><Check size={20} aria-hidden="true"/>Top 100 A+ rated carriers, one fit for you</li>}
            <li><Check size={20} aria-hidden="true"/>No medical exam options</li>
            <li><Check size={20} aria-hidden="true"/>Nothing signed on this page, nothing to download</li>
          </ul>
          <div className="start-seals">
            {SHOW_START_CARRIERS&&<div className="start-seal"><span className="seal-mark">A+</span><span><small>Independent agency</small>Top 100 A+ rated carriers</span></div>}
            <div className="start-seal"><span className="seal-mark seal-x" aria-hidden="true"/><span><small>No medical exam</small>Options with a few simple questions</span></div>
          </div>
          {SHOW_START_CARRIERS&&<div className="start-carriers"><p>Appointed with the top 100 A+ rated carriers, including</p><div className="start-carrier-row">{carriers.map(([f,n])=><span key={f} className="start-carrier"><img src={asset(`/carriers/${f}`)} alt={n} loading="lazy"/></span>)}<span className="start-carrier start-carrier-more">+ 90 more</span></div></div>}
        </div>
        <div className="start-card" id="start-form">
          {step==='form'&&<><p className="book-step">Takes about a minute</p><h2>Tell us a little about you</h2><p className="start-promise">A licensed Atlas Benefits Coordinator will reach out, match the carrier to your situation, and give you your number.</p>
            <LeadForm variant="start" page="/start" onCaptured={(id,f)=>{setContactId(id);setFields(f);if(id)track('Lead');setStep('next')}}/></>}
          {step==='next'&&<><p className="book-step start-sent">Sent</p><h2>Thanks{first?`, ${first}`:''}. A Coordinator will reach out</h2>
            <p className="start-promise">A licensed Atlas Benefits Coordinator will call you at <strong>{fields.phone}</strong> within one business day, match the carrier to your situation, and give you your number.</p>
            <p className="start-prefer">Prefer to pick the exact time? Choose one and that's when we call.</p>
            <TimePicker contactId={contactId} onBooked={(_id,start)=>{setWhen(start);track('Schedule');setStep('booked')}}/>
            <div className="start-or"><span/><em>or</em><span/></div>
            <button type="button" className="start-wait" onClick={wait}>I'll wait for the Coordinator's call</button>
            <p className="form-note">Either way, you're on the list. Save {PHONE} so you know it's us.</p></>}
          {step==='booked'&&<div className="book-done" role="status"><Check size={36} strokeWidth={1.5}/><h2>You're all set</h2><p>A licensed Atlas Benefits Coordinator will call you at {new Date(when).toLocaleString('en-US',{weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Detroit'})} Eastern. A confirmation text and email are on their way. Need to change the time? Call or text {PHONE}.</p></div>}
          {step==='wait'&&<div className="book-done" role="status"><Check size={36} strokeWidth={1.5}/><h2>You're on the list</h2><p>A licensed Atlas Benefits Coordinator will call you at {fields.phone} within one business day. Save {PHONE} so you know it's us.</p></div>}
        </div>
      </div>
    </section>
    <footer className="start-foot"><span>Atlas Insurances LLC · {PHONE} · info@atlasgroupmi.com</span><span><Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> · <Link to="/accessibility">Accessibility</Link> · © 2026 Atlas Group</span></footer>
  </>;
}
