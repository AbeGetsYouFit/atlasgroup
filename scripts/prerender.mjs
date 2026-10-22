import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
try{
 const {render}=await vite.ssrLoadModule('/src/entry-server.tsx');
 const template=await readFile('dist/index.html','utf8');
 const routes=['/','/properties','/insurance','/mortgage','/construction','/about','/contact','/privacy','/terms','/accessibility','/404'];
 for(const route of routes){
  const {html,title,description}=render(route);
  const dir=route==='/'?'dist':`dist${route}`;await mkdir(dir,{recursive:true});
  const output=template.replace('<div id="root"></div>',`<div id="root">${html}</div>`).replace(/<title>.*?<\/title>/,`<title>${escape(title)}</title>`).replace(/<meta name="description" content="[^"]*"\s*\/>/,`<meta name="description" content="${escape(description)}" />`).replace(/<meta property="og:title" content="[^"]*"\s*\/>/,`<meta property="og:title" content="${escape(title)}" />`).replace(/<meta property="og:description" content="[^"]*"\s*\/>/,`<meta property="og:description" content="${escape(description)}" />`);
  await writeFile(`${dir}/index.html`,output);
  if(route==='/404')await writeFile('dist/404.html',output);
 }
 console.log('Pre-rendered 9 pages and the 404 view.');
}finally{await vite.close()}
