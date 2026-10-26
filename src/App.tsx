import { useEffect,useRef,useState } from 'react';
import { Link,Navigate,Route,Routes,useLocation,useParams,useSearchParams } from 'react-router-dom';
import { ArrowRight,ArrowUpRight,Pause,Play,Plus,Minus } from 'lucide-react';
import {Companies,ContactSection,Footer,Founder,Header,Lockup,TextLink} from './components';
import {divisions,founder,legacyRoutes,steps,asset} from './content';

export const pageTitles:Record<string,string>={'/about':'About Atlas','/contact':'Let’s talk','/book':'Book your Atlas call','/privacy':'Privacy','/terms':'Terms','/accessibility':'Accessibility','/404':'Page not found'};
export function pageMeta(rawPathname:string){
 const pathname=rawPathname.replace(/\/+$/,'')||'/'; // static hosts serve /mortgage/ with a trailing slash
 const division=divisions.find(d=>'/'+d.slug===pathname);
 if(division)return {title:`${division.brand} — ${division.service} in Metro Detroit | Atlas Group`,description:division.intro};
 const title=pageTitles[pathname]||(pathname==='/'?'':'Page not found');
 return {title:title?`${title} — Atlas Group`:'Atlas Group — Your next chapter. Built together.',description:'Atlas Properties, Atlas Insurance, Atlas Mortgage, and Atlas Construction. Real estate, insurance, mortgages, and construction connected around you in Metro Detroit and across Michigan.'};
}

function PageEffects(){
 const {pathname,hash}=useLocation();
 useEffect(()=>{
   const {title,description}=pageMeta(pathname);
   document.title=title;
   document.querySelector('meta[name="description"]')?.setAttribute('content',description);
   if(hash)requestAnimationFrame(()=>document.getElementById(hash.slice(1))?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
   else window.scrollTo(0,0);
 },[pathname,hash]);
 useEffect(()=>{
   const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target)}}),{threshold:.12});
   document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
   return()=>observer.disconnect();
 },[pathname]);
 return null;
}

