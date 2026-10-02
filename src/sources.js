import {assert} from './validation.js';
async function read(url,fetcher){
  let r;
  try {r=await fetcher(url,{signal:AbortSignal.timeout(12000)});} catch(error) {
    if(['CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error.cause?.code))throw new Error('Source indisponible : certificat TLS invalide ou expiré.');
    throw error;
  }
  assert(r.ok,`Source indisponible (HTTP ${r.status})`);return r.json();
}
export async function discoverMarkets(fetcher=fetch){
  const rows=await read('https://gamma-api.polymarket.com/markets?limit=100&active=true&closed=false',fetcher);
  assert(Array.isArray(rows),'Format Gamma inattendu');
  const markets=rows.filter(m=>/bitcoin|ethereum|\bbtc\b|\beth\b|crypto|solana/i.test(`${m.question} ${m.description}`)).slice(0,30).map(m=>({id:String(m.id),title:m.question,rulesText:m.description||'',resolutionSource:m.resolutionSource||null,endDate:m.endDate||null,url:`https://polymarket.com/event/${encodeURIComponent(m.slug||'')}`,reviewed:false}));
  return {source:'Polymarket Gamma',observedAt:new Date().toISOString(),scanned:rows.length,markets,notice:'Découverte partielle : 100 marchés actifs au maximum. Règles brutes, sans normalisation certifiée ni prix exécutables.'};
}
export async function discoverProtocols(fetcher=fetch){
  const rows=await read('https://api.llama.fi/protocols',fetcher);assert(Array.isArray(rows),'Format DeFiLlama inattendu');
  const protocols=rows.filter(p=>Array.isArray(p.chains)&&p.chains.includes('Ethereum')&&p.category!=='CEX').sort((a,b)=>(b.tvl||0)-(a.tvl||0)).slice(0,25).map(p=>({id:p.slug,label:p.name,category:p.category,tvlUsd:Number.isFinite(p.tvl)?p.tvl:null,url:`https://defillama.com/protocol/${encodeURIComponent(p.slug)}`}));
  return {source:'DeFiLlama',observedAt:new Date().toISOString(),protocols,notice:'Protocoles présents sur Ethereum, hors CEX ; TVL globale toutes chaînes. La TVL ne documente pas les dépendances d’un portefeuille ; importer un graphe sourcé pour analyser une exposition.'};
}
