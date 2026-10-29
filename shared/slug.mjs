/* Shared by server and client. Tag-safe slug: lowercase, [a-z0-9-], no leading/trailing
   dashes, at most 40 chars. Anything else becomes '' so it is dropped, never injected. */
export function slugify(input){
  return String(input??'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
}
