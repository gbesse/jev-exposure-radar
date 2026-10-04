import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {analyzeExposure} from '../src/exposure.js';
const fixture=JSON.parse(await readFile(new URL('../data/demo.json',import.meta.url),'utf8'));
const demo=()=>structuredClone(fixture);

test('exposition indirecte pondérée et provenance des chemins',()=>{
 const r=analyzeExposure(demo().exposure);const a=r.alerts.find(a=>a.incident.id==='i1');assert.equal(a.upperBoundUsd,17000);assert.deepEqual(a.affected[0].paths[0].nodes,['vault','staked','issuer']);assert.equal(r.potentialExposureUpperBoundUsd,25000);assert.equal(r.totalValueUsd,35000);assert.equal(r.gaps.length,2);
});
test('replay exclut événements non observés sans lire le futur',()=>{
 const d=demo().exposure;d.asOf='2026-09-21T10:01:00Z';const r=analyzeExposure(d);assert.equal(r.potentialExposureUpperBoundUsd,0);assert.ok(r.ignored.some(x=>x.id==='i1'&&x.reason==='not-yet-known'));
});
test('incidents multiples et chemins convergents ne dépassent pas une position',()=>{
 const d=demo().exposure;d.incidents.push({...d.incidents[0],id:'another'});d.edges.push({from:'vault',to:'issuer',kind:'dependency',fraction:1,evidence:'Shared dependency',observedAt:'2026-09-20T08:00:00Z'});
 const r=analyzeExposure(d);assert.equal(r.potentialExposureUpperBoundUsd,25000);assert.ok(r.alerts.every(a=>a.affected.every(p=>p.upperBoundUsd<=p.valueUsd)));
});
test('cycles, nœuds inconnus et allocations >100% sont rejetés',()=>{
 const d=demo().exposure;d.edges.push({from:'issuer',to:'vault',kind:'dependency',fraction:1,evidence:'Cycle',observedAt:'2026-09-20T08:00:00Z'});assert.throws(()=>analyzeExposure(d),/Cycle/);
 const e=demo().exposure;e.edges[0].fraction=.9;assert.throws(()=>analyzeExposure(e),/100/);
 const f=demo().exposure;f.positions[0].node='unknown';assert.throws(()=>analyzeExposure(f),/nœud/);
});
test('liens futurs sont exclus du replay',()=>{const d=demo().exposure;d.edges[2].observedAt='2026-09-22T00:00:00Z';assert.equal(analyzeExposure(d).alerts.find(a=>a.incident.id==='i1').upperBoundUsd,0);});
test('absence de chemin connue reste explicite',()=>{const d=demo().exposure;d.edges=[];const r=analyzeExposure(d);assert.equal(r.alerts[0].status,'no-known-path');assert.match(r.interpretation,/ne signifie pas absence/);});
test('résolution tardivement observée ne fuit pas dans le passé',()=>{
 const d=demo().exposure;d.incidents=[{...d.incidents[0],resolvedAt:'2026-09-21T10:30:00Z',resolutionObservedAt:'2026-09-21T13:00:00Z'}];
 assert.equal(analyzeExposure(d).alerts.length,1);
 d.asOf='2026-09-21T13:00:00Z';assert.equal(analyzeExposure(d).ignored[0].reason,'resolved');
 delete d.incidents[0].resolutionObservedAt;assert.equal(analyzeExposure(d).alerts.length,1);assert.equal(analyzeExposure(d).warnings.length,1);
 d.incidents[0].resolutionObservedAt='2026-09-21T10:00:00Z';assert.throws(()=>analyzeExposure(d),/incohérente/);
});
test('une fraction minuscule peut porter une exposition significative',()=>{
 const d=demo().exposure;d.positions=[{...d.positions[0],valueUsd:1e12}];d.edges[0].fraction=4e-7;d.incidents=[d.incidents[0]];
 const p=analyzeExposure(d).alerts[0].affected[0];assert.equal(p.fraction,4e-7);assert.equal(p.upperBoundUsd,400000);
});
test('chaque chemin ne cite que ses propres preuves, même avec des liens parallèles',()=>{
 const d=demo().exposure;d.edges.push({from:'vault',to:'staked',kind:'dependency',fraction:1,evidence:'Dependency proof',observedAt:'2026-09-20T08:00:00Z'});
 const paths=analyzeExposure(d).alerts.find(a=>a.incident.id==='i1').affected[0].paths;
 assert.equal(paths.length,2);assert.ok(!paths[0].evidence.includes('Dependency proof'));assert.equal(paths[1].evidence[0],'Dependency proof');
 d.edges.push({...d.edges[0]});assert.throws(()=>analyzeExposure(d),/dupliqué/);
});
test('allocation partielle signale un trou même si coverageComplete est déclaré',()=>{
 const d=demo().exposure;d.edges[0].fraction=.1;assert.ok(analyzeExposure(d).gaps.some(g=>g.id==='vault'&&g.reason.includes('100')));
});


