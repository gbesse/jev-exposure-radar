import test from 'node:test';
import assert from 'node:assert/strict';
import {scorePredictions,evaluateCases} from '../src/evaluate.js';
test('Brier et couverture mesurent aussi les erreurs confiantes',()=>{
 const r=scorePredictions([{expected:'a',choice:'b',probabilities:{a:.1,b:.9},confidence:.9},{expected:'a',choice:'a',probabilities:{a:.6,b:.4},confidence:.2}]);
 assert.equal(r.accuracy,.5);assert.ok(Math.abs(r.multiclassBrier-.97)<1e-9);assert.equal(r.coverage,.5);assert.equal(r.selectiveAccuracy,0);
});
test('plan par défaut, plafond d’appels, labels isolés de la requête',async()=>{
 const cases=Array.from({length:3},(_,id)=>({id,input:{task:'contracts',left:'A',right:'B'},expected:{event:'same'}}));
 assert.equal((await evaluateCases(cases,{maxCalls:2})).cases,2);
 let calls=0;const r=await evaluateCases(cases,{live:true,maxCalls:2,judgeFn:async input=>{calls++;assert.ok(!Object.hasOwn(input,'expected'));return {answers:{event:{choice:'same',probabilities:{same:1,different:0,unknown:0},confidence:1}}};}});assert.equal(calls,2);assert.equal(r.aggregate.accuracy,1);
});
