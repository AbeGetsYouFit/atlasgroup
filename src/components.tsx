import { useEffect,useRef,useState,type FormEvent } from 'react';
import {useLeadCapture,formFields} from './leadCapture';
import { Link,useLocation } from 'react-router-dom';
import { ArrowUpRight,ArrowRight,ChevronDown,Menu,X,Check,LoaderCircle } from 'lucide-react';
import {divisions,founder,type Division,asset} from './content';

export function Logo({inverse=false}:{inverse?:boolean}){
 return <img className="logo" src={asset(`/brand/atlas-group-${inverse?'reverse':'primary'}.svg`)} alt="Atlas Group" width="185" height="59"/>;
}
/* Division lockup: same emblem and ATLAS letterforms, the company name replaces GROUP. */
export function Lockup({division,variant='primary',className=''}:{division:Division;variant?:'primary'|'reverse'|'white';className?:string}){
 return <img className={`lockup ${className}`} src={asset(`/brand/atlas-${division.slug}-${variant}.svg`)} alt={division.brand} width="640" height="195"/>;
}
export function TextLink({to,children}:{to:string;children:React.ReactNode}){
 return <Link className="text-link" to={to}>{children}<ArrowRight size={23} strokeWidth={1.5}/></Link>;
}
export function Header(){
 const [open,setOpen]=useState(false),[companiesOpen,setCompaniesOpen]=useState(false);
 const location=useLocation();const wrap=useRef<HTMLElement>(null);const mobileToggle=useRef<HTMLButtonElement>(null);
 useEffect(()=>{setOpen(false);setCompaniesOpen(false)},[location]);
 useEffect(()=>{
  const handle=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);setCompaniesOpen(false);mobileToggle.current?.focus()}};
  const click=(e:MouseEvent)=>{if(!wrap.current?.contains(e.target as Node))setCompaniesOpen(false)};
  document.addEventListener('keydown',handle);document.addEventListener('click',click);
  return()=>{document.removeEventListener('keydown',handle);document.removeEventListener('click',click)};
 },[]);
 return <header className="site-header" ref={wrap}>
  <div className="header-inner"><Link to="/" aria-label="Atlas Group home"><Logo/></Link>
   <nav className="desktop-nav" aria-label="Main navigation">
    <div className="nav-disclosure"><button className="nav-button" aria-expanded={companiesOpen} aria-controls="companies-menu" onClick={()=>setCompaniesOpen(!companiesOpen)}>Our companies<ChevronDown size={15}/></button>
      {companiesOpen&&<div className="services-menu" id="companies-menu">{divisions.map(d=><Link key={d.slug} to={`/${d.slug}`}><span><strong>{d.brand}</strong><small>{d.service} · {d.tagline}</small></span><ArrowUpRight size={20}/></Link>)}</div>}
    </div>
    <Link to="/#approach">Our approach</Link><Link to="/about">About Atlas</Link>
   </nav>
   <Link className="button header-cta" to="/contact">Let’s talk<ArrowUpRight size={19}/></Link>
   <button ref={mobileToggle} className="mobile-toggle" aria-label={open?'Close menu':'Open menu'} aria-expanded={open} aria-controls="mobile-menu" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button>
  </div>
  {open&&<nav className="mobile-nav" id="mobile-menu" aria-label="Mobile navigation">{divisions.map(d=><Link key={d.slug} to={`/${d.slug}`}><span>{d.brand}<small>{d.service}</small></span><ArrowUpRight size={20}/></Link>)}<Link to="/#approach">Our approach</Link><Link to="/about">About Atlas</Link><Link to="/contact">Let’s talk<ArrowUpRight size={20}/></Link></nav>}
 </header>;
}