test('le rapport de replay masque les métadonnées de résolution encore inconnues',()=>{
 const d=demo().exposure;d.incidents=[{...d.incidents[0],resolvedAt:'2026-09-21T10:30:00Z',resolutionObservedAt:'2026-09-21T13:00:00Z'}];
 const report=analyzeExposure(d);
 assert.equal(report.alerts.length,1);
 assert.ok(!Object.hasOwn(report.alerts[0].incident,'resolvedAt'));
 assert.ok(!Object.hasOwn(report.alerts[0].incident,'resolutionObservedAt'));
 assert.equal(d.incidents[0].resolvedAt,'2026-09-21T10:30:00Z');
});


function branchingGraph(layers){
 const d=demo().exposure,observedAt='2026-09-20T08:00:00Z';
 d.nodes=[{id:'root',label:'Root',coverageComplete:true},{id:'target',label:'Target',coverageComplete:true}];d.edges=[];
 let previous=['root'];
 for(let i=0;i<layers;i++){
  const next=[`a${i}`,`b${i}`];
  for(const id of next)d.nodes.push({id,label:id,coverageComplete:true});
  for(const from of previous)for(const to of next)d.edges.push({from,to,kind:'dependency',fraction:1,evidence:'Synthetic branch',observedAt});
  previous=next;
 }
 d.positions=[{id:'p',node:'root',valueUsd:100,observedAt}];
 d.incidents=[{...d.incidents[0],target:'target'}];
 return d;
}
test('un graphe à un milliard de chemins sans cible termine sans exploration exhaustive',()=>{
 const input=branchingGraph(30);
 // A subprocess timeout also contains a future synchronous traversal regression.
 const moduleUrl=new URL('../src/exposure.js',import.meta.url).href;
 const script=`import {readFileSync} from 'node:fs'; import {analyzeExposure} from ${JSON.stringify(moduleUrl)}; console.log(analyzeExposure(JSON.parse(readFileSync(0,'utf8'))).alerts[0].status);`;
 const run=spawnSync(process.execPath,['--input-type=module','-e',script],{input:JSON.stringify(input),encoding:'utf8',timeout:5000});
 assert.ifError(run.error);assert.equal(run.status,0,run.stderr);assert.equal(run.stdout.trim(),'no-known-path');
});
test('un nombre excessif de chemins utiles est rejeté avant énumération',()=>{
 const d=branchingGraph(12);d.incidents[0].target='a11';
 assert.throws(()=>analyzeExposure(d),/Trop de chemins/);
});
test('le budget cumulé borne aussi les analyses avec beaucoup de positions',()=>{
 const d=branchingGraph(10);d.incidents[0].target='a9';
 d.positions=Array.from({length:100},(_,i)=>({...d.positions[0],id:`p${i}`}));
 assert.throws(()=>analyzeExposure(d),/Analyse trop complexe/);
});