function Hero(){
 const video=useRef<HTMLVideoElement>(null);const [playing,setPlaying]=useState(false),[available,setAvailable]=useState(true);
 useEffect(()=>{
   const mq=matchMedia('(prefers-reduced-motion: reduce)');
   const load=()=>{if(mq.matches){video.current?.pause();return}video.current?.play().catch(()=>{})};
   load();mq.addEventListener('change',load);return()=>mq.removeEventListener('change',load);
 },[]);
 async function toggle(){if(!video.current)return;if(video.current.paused){await video.current.play().catch(()=>setAvailable(false))}else video.current.pause()}
 return <section className="hero" aria-labelledby="home-title">
  <img className="hero-still" src={asset("/media/hero-home.webp")} alt="" fetchPriority="high"/>
  {available&&<video className="hero-video" ref={video} src={asset("/media/hero-motion.mp4")} poster={asset("/media/hero-home.webp")} muted playsInline loop preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>setAvailable(false)} aria-hidden="true"/>}
  <div className="hero-shade"/>
  <div className="hero-content container"><h1 id="home-title"><span>Your next </span><span>chapter. </span><span>Built together.</span></h1><p>Real estate, insurance, mortgages,<br className="desktop-break"/> and construction. Connected around you.</p><Link className="button hero-button" to="/#services">Find your next step<ArrowUpRight size={25} strokeWidth={1.5}/></Link></div>
  <div className="hero-bottom"><span>Rooted in Michigan. Looking forward.</span>{available&&<button className="video-toggle" onClick={toggle} aria-label={playing?'Pause background video':'Play background video'}>{playing?<Pause size={20}/>:<Play size={20}/>}</button>}</div>
 </section>;
}
function ServiceRail(){return <nav className="service-rail" aria-label="The Atlas companies">{divisions.map(d=><Link key={d.slug} to={'/'+d.slug}><span className="rail-label">{d.brand}<small>{d.service}</small></span><ArrowRight strokeWidth={1.35}/></Link>)}</nav>}
function ServiceExplorer(){
 const [active,setActive]=useState(0);const division=divisions[active];
 return <section id="services" className="service-section section-pad" aria-labelledby="services-title"><div className="container">
  <div className="section-heading reveal"><div><p className="eyebrow">The Atlas companies</p><h2 id="services-title">One relationship.<br/>More possibilities.</h2></div><p className="section-summary">Four licensed Atlas companies, one family, one standard of care. Start with the one you need; the rest are there when you want them.</p></div>
  <div className="service-explorer reveal"><div className="service-list">{divisions.map((d,i)=><div className={`service-row ${active===i?'active':''}`} key={d.slug}>
   <button onClick={()=>setActive(i)} aria-expanded={active===i} aria-controls={`panel-${d.slug}`}><span className="service-number">{d.number}</span><span>{d.brand}</span>{active===i?<Minus strokeWidth={1.5}/>:<ArrowRight strokeWidth={1.5}/>}</button>
   {active===i&&<div className="service-panel" id={`panel-${d.slug}`}><p>{d.service}. {d.tagline}</p><TextLink to={'/'+d.slug}>Explore {d.brand}</TextLink></div>}
  </div>)}</div><div className="service-image"><img key={division.image} src={asset(`/media/${division.image}.webp`)} alt={division.alt} loading="lazy" width="1000" height="1000"/></div></div>
 </div></section>;
}
function Approach(){return <section className="approach-section" id="approach" aria-labelledby="approach-title"><div className="approach-image"><img src={asset("/media/neighborhood.webp")} width="800" height="1100" alt="Illustrative leafy Michigan street with brick homes and welcoming porches" loading="lazy"/></div><div className="approach-content reveal"><p className="eyebrow">Our approach</p><h2 id="approach-title">Forward thinking.<br/>Michigan grounded.</h2><p className="approach-intro">Atlas brings property, protection, financing, and building into one conversation, with a Michigan license behind each one. Local experience. A clearer way forward.</p><ol className="steps">{steps.map((step,i)=><li key={step.title}><span className="step-number">0{i+1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol><TextLink to="/about">Meet Atlas</TextLink></div></section>}
function Home(){return <><Hero/><ServiceRail/><ServiceExplorer/><Approach/><Founder compact/><ContactSection/></>}

/* Carrier strip stays off until the lineup is verified against Adam's appointment list
   and each carrier's logo-use rules; switched on 2026-10-25 at the owner’s direction; adjust the lineup when that list is confirmed. */
const SHOW_CARRIERS=true;
const carriers:[string,string][]=[['mutual-of-omaha.png','Mutual of Omaha'],['aig.png','AIG'],['transamerica.png','Transamerica'],['gerber.png','Gerber Life'],['foresters.png','Foresters Financial'],['americo.png','Americo'],['aetna.svg','Aetna'],['prosperity.png','Prosperity Life'],['royal-neighbors.png','Royal Neighbors of America'],['american-amicable.png','American Amicable']];
const protections=[
 {tag:'No medical exam options',title:'Final Expense',who:'Ease the goodbye',body:'Smaller, permanent protection sized to funeral and end-of-life costs, so grief never comes with a bill. Simple health questions — many options skip the medical exam entirely.'},
 {tag:'Most affordable',title:'Income Replacement Coverage',who:'Keep the paychecks coming',body:'If your family runs on your income, this keeps it running — groceries, tuition, daily life — for the years they’d need it most. The most protection for the lowest cost during your working years.'},
 {tag:'Keeps the home',title:'Mortgage Protection Assurance',who:'The roof stays over their heads',body:'Protection matched to your mortgage, so if something happens to you, the house gets paid off — and your family keeps their home, not a payment book.'},
 {tag:'Never expires',title:'Lifetime Legacy',who:'Leave something behind, guaranteed',body:'Permanent protection with a payout whenever that day comes, payments that never rise, and a value that quietly grows over time — something you can even borrow against in life.'},
 {tag:'Protect & grow',title:'Lifetime Legacy + Growth',who:'Cover today, build for tomorrow',body:'Flexible, permanent protection that also builds a cash value tied to a market index — growth potential with downside limits. For people thinking about protection and the long game together.'},
];
const insFaq=[
 {q:'What does protection like this cost?',a:'It depends on your age, health, the amount, and how long you want it — which is why no honest website quotes you a number. Coverage can start at around a dollar a day; your Benefits Coordinator puts real numbers together on the call, and there’s no fee for the conversation.'},
 {q:'Do I need a medical exam?',a:'Often not. Many options use a few health questions instead of an exam — especially final expense coverage. Your Benefits Coordinator will tell you exactly what the options in your situation require before anything moves forward.'},
 {q:'How fast can coverage start?',a:'Most coverage can begin quickly once approved — for some no-exam options, that can be days, not months.'},
 {q:'I already have a policy. Should I still call?',a:'Yes — that’s what a free policy review is for. People often find they can get more protection for a similar budget. Your Benefits Coordinator will never advise canceling anything until a better arrangement is actually in place.'},
 {q:'Does booking a call commit me to anything?',a:'No. The call is a conversation with a licensed Atlas Benefits Coordinator, not an application. Nothing is bound, charged, or signed because you booked a time.'},
];
function PlanBody({p}:{p:typeof protections[number]}){
 return <><div className="plans-top"><span className="pro-mark">Atlas plan</span><span className="plans-tag">{p.tag}</span></div><h3>{p.title}</h3><p className="plans-who">{p.who}</p><p className="plans-body">{p.body}</p><div className="plans-cta"><Link className="button" to="/book">Book your Atlas call<ArrowUpRight size={19} aria-hidden="true"/></Link><span>15–30 minutes, no pressure</span></div></>;
}
function PlansSwitcher(){
 const [sel,setSel]=useState(0);
 return <section className="plans-sec"><div className="container section-pad">
  <p className="eyebrow">What we protect</p>
  <h2>What Atlas Insurance<br/>Has to Offer</h2>
  <p className="ins-sub">Every family’s answer is different. These are the protections — your Benefits Coordinator helps you match one (or a mix) to your people, your budget, and your stage of life.</p>
  <div className="plans-switch">
   <div className="plans-list" role="tablist" aria-label="Atlas plans">
    {protections.map((x,i)=><div className="plans-item" key={x.title}>
     <button type="button" role="tab" aria-selected={i===sel} className={'plans-btn'+(i===sel?' is-on':'')} onMouseEnter={()=>setSel(i)} onFocus={()=>setSel(i)} onClick={()=>setSel(i)}><span className="plans-num">{String(i+1).padStart(2,'0')}</span><span className="plans-name">{x.title}</span><ArrowRight size={18} aria-hidden="true"/></button>
     {i===sel && <div className="plans-inline"><PlanBody p={x}/></div>}
    </div>)}
   </div>
   <div className="plans-panel" role="tabpanel"><PlanBody p={protections[sel]}/></div>
  </div>
 </div></section>;
}
function InsurancePage(){
 return <>
  <section className="ins-hero"><video className="ins-hero-film" src={asset("/media/atlas-hero.mp4")} autoPlay muted loop playsInline aria-hidden="true"/><div className="ins-hero-veil"/><div className="container">
   <p className="eyebrow">Atlas Insurance</p>
   <h1>Protection for those<br/>that matter most</h1>
   <p className="ins-lead">Atlas Insurance is an independent agency built on one promise: protect the people who count on you — the house, the paychecks, the goodbyes — plainly explained, honestly priced, and handled over a simple phone call with a licensed Atlas Benefits Coordinator.</p>
   <div className="ins-hero-btns"><Link className="button" to="/book">Book your Atlas call<ArrowUpRight size={22}/></Link><a className="button button-ghost" href="#ask">Ask a question</a></div>
  </div></section>
  {SHOW_CARRIERS&&<section className="carrier-band"><p className="carrier-label">Appointed with 50+ trusted carriers</p><div className="carrier-track">{[...carriers,...carriers].map(([f,n],i)=><span className="carrier-tile" key={i}><img src={asset(`/carriers/${f}`)} alt={i<carriers.length?n:''} loading="lazy"/></span>)}</div></section>}
  <section className="ins-sec container section-pad you-sec">
   <div className="you-top">
   <div className="you-copy">
   <p className="eyebrow">Built around you</p>
   <h2>It starts with you<br/>Not a product</h2>
   <p className="ins-sub">No two families get the same answer here, because no two families are the same. Everything your Benefits Coordinator puts together is shaped by your personal circumstances — who depends on you, what you earn, what you own, and what you want to leave behind.</p>
   <p className="you-note">That’s the whole reason the first step is a conversation, not a form: the right answer comes from your life, and your Benefits Coordinator builds the plan around it.</p>
   </div>
   <div className="you-faces"><video className="you-film" src={asset("/media/you-faces.mp4")} poster={asset("/media/you-faces.webp")} autoPlay muted loop playsInline preload="metadata" aria-hidden="true"/><img className="you-poster" src={asset("/media/you-faces.webp")} alt="" aria-hidden="true"/></div>
   </div>
   <div className="you-grid">
    <div className="you-chip"><span>Your people</span><p>Who counts on you — kids, a spouse, parents</p></div>
    <div className="you-chip"><span>Your health</span><p>What you qualify for, exam or no exam</p></div>
    <div className="you-chip"><span>Your budget</span><p>What fits comfortably, month after month</p></div>
    <div className="you-chip"><span>Your home</span><p>The mortgage and what it would take to keep it</p></div>
    <div className="you-chip"><span>Your age &amp; stage</span><p>Working years, new baby, near retirement</p></div>
    <div className="you-chip"><span>Your goals</span><p>What you want your protection to do</p></div>
   </div>
   
  </section>
  <PlansSwitcher/>
  <section className="ins-sec why-sec"><video className="why-film" src={asset("/media/why-atlas.mp4")} poster={asset("/media/why-atlas.webp")} autoPlay muted loop playsInline preload="metadata" aria-hidden="true"/><div className="why-veil"/><div className="container section-pad">
   <p className="eyebrow">Why Atlas</p>
   <h2>Independent, on purpose</h2>
   <p className="ins-sub">A captive agent can only sell you one company’s products. An independent agency works the other way around — we start from your situation and shop it across carriers.</p>
   <div className="indep-grid">
    <div className="indep-item"><h3>We work for you, not a carrier</h3><p>Atlas compares options from multiple top-rated insurance carriers and brings you the ones that actually fit — your health, your budget, your timeline.</p></div>
    <div className="indep-item"><h3>Licensed where you live</h3><p>Atlas Insurance and its producers are licensed in states across the country — your Benefits Coordinator confirms availability where you live on the call.</p></div>
    <div className="indep-item"><h3>Principal-led, not a call center</h3><p>The person on your call is a licensed producer whose name is on the door. Your situation is handled by the people accountable for it — start to finish.</p></div>
   </div>
  </div></section>
  <section className="ins-sec container section-pad">
   <p className="eyebrow">How it works</p>
   <h2>Three steps<br/>No paperwork maze</h2>
   <div className="ins-steps">
    <div className="ins-step"><span className="step-number">01</span><h3>Book your Atlas call</h3><p>Pick a time that suits you — as soon as today or tomorrow. A licensed Atlas Benefits Coordinator calls you. No links, no video.</p></div>
    <div className="ins-step"><span className="step-number">02</span><h3>Talk it through</h3><p>Your family, your budget, your questions. Your Benefits Coordinator compares options across the carriers and puts real numbers together.</p></div>
    <div className="ins-step"><span className="step-number">03</span><h3>Covered, simply</h3><p>Many options need just a few health questions — no medical exam — and most coverage can begin quickly once approved.</p></div>
   </div>
   <Link className="button ins-book-btn" to="/book">Book your call now<ArrowUpRight size={22}/></Link>
  </section>
  <div id="ask"><ContactSection initialService="Insurance"/></div>
  <section className="faq-section container section-pad"><div><p className="eyebrow">Good questions</p><h2>Things families actually ask</h2></div><div className="faq-list">{insFaq.map(q=><details key={q.q}><summary>{q.q}<Plus size={20} strokeWidth={1.5}/></summary><p>{q.a}</p></details>)}<p className="service-note">Coverage availability and terms depend on the insurer, eligibility, and underwriting. A website inquiry or phone call does not bind coverage.</p></div></section>
  <section className="compact-cta"><div className="container"><h2>The best time is<br/>before you need it</h2><Link className="button button-white" to="/book">Book your Atlas call<ArrowUpRight size={23}/></Link></div></section>
 </>;
}
function DivisionPage(){
 const {slug}=useParams();if(slug==='insurance')return <InsurancePage/>;const d=divisions.find(d=>d.slug===slug);if(!d)return <NotFound/>;
 return <><section className="detail-hero container"><div><Link to="/#services" className="breadcrumb">The Atlas companies <span>/</span> {d.brand}</Link><Lockup division={d} className="detail-lockup"/><h1>{d.heading.split('\n').map(line=><span key={line}>{line} </span>)}</h1><p>{d.intro}</p>{d.slug==='insurance'?<Link className="button" to="/book">Book your Atlas call<ArrowUpRight size={22}/></Link>:<Link className="button" to={`/contact?service=${encodeURIComponent(d.service)}`}>Let’s talk {d.service.toLowerCase()}<ArrowUpRight size={22}/></Link>}</div><figure><img src={asset(`/media/${d.image}.webp`)} alt={d.alt} width="800" height="900"/><figcaption>Space for what comes next.</figcaption></figure></section>
  <section className="offering-section section-pad"><div className="container offering-layout"><div className="reveal"><p className="eyebrow">{d.brand}</p><h2>Your plans.<br/>Our starting point.</h2></div><div>{d.areas.map((a,i)=><article className="offering-row reveal" key={a.title}><span className="service-number">0{i+1}</span><div><h3>{a.title}</h3><p>{a.body}</p></div></article>)}</div></div></section>
  <section className="faq-section container section-pad"><div className="reveal"><p className="eyebrow">A little clarity</p><h2>Good questions.<br/>A better beginning.</h2></div><div className="faq-list">{d.questions.map(q=><details key={q.q}><summary>{q.q}<Plus size={20} strokeWidth={1.5}/></summary><p>{q.a}</p></details>)}{d.note&&<p className="service-note">{d.note}</p>}</div></section>
  <section className="compact-cta"><div className="container"><h2>Let’s talk about<br/>your next step.</h2><Link className="button button-white" to={`/contact?service=${encodeURIComponent(d.service)}`}>Start a conversation<ArrowUpRight size={23}/></Link></div></section>
 </>;
}
function About(){return <><section className="about-intro container section-pad"><p className="eyebrow">About Atlas</p><h1>A family business.<br/>A forward-looking approach.</h1><div className="about-intro-bottom"><span>Metro Detroit roots.<br/>Michigan possibilities.</span><p>Atlas started with a simple idea: the important decisions in your life deserve someone who sees how they connect. We’re bringing that idea into a new chapter.</p></div></section><div className="about-panorama"><img src={asset("/media/about-panorama.webp")} alt="Illustrative renovated brick and oak Michigan home under golden autumn maples" width="1400" height="550"/></div>
 <section className="container about-story section-pad"><div><p className="eyebrow">A connected perspective</p><h2>Experience to build on.<br/>Room to think ahead.</h2></div><div><p>Our roots are in Michigan real estate. Our perspective reaches across insurance, mortgages, construction, and development—because a property decision rarely stands on its own.</p><p>Atlas Group is the next chapter of Atlas Properties Plus: a family business pairing {founder.name}’s hands-on experience with a clearer, more connected way to work. Four companies now carry the Atlas name, each with its own Michigan license and each free to stand on its own.</p><p>Come to us for one company or a broader conversation. We start by listening, keep your goals in view, and make space for you to choose the path that fits.</p><TextLink to="/contact">Tell us what’s next</TextLink></div></section><Founder/><Companies/><ContactSection/></>}
function ContactPage(){const [query]=useSearchParams();const chosen=query.get('service');return <ContactSection standalone initialService={divisions.some(d=>d.service===chosen)?chosen!:'Not sure yet'}/>}
function BookPage(){
 /* The embedded calendar is GHL's "Your Atlas Call" calendar (3ZhO43EjFGe3gF5wvfdd) — the
    same one the phone receptionist books, so website bookings get the same confirmation
    email, texts, and reminders. form_embed.js resizes the iframe to the widget's height. */
 useEffect(()=>{const s=document.createElement('script');s.src='https://link.msgsndr.com/js/form_embed.js';s.async=true;document.body.appendChild(s);return()=>{s.remove();};},[]);
 return <section className="book-page container section-pad"><p className="eyebrow">Book a call</p><h1>Pick a time.<br/>We’ll call you.</h1><p className="legal-lead">Choose a time below and a licensed Atlas Benefits Coordinator will call you — a regular phone call, nothing to download or join. If nothing in the next few days works, <Link to="/contact?service=Insurance">send us a note</Link> and we’ll reach out.</p>
  <div className="book-frame"><div className="book-frame-head"><img className="book-frame-logo" src="/brand/atlas-insurance-primary.svg" alt="Atlas Insurance"/><p className="book-frame-meta"><strong>Your Atlas Call</strong> · 30 minutes · a regular phone call</p></div><iframe src="https://api.leadconnectorhq.com/widget/booking/3ZhO43EjFGe3gF5wvfdd" scrolling="no" id="atlas-booking-widget" title="Book your Atlas call"/></div>
 </section>;
}
function Privacy(){return <section className="legal-page container"><p className="eyebrow">Privacy</p><h1>Your information.<br/>Handled with care.</h1><p className="legal-lead">This notice explains what Atlas collects through this website, what we do with it, and what we will never do with it.</p><h2>Who we are</h2><p>Insurance products on this site are offered through Atlas Insurances LLC. You can reach us on (313) 513-0268 or at info@atlasgroupmi.com.</p><h2>Information you choose to share</h2><p>The inquiry form asks for your name, email address, an optional phone number, the Atlas company you want to reach, and a message. Please do not submit Social Security numbers, financial account details, health records, policy numbers, or other sensitive documents through this website.</p><h2>We do not sell your information</h2><p><strong>We do not sell, rent, or share your phone number or any other contact information with third parties for their own promotional or marketing purposes.</strong> No information collected through this website is sold to lead buyers, data brokers, or other agents. Your details are used by Atlas to respond to you, and are shared only with service providers who help us operate — such as our email provider and our customer relationship system — who may use them only to provide that service to us.</p><h2>Calls and text messages</h2><p>If you give us your phone number, Atlas may call you about your inquiry. We will only send you text messages if you separately tick the SMS consent box — it is optional, and you can submit the form without it. Those messages are about life insurance services from Atlas Insurances LLC — confirming appointments, sending reminders, and following up on your inquiry. Message frequency varies. Message and data rates may apply; if you have questions about your text or data plan, contact your wireless provider. Reply STOP to any message to unsubscribe — we will send one message confirming that you have been unsubscribed, after which you will receive no further texts, and you can opt in again at any time. Reply HELP for help, or contact us at info@atlasgroupmi.com. Carriers are not liable for delayed or undelivered messages. Consenting to text messages is never a condition of buying anything. Mobile information will not be shared with third parties for marketing purposes. Our full messaging terms are set out in our <Link to="/terms">Terms</Link>.</p><h2>Cookies and measurement</h2><p>We may use analytics and advertising measurement tools to understand how people find and use this site. The server also keeps a short-lived, in-memory request counter to limit repeated form submissions.</p><h2>Keeping and removing information</h2><p>We keep inquiries for as long as needed to respond and to meet our record-keeping obligations as a licensed insurance producer. To ask what we hold, to correct it, or to have it deleted, contact us at info@atlasgroupmi.com or (313) 513-0268.</p><h2>Your choices</h2><p>You can choose not to submit the form, leave the phone field blank, or leave the SMS box unticked. None of those limit your ability to contact Atlas another way.</p><TextLink to="/">Back to Atlas</TextLink></section>}

function Terms(){return <section className="legal-page container"><p className="eyebrow">Terms</p><h1>The ground rules.<br/>Plainly stated.</h1><p className="legal-lead">These terms cover your use of this website, our messaging programme, and what an inquiry does and does not do.</p><h2>Using this site</h2><p>This website is published by Atlas Insurances LLC and its affiliated Atlas companies. Its content is general information, not insurance, legal, tax, or financial advice. Imagery is illustrative and does not depict available listings or completed Atlas projects.</p><h2>An inquiry does not bind coverage</h2><p>Submitting the form does not apply for, bind, change, cancel, or reinstate any insurance coverage. Coverage exists only when it is issued by the insurer through that insurer’s own process. Availability, eligibility, premiums, and terms are determined by the insurer and by underwriting.</p><h2>Text messaging programme</h2><p>If you tick the SMS consent box and give us your phone number, you agree to receive calls and text messages from Atlas Insurances LLC about life insurance services.</p><ul><li>Consent is optional and is never a condition of purchase.</li><li>Message frequency varies.</li><li>Message and data rates may apply, both for messages we send you and messages you send us. If you have questions about your text or data plan, contact your wireless provider.</li><li>Reply <strong>STOP</strong> to any message to unsubscribe. We will send one message confirming that you have been unsubscribed, after which you will receive no further texts. To join again, simply opt in as you did the first time.</li><li>Reply <strong>HELP</strong> for help, or contact us at info@atlasgroupmi.com or (313) 513-0268.</li><li>Carriers are not liable for delayed or undelivered messages.</li><li>Your mobile information is not shared with third parties for marketing purposes.</li></ul><h2>Licensing</h2><p>Insurance is offered through licensed producers. Atlas Insurances LLC and its producers are licensed in Michigan; products and services are offered only where licensed.</p><h2>Changes</h2><p>We may update these terms. The version published here is the one that applies.</p><h2>Contact</h2><p>Atlas Insurances LLC. (313) 513-0268. info@atlasgroupmi.com.</p><TextLink to="/">Back to Atlas</TextLink></section>}
function Accessibility(){return <section className="legal-page container"><p className="eyebrow">Accessibility</p><h1>A clearer experience.<br/>For everyone.</h1><p className="legal-lead">The Atlas website is designed to work with keyboard navigation, screen readers, and your device’s display preferences.</p><h2>Ways to use this site</h2><p>Use Tab to move through links and controls. The skip link goes directly to the main content. Menus can be closed with Escape. Form fields have visible labels, and feedback is announced to assistive technology.</p><h2>Motion and readability</h2><p>The homepage film can be paused. With reduced motion enabled on your device, background playback and reveal animation are disabled by default. The layout adapts to smaller screens and increased text size.</p><h2>If something gets in your way</h2><p>Tell us the page and what you were trying to do using our contact form. Please share only the information you are comfortable providing.</p><TextLink to="/contact">Contact Atlas</TextLink></section>}
function NotFound(){return <section className="not-found container"><p className="eyebrow">Page not found</p><h1>A different path<br/>starts here.</h1><p>We couldn’t find that page. Let’s get you back to Atlas.</p><Link className="button" to="/">Back to home<ArrowRight size={22}/></Link></section>}
export function App(){return <><a className="skip-link" href="#main">Skip to content</a><Header/><PageEffects/><main id="main"><Routes><Route path="/" element={<Home/>}/><Route path="/about" element={<About/>}/><Route path="/contact" element={<ContactPage/>}/><Route path="/book" element={<BookPage/>}/><Route path="/privacy" element={<Privacy/>}/><Route path="/terms" element={<Terms/>}/><Route path="/accessibility" element={<Accessibility/>}/>{Object.entries(legacyRoutes).map(([from,to])=><Route key={from} path={from} element={<Navigate to={to} replace/>}/>)}<Route path="/:slug" element={<DivisionPage/>}/><Route path="*" element={<NotFound/>}/></Routes></main><Footer/></>}
