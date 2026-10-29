import express from 'express';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { validateInquiry,makeLimiter,assertMailConfigured,completeInquiry } from './server/inquiries.mjs';
import { makeLeadHandler,captureMode } from './server/leads.mjs';
import { makeGhlClient } from './server/ghl.mjs';
import { makeSlotCache,makeSlotsHandler,makeBookHandler } from './server/booking.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
try{loadEnvFile(path.join(root,'.env'))}catch(error){if(error.code!=='ENOENT')throw error}
const app=express();
app.disable('x-powered-by');
/* Render terminates TLS at its proxy; without this every visitor shares one req.ip and the limiters become a single global bucket. */
app.set('trust proxy',1);
app.use((req,res,next)=>{
  res.set('X-Content-Type-Options','nosniff');
  res.set('Referrer-Policy','strict-origin-when-cross-origin');
  res.set('X-Frame-Options','SAMEORIGIN');
  next();
});
app.use('/api',express.json({limit:'16kb'}));
const mailReady=assertMailConfigured(process.env);
const transport=mailReady ? nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}):null;
const allow=makeLimiter();
/* Lead capture: 'ghl' when both vars are set, 'preview' in local dev without them, 'off' in production without them (loud, never silent). */
const ghlMode=captureMode(process.env)==='ghl'?'ghl':(process.env.NODE_ENV==='production'?'off':'preview');
const ghl=ghlMode==='ghl'?makeGhlClient({token:process.env.GHL_PIT_TOKEN,locationId:process.env.GHL_LOCATION_ID}):null;
if(ghlMode==='off') console.error('Atlas lead capture: OFF (set GHL_PIT_TOKEN and GHL_LOCATION_ID)'); else console.log(`Atlas lead capture: ${ghlMode}`);
const allowLeads=makeLimiter({max:30,windowMs:15*60*1000});
app.get('/api/config',(_req,res)=>res.json({inquiryMode:mailReady?'email':'preview',captureMode:ghlMode==='ghl'?'ghl':'off',publicEmail:process.env.PUBLIC_EMAIL||'',publicPhone:process.env.PUBLIC_PHONE||''}));
app.post('/api/leads',makeLeadHandler({ghl,allow:allowLeads,mode:ghlMode}));
const calendarId=process.env.GHL_CALENDAR_ID||'3ZhO43EjFGe3gF5wvfdd';
const slotCache=ghl?makeSlotCache({ghl,calendarId}):null;
const allowBook=makeLimiter({max:10,windowMs:15*60*1000});
app.get('/api/slots',ghl?makeSlotsHandler({cache:slotCache}):(_req,res)=>res.status(503).json({error:'booking not configured'}));
app.post('/api/book',ghl?makeBookHandler({ghl,cache:slotCache,calendarId,allow:allowBook}):(_req,res)=>res.status(503).json({error:'booking not configured'}));
app.post('/api/inquiries',async(req,res)=>{
  const origin=req.get('origin');
  if(origin && origin!==`${req.protocol}://${req.get('host')}` && origin!==process.env.PUBLIC_ORIGIN) return res.status(403).json({error:'Please submit through the Atlas website.'});
  if(!allow(req.ip)) return res.status(429).json({error:'Please wait a few minutes before sending another inquiry.'});
  if(req.body?.website) return res.status(400).json({error:'This inquiry could not be accepted.'});
  const {value,error}=validateInquiry(req.body);
  if(error) return res.status(400).json({error});
  const reference=randomUUID();
  try {
    if(transport) {
      await transport.sendMail({from:process.env.MAIL_FROM,to:process.env.INQUIRY_TO,replyTo:value.email,subject:`Atlas website inquiry: ${value.service}`,text:`Name: ${value.name}\nEmail: ${value.email}\nPhone: ${value.phone||'not provided'}\nService: ${value.service}\n\n${value.message}\n\nConsent: Contact about this inquiry only.\nSMS consent: ${value.smsConsent?'yes — may be texted':'no — do not text'}\nReference: ${reference}`});
      if(ghl) await completeInquiry({ghl,value:{...value,page:req.body?.page}});
      return res.status(201).json({mode:'email',message:'Your inquiry has been sent. Atlas will follow up using the email you provided.'});
    }
    await mkdir(path.join(root,'data','inquiries'),{recursive:true,mode:0o700});
    await writeFile(path.join(root,'data','inquiries',reference+'.json'),JSON.stringify({...value,consent:true,createdAt:new Date().toISOString(),delivery:'preview-only'},null,2),{mode:0o600});
    res.status(201).json({mode:'preview',message:'Your inquiry was saved in this local preview. It has not been sent to Atlas.'});
  } catch {
    res.status(503).json({error:'We could not send your inquiry. Please try again later.'});
  }
});
app.use('/api',(_req,res)=>res.status(404).json({error:'Not found.'}));
if(process.env.NODE_ENV==='production') {
  const routes=['/','/properties','/insurance','/mortgage','/construction','/about','/contact','/book','/start','/privacy','/terms','/accessibility'];
  for(const [from,to] of Object.entries({'/real-estate':'/properties','/mortgages':'/mortgage'}))app.get(from,(_req,res)=>res.redirect(301,to));
  for(const route of routes)app.get(route,(_req,res)=>res.sendFile(path.join(root,'dist',route,'index.html')));
  app.use(express.static(path.join(root,'dist'),{maxAge:'1h',redirect:false}));
  app.use((req,res,next)=>req.method==='GET'?res.status(404).sendFile(path.join(root,'dist','404','index.html')):next());
} else {
  const {createServer}=await import('vite');
  const vite=await createServer({server:{middlewareMode:true},appType:'spa'});
  app.use(vite.middlewares);
}
app.use((err,req,res,next)=>res.status(err.type==='entity.too.large'?413:400).json({error:'The request could not be processed.'}));
const port=Number(process.env.PORT||4173);
app.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Atlas preview: http://127.0.0.1:${port} (${mailReady?'email delivery enabled':'local inquiry preview'})`));
