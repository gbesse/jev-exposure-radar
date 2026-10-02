import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {createApp} from '../src/server.js';
import {judge,buildQuestions} from '../src/jev.js';
import {discoverMarkets,discoverProtocols} from '../src/sources.js';
const request={task:'contracts',left:'Contract A',right:'Contract B'};
function response(){const {questions}=buildQuestions(request);return {model:'jev-test',answers:Object.fromEntries(Object.entries(questions).map(([k,q])=>{const options=Object.keys(q.criteria);return [k,{type:'choice',choice:options[0],confidence:.8,probabilities:Object.fromEntries(options.map((o,i)=>[o,i===0?.9:.05]))}];}))};}
test('adaptateur Jev: schéma, clé côté serveur et reçu reproductible',async()=>{
 const r=await judge(request,{key:'test-secret',fetcher:async(url,opts)=>{assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.equal(opts.headers.Authorization,'Bearer test-secret');const body=JSON.parse(opts.body);assert.ok(body.questions.event.instructions.includes('untrusted'));return {ok:true,json:async()=>response()};}});
 assert.equal(r.resolvedModel,'jev-test');assert.equal(r.requestHash.length,64);assert.ok(!JSON.stringify(r).includes('test-secret'));
});
test('modèle absent, erreur fournisseur et distributions invalides échouent sans fallback',async()=>{
 await assert.rejects(()=>judge(request,{key:''}),/configuré/);
 await assert.rejects(()=>judge(request,{key:'k',fetcher:async()=>({ok:false,status:429})}),/429/);
 for(const mutate of [r=>r.answers.event.probabilities.same=2,r=>delete r.answers.event.probabilities.unknown,r=>r.answers.event.choice='fake',r=>r.answers.event.confidence=NaN]){
 const r=response();mutate(r);await assert.rejects(()=>judge(request,{key:'k',fetcher:async()=>({ok:true,json:async()=>r})}));}
});
test('classification ne reçoit pas de vérité terrain et utilise les cibles fermées',()=>{const q=buildQuestions({task:'incident',text:'A withdraw issue',targets:[{id:'a',label:'Protocol A'}],expected:'confirmed'});assert.deepEqual(q.state,{announcement:'A withdraw issue'});assert.ok(q.questions.target.criteria.a);assert.ok(!JSON.stringify(q.state).includes('expected'));});
test('connecteurs conservent la distinction entre catalogue et preuve',async()=>{
 const r=await discoverMarkets(async()=>({ok:true,json:async()=>[{id:1,question:'Bitcoin above a threshold?',description:'Source rules',slug:'btc',endDate:'2026-12-31'}]}));assert.equal(r.markets[0].reviewed,false);assert.equal(r.markets.length,1);assert.ok(!r.markets[0].quotes);
 const p=await discoverProtocols(async()=>({ok:true,json:async()=>[{slug:'a',name:'A',chains:['Ethereum'],tvl:100}]}));assert.equal(p.protocols.length,1);assert.ok(!p.edges);
 await assert.rejects(()=>discoverMarkets(async()=>{throw Error('offline');}),/offline/);
});
test('serveur: analyse, import invalide, origine interdite, chemins privés',async t=>{
 const app=createApp();app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>{app.closeAllConnections();app.close();});const base=`http://127.0.0.1:${app.address().port}`;
 const d=await(await fetch(base+'/api/demo')).json();
 const r=await fetch(base+'/api/exposure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d.exposure)});assert.equal(r.status,200);assert.equal((await r.json()).totalValueUsd,35000);
 const invalid=await fetch(base+'/api/exposure',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(invalid.status,400);
 const cross=await fetch(base+'/api/judge',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'});assert.equal(cross.status,403);
 assert.equal((await fetch(base+'/.env')).status,404);
 const hostStatus=await new Promise((resolve,reject)=>{const q=httpRequest(base+'/api/status',{headers:{Host:'evil.example:4317'}},r=>{r.resume();resolve(r.statusCode);});q.on('error',reject);q.end();});assert.equal(hostStatus,403);
 const html=await fetch(base);assert.ok(html.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert.match(await html.text(),/Exposure Radar/);
});

test('une erreur de certificat est explicite et ne désactive pas TLS',async()=>{
 await assert.rejects(()=>discoverMarkets(async()=>{throw Object.assign(new Error('fetch failed'),{cause:{code:'CERT_HAS_EXPIRED'}});}),/certificat TLS/);
});
