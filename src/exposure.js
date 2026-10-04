import {assert,text,number,time,list,unique,round} from './validation.js';

export function analyzeExposure(input) {
  const asOf=time(input.asOf,'asOf');
  const nodes=list(input.nodes,'nodes',200), edges=list(input.edges,'edges',500), positions=list(input.positions,'positions',100), incidents=list(input.incidents,'incidents',100);
  unique(nodes,'id','nodes');unique(positions,'id','positions');unique(incidents,'id','incidents');
  for(const n of nodes){text(n.id,'node.id',120);text(n.label,'node.label'); assert(typeof n.coverageComplete==='boolean','coverageComplete requis');}
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const outgoing=new Map(nodes.map(n=>[n.id,[]]));
  const edgeKeys=new Set();
  for(const e of edges){
    assert(byId.has(e.from)&&byId.has(e.to),'Nœud de dépendance inconnu');
    assert(['allocation','dependency'].includes(e.kind),'Type de lien invalide');
    number(e.fraction,'fraction',0,1); if(e.kind==='dependency')assert(e.fraction===1,'Une dépendance structurelle porte sur toute la branche');
    text(e.evidence,'edge.evidence');time(e.observedAt,'edge.observedAt');
    if(Date.parse(e.observedAt)<=asOf&&e.fraction>0){
      const key=JSON.stringify([e.from,e.to,e.kind]);assert(!edgeKeys.has(key),'Lien dupliqué : utiliser des nœuds intermédiaires pour des lots distincts');edgeKeys.add(key);
      outgoing.get(e.from).push(e);
    }
  }
  const visited=new Set(), active=new Set();
  function check(id){assert(!active.has(id),'Cycle dans le graphe : allocation impossible à borner ici');if(visited.has(id))return;active.add(id);
    const next=outgoing.get(id); assert(next.filter(e=>e.kind==='allocation').reduce((s,e)=>s+e.fraction,0)<=1+1e-9,'Allocations supérieures à 100 %');
    for(const e of next)check(e.to);active.delete(id);visited.add(id);}
  for(const n of nodes)check(n.id);
  for(const p of positions){text(p.id,'position.id');assert(byId.has(p.node),'Position sans nœud');number(p.valueUsd,'position.valueUsd');assert(time(p.observedAt,'position.observedAt')<=asOf,'Position postérieure au replay');}
  // Count paths once per target on the DAG, saturating above the output limit.
  // Pruning zero-path branches prevents exponential exploration of dead ends.
  const pathCounts=new Map();
  function countPaths(id,target){
    if(!pathCounts.has(target))pathCounts.set(target,new Map());
    const memo=pathCounts.get(target);
    if(memo.has(id))return memo.get(id);
    const count=id===target?1:Math.min(2001,outgoing.get(id).reduce((sum,e)=>sum+countPaths(e.to,target),0));
    memo.set(id,count);return count;
  }
  let traceSteps=0;
  function trace(id,target,path=[],weight=1,evidence=[]){
    const count=countPaths(id,target);
    if(count===0)return [];
    assert(count<=2000,'Trop de chemins : simplifier le graphe');
    assert(++traceSteps<=100000,'Analyse trop complexe : réduire les positions, incidents ou chemins');
    if(id===target)return [{nodes:[...path,id],fraction:weight,evidence}];
    const result=[];
    for(const e of outgoing.get(id)){
      result.push(...trace(e.to,target,[...path,id],weight*e.fraction,[...evidence,e.evidence]));
      assert(result.length<=2000,'Trop de chemins : simplifier le graphe');
    }
    return result;
  }
  const ignored=[],alerts=[],warnings=[];
  for(const incident of incidents){
    text(incident.id,'incident.id');text(incident.title,'incident.title');text(incident.evidence,'incident.evidence');
    assert(byId.has(incident.target),'Cible d’incident inconnue');
    assert(['confirmed','alleged','benign'].includes(incident.status),'Statut d’incident invalide');
    const published=time(incident.publishedAt,'publishedAt'),observed=time(incident.observedAt,'incident.observedAt');
    assert(observed>=published,'Incident observé avant publication');
    const resolved=incident.resolvedAt?time(incident.resolvedAt,'resolvedAt'):Infinity;
    assert(resolved>=published,'Résolution antérieure à la publication');
    const resolutionObserved=incident.resolutionObservedAt?time(incident.resolutionObservedAt,'resolutionObservedAt'):Infinity;
    if(incident.resolutionObservedAt)assert(Number.isFinite(resolved)&&resolutionObserved>=resolved&&resolutionObserved>=observed,'Observation de résolution incohérente');
    if(observed<=asOf&&Number.isFinite(resolved)&&!Number.isFinite(resolutionObserved))warnings.push({id:incident.id,reason:'Résolution sans date d’observation : incident conservé dans le replay.'});
    const reason=published>asOf||observed>asOf?'not-yet-known':resolved<=asOf&&resolutionObserved<=asOf?'resolved':incident.status==='benign'?'benign':null;
    if(reason){ignored.push({id:incident.id,reason});continue;}
    const affected=positions.map(p=>{
      const paths=trace(p.node,incident.target);
      const fraction=Math.min(1,paths.reduce((s,x)=>s+x.fraction,0));
      return {...p,fraction,upperBoundUsd:Math.min(p.valueUsd,Math.ceil(p.valueUsd*fraction*1e6)/1e6),paths:paths.map(path=>({...path,labels:path.nodes.map(n=>byId.get(n).label)}))};
    }).filter(p=>p.fraction>0);
    const knownIncident={...incident};
    if(resolutionObserved>asOf){delete knownIncident.resolvedAt;delete knownIncident.resolutionObservedAt;}
    alerts.push({incident:knownIncident,affected,upperBoundUsd:round(affected.reduce((s,p)=>s+p.upperBoundUsd,0)),status:affected.length?(incident.status==='confirmed'?'alert':'watch'):'no-known-path'});
  }
  // Union bound across incidents, capped per position: never present sum of overlapping alerts as exact exposure.
  const total=positions.reduce((s,p)=>s+p.valueUsd,0);
  const upperBound=positions.reduce((s,p)=>s+Math.min(p.valueUsd,alerts.reduce((v,a)=>v+(a.affected.find(x=>x.id===p.id)?.upperBoundUsd??0),0)),0);
  const reachable=new Set();function reach(id){if(reachable.has(id))return;reachable.add(id);for(const e of outgoing.get(id))reach(e.to);}
  positions.forEach(p=>reach(p.node));
  const gaps=nodes.filter(n=>reachable.has(n.id)).flatMap(n=>{
    const allocations=outgoing.get(n.id).filter(e=>e.kind==='allocation');
    const incomplete=allocations.length>0&&allocations.reduce((s,e)=>s+e.fraction,0)<1-1e-9;
    return !n.coverageComplete||incomplete?[{id:n.id,label:n.label,reason:incomplete?'Allocations connues inférieures à 100 %':'Dépendances incomplètement documentées'}]:[];
  });
  return {asOf:input.asOf,totalValueUsd:round(total),potentialExposureUpperBoundUsd:round(upperBound),alerts:alerts.sort((a,b)=>b.upperBoundUsd-a.upperBoundUsd),ignored,gaps,warnings,
    interpretation:'Borne haute des positions potentiellement concernées selon le graphe fourni. Ce montant ne prédit pas une perte. Aucun chemin connu ne signifie pas absence de risque.',
    valuationNote:'Le replay conserve les valorisations fournies ; il ne reconstitue pas les prix historiques.'};
}
