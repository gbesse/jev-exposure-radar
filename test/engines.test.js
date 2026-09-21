import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
