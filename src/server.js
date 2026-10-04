import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {analyzeExposure} from './exposure.js';
import {judge} from './jev.js';
import {discoverProtocols} from './sources.js';

const root=new URL('../',import.meta.url);
export function createApp(){
  let jevBusy=false;
  return createServer(async(req,res)=>{
    const headers={'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
    const send=(status,data,type='application/json')=>{res.writeHead(status,{...headers,'Content-Type':type});res.end(type==='application/json'?JSON.stringify(data):data);};
    const host=req.headers.host||'';
    if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)){send(403,{error:'Hôte local requis'});return;}
    if(req.headers.origin&&req.headers.origin!==`http://${host}`){send(403,{error:'Origine refusée'});return;}
    try{
      const path=new URL(req.url,`http://${host}`).pathname;
      if(req.method==='GET'){
        if(path==='/api/status'){send(200,{jevConfigured:Boolean(process.env.TYPESAFE_API_KEY),model:process.env.JEV_MODEL||'jev-1.13.0',mode:'read-only'});return;}
        if(path==='/api/demo'){send(200,JSON.parse(await readFile(new URL('data/demo.json',root),'utf8')));return;}
        if(path==='/api/discover/protocols'){send(200,await discoverProtocols());return;}
        const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
        if(Object.hasOwn(files,path)){send(200,await readFile(new URL(`public/${files[path]}`,root)),path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html; charset=utf-8');return;}
      }
      if(req.method==='POST'&&['/api/exposure','/api/judge'].includes(path)){
        if(req.headers['content-type']!=='application/json'){send(415,{error:'JSON requis'});return;}
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1e6){send(413,{error:'Fichier trop grand (1 Mo maximum)'});return;}chunks.push(chunk);}
        const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(path==='/api/exposure'){send(200,analyzeExposure(input));return;}
        if(jevBusy){send(429,{error:'Un jugement Jev est déjà en cours'});return;}
        jevBusy=true;try{send(200,await judge(input));}finally{jevBusy=false;}return;
      }
      send(404,{error:'Route inconnue'});
    }catch(error){send(400,{error:error instanceof SyntaxError?'JSON invalide':error.message==='fetch failed'?'Connexion à la source impossible. Aucun résultat simulé ne remplace cette erreur.':error.message});}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4319);
  const server=createApp();server.listen(port,'127.0.0.1',()=>console.log(`Jev Exposure Radar → http://127.0.0.1:${port}`));
}
