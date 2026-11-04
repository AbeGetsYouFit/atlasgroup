import {slugify} from './slug.mjs';
/* Where a lead came from (11-04 metrics). Shared by the partial-lead path (/api/leads) and the
   inquiry path (/api/inquiries) so both tag a Meta click the same way. */
const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
export function cleanUtm(input){
  const u=input&&typeof input==='object'?input:{};
  return {source:slugify(str(u.source,80)),campaign:slugify(str(u.campaign,200)),content:slugify(str(u.content,200))};
}
export function sourceTags(u){
  const t=[];
  if(u.source==='meta') t.push('src-meta');
  if(u.campaign) t.push('campaign-'+u.campaign);
  if(u.content) t.push('ad-'+u.content);
  return t;
}
/* "Meta Ads, {ad variant}" for ad clicks (Abe 10-31: the variant, not the campaign), else "Website". */
export function leadSourceLabel(u){return u.source==='meta'?'Meta Ads'+(u.content?', '+u.content:''):'Website'}