/* Founder section reused on the homepage and the About page. */
export function Founder({compact=false}:{compact?:boolean}){
 return <section className={`founder-section ${compact?'founder-compact':''}`} id="founder" aria-labelledby="founder-title">
  <div className="container founder-layout">
   <figure className="founder-photo reveal"><img src={asset(`/media/${founder.image}.webp`)} alt={founder.alt} width="1200" height="1400" loading="lazy"/><figcaption><span>{founder.name}</span>{founder.title}</figcaption></figure>
   <div className="founder-content reveal">
    <p className="eyebrow">Meet the broker</p>
    <h2 id="founder-title">“{founder.quote}”</h2>
    <p className="founder-bio">{founder.bio}</p>
    <dl className="credentials">{founder.credentials.map(c=><div key={c.label}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}</dl>
    <p className="credential-note">{founder.credentialNote}</p>
    {compact&&<TextLink to="/about">More about Adam and Atlas</TextLink>}
   </div>
  </div>
 </section>;
}

/* 2×2 grid of the four company lockups. */
export function Companies(){
 return <section className="companies-section section-pad" aria-labelledby="companies-title"><div className="container">
  <div className="section-heading reveal"><div><p className="eyebrow">The Atlas companies</p><h2 id="companies-title">Four companies.<br/>One name you know.</h2></div><p className="section-summary">Each Atlas company is licensed and stands on its own. Together they cover the whole move.</p></div>
  <div className="companies-grid reveal">{divisions.map(d=><Link key={d.slug} to={`/${d.slug}`} className="company-tile"><Lockup division={d}/><span>{d.service}<ArrowRight size={20} strokeWidth={1.5}/></span></Link>)}</div>
 </div></section>;
}

export function Footer(){return <footer className="site-footer"><div className="container">
 <div className="footer-main"><div className="footer-brand"><Link to="/" aria-label="Atlas Group home"><Logo inverse/></Link><p>A clearer way forward.</p></div>
 <div className="footer-links"><p className="label">Our companies</p>{divisions.map(d=><Link key={d.slug} to={`/${d.slug}`}>{d.brand}</Link>)}</div>
 <div className="footer-links"><p className="label">Atlas</p><Link to="/#approach">Our approach</Link><Link to="/about">About Atlas</Link><Link to="/contact">Contact</Link></div></div>
 {/* A2P 10DLC: carriers check that the registered brand's legal name, address, phone and
     email appear on the website. Removing any of these can fail the registration review. */}
 <address className="footer-contact">Atlas Insurances LLC · Dearborn Heights, MI · <a href="tel:+13135130268">(313) 513-0268</a> · <a href="mailto:info@atlasgroupmi.com">info@atlasgroupmi.com</a></address>
 <div className="footer-bottom"><span>Metro Detroit. Serving Michigan.</span><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/accessibility">Accessibility</Link><span>© {new Date().getFullYear()} Atlas Group</span></div></div>
 <p className="image-disclosure">Atlas Properties, Atlas Insurance, Atlas Mortgage, and Atlas Construction are affiliated companies of Atlas Group, the next chapter of Atlas Properties Plus. You are never required to use more than one. Equal Housing Opportunity. Imagery is illustrative and does not depict available listings or completed Atlas projects.</p>
 </div></footer>}

type Config={inquiryMode:'preview'|'email';publicEmail:string;publicPhone:string};
export function ContactSection({initialService='Not sure yet',standalone=false,page='/contact'}:{initialService?:string;standalone?:boolean;page?:'/'|'/insurance'|'/contact'|'/about'}){
 const [config,setConfig]=useState<Config|null>(null),[status,setStatus]=useState<'idle'|'sending'|'success'|'error'>('idle'),[feedback,setFeedback]=useState('');
 const [selected,setSelected]=useState('Not sure yet');
 const formRef=useRef<HTMLFormElement>(null);const statusRef=useRef<HTMLDivElement>(null);
 const lead=useLeadCapture({page,stage:'partial'});
 const captureForm=(e:{currentTarget:EventTarget|null})=>{const f=(e.currentTarget as HTMLElement|null)?.closest('form');if(f)lead.capture(formFields(f as HTMLFormElement))};
 const staticPreview=import.meta.env.VITE_STATIC_PREVIEW==='1';
 useEffect(()=>{if(staticPreview)return;fetch('/api/config').then(r=>r.ok?r.json():Promise.reject()).then(setConfig).catch(()=>setFeedback('The inquiry form is temporarily unavailable. Please try again later.'))},[staticPreview]);
 useEffect(()=>{setSelected(initialService)},[initialService]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();lead.cancel();const fd=new FormData(e.currentTarget);setStatus('sending');setFeedback('');
  try{
   const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:fd.get('name'),email:fd.get('email'),phone:fd.get('phone'),service:fd.get('service'),message:fd.get('message'),consent:fd.get('consent')==='on',smsConsent:fd.get('smsConsent')==='on',website:fd.get('website'),page})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Something went wrong. Please try again.');
   setStatus('success');setFeedback(result.message);
   requestAnimationFrame(()=>statusRef.current?.focus());
  }catch(err){setStatus('error');setFeedback(err instanceof Error?err.message:'Unable to send. Please try again.')}
 }
 return <section className={`contact-section ${standalone?'standalone-contact':''}`} id="contact" aria-labelledby="contact-title"><div className="container contact-layout">
  <div className="contact-intro">{standalone?<h1 id="contact-title">What does your <br/>next chapter <br/>look like?</h1>:<h2 id="contact-title">What does your <br/>next chapter <br/>look like?</h2>}<p>Tell us where you want to go. We will help you find the next step.</p>
   {(config?.publicEmail||config?.publicPhone)&&<div className="contact-details">{config.publicEmail&&<a href={`mailto:${config.publicEmail}`}>{config.publicEmail}</a>}{config.publicPhone&&<a href={`tel:${config.publicPhone.replace(/[^+\d]/g,'')}`}>{config.publicPhone}</a>}</div>}
  </div>
  <div className="form-wrap">{status==='success'?<div className="form-success" ref={statusRef} tabIndex={-1} role="status"><Check size={36} strokeWidth={1.5}/><h3>{config?.inquiryMode==='preview'?'Your preview inquiry is saved.':'Your next chapter starts here.'}</h3><p>{feedback}</p><button className="button button-white" onClick={()=>{setStatus('idle');setFeedback('')}}>Start another inquiry<ArrowRight size={20}/></button></div>:<form ref={formRef} onSubmit={submit}>
   <div className="form-pair"><label>Name<input name="name" autoComplete="name" required maxLength={100} placeholder="Your name" onChange={captureForm}/></label><label>Email<input name="email" autoComplete="email" type="email" required maxLength={254} placeholder="you@example.com" onBlur={captureForm}/></label></div>
   <label>What can we help with?<span className="select-wrap"><select name="service" value={selected} onChange={e=>{setSelected(e.target.value);captureForm(e)}} required>{divisions.map(d=><option key={d.service} value={d.service}>{d.service} — {d.brand}</option>)}<option>Not sure yet</option></select><ChevronDown size={18}/></span></label>
   <label>Your message<textarea name="message" rows={3} required maxLength={3000} placeholder="A little about your plans and timeline…"/></label>
   <div className="honey" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
   <label className="consent"><input type="checkbox" name="consent" required onChange={captureForm}/><span>I agree to be contacted about this inquiry and have read the <Link to="/privacy">privacy notice</Link>.</span></label>
   {/* A2P 10DLC: this checkbox must never be `required`. Carriers reject the
       business registration if SMS opt-in is needed to submit the form. */}
   <label className="consent"><input type="checkbox" name="smsConsent" onChange={captureForm}/><span>I agree to be contacted by Atlas Insurances LLC by call and text message about life insurance services. Consent is optional and is not a condition of purchase. Msg &amp; data rates may apply. Message frequency varies. Reply STOP to unsubscribe or HELP for help. See our <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms</Link>.</span></label>
   <label>Phone <span className="optional">(optional)</span><input name="phone" autoComplete="tel" type="tel" maxLength={20} placeholder="(313) 555-0100" onBlur={captureForm}/><span className="field-help">Optional. Tick the box above if texting is OK.</span></label>
   <button className="button button-white submit-button" type="submit" disabled={!config||status==='sending'}>{status==='sending'?<>Saving your inquiry<LoaderCircle className="spinner" size={20}/></>:<>Start a conversation<ArrowUpRight size={23}/></>}</button>
   <p className="form-note">Please don’t include account numbers, medical details, or other sensitive information.</p>
   {config?.inquiryMode==='preview'&&<p className="preview-note">Website preview: inquiries are saved locally and are not sent to Atlas yet.</p>}
   {staticPreview&&<p className="preview-note">Design preview: this form is not connected yet. Inquiries will be delivered once the site launches.</p>}
   {feedback&&<p className="form-error" role="alert">{feedback}</p>}
  </form>}</div>
 </div></section>;
}
