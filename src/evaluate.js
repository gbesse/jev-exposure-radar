import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {judge,buildQuestions} from './jev.js';
import {assert,list} from './validation.js';

export function scorePredictions(rows,threshold=.8){
  assert(rows.length>0,'Aucun jugement à évaluer');
  let correct=0,brier=0,selected=0,selectedCorrect=0;
  for(const r of rows){
    assert(Object.hasOwn(r.probabilities,r.expected),'Vérité terrain hors des options');
    const ok=r.choice===r.expected;correct+=Number(ok);
    brier+=Object.entries(r.probabilities).reduce((s,[k,p])=>s+(p-Number(k===r.expected))**2,0);
    if(r.confidence>=threshold){selected++;selectedCorrect+=Number(ok);}
  }
  return {questions:rows.length,accuracy:correct/rows.length,multiclassBrier:brier/rows.length,threshold,coverage:selected/rows.length,selectiveAccuracy:selected?selectedCorrect/selected:null};
}

export async function evaluateCases(cases,{live=false,maxCalls=20,judgeFn=judge}={}){
  list(cases,'cases',10000);assert(Number.isInteger(maxCalls)&&maxCalls>0&&maxCalls<=10000,'maxCalls invalide');
  const selected=cases.slice(0,maxCalls);
  assert(selected.length>0,'Jeu d’évaluation vide');
  for(const c of selected){const {questions}=buildQuestions(c.input);assert(c.expected&&Object.keys(c.expected).length>0,'Labels requis');for(const [k,v]of Object.entries(c.expected))assert(questions[k]&&Object.hasOwn(questions[k].criteria,v),'Label inconnu');}
  if(!live)return {mode:'plan',cases:selected.length,maxCalls,notice:'Aucun appel effectué. --live lance une requête payante par cas ; les labels ne sont jamais envoyés au modèle.'};
  const receipts=[],rows=[];
  for(const c of selected){const receipt=await judgeFn(c.input);receipts.push({id:c.id,receipt});for(const [question,expected]of Object.entries(c.expected))rows.push({id:c.id,question,expected,...receipt.answers[question]});}
  const grouped=Object.fromEntries([...new Set(rows.map(r=>r.question))].map(k=>[k,scorePredictions(rows.filter(r=>r.question===k))]));
  return {mode:'live',generatedAt:new Date().toISOString(),datasetNotice:'Les fixtures fournies sont synthétiques et réduites. Ces scores ne démontrent ni calibration financière ni état de l’art.',aggregate:scorePredictions(rows),byQuestion:grouped,rows,receipts};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2),option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
    const file=option('--input',fileURLToPath(new URL('../data/eval.json',import.meta.url)));
    const cases=JSON.parse(await readFile(file,'utf8'));
    const result=await evaluateCases(cases,{live:args.includes('--live'),maxCalls:Number(option('--max-calls','20'))});
    if(result.mode==='live'){await mkdir(new URL('../output/',import.meta.url),{recursive:true});await writeFile(new URL('../output/jev-evaluation.json',import.meta.url),JSON.stringify(result,null,2));}
    console.log(JSON.stringify(result.mode==='live'?{...result,rows:undefined,receipts:undefined}:result,null,2));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
