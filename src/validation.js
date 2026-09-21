export function assert(ok, message) { if (!ok) throw new Error(message); }
export function text(value, name, max = 20000) {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${name}: texte requis (max ${max})`);
  return value;
}
export function number(value, name, min = 0, max = 1e12) {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, `${name}: nombre entre ${min} et ${max} requis`);
  return value;
}
export function time(value, name) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), `${name}: date ISO avec fuseau requise`);
  const [year,month,day]=value.slice(0,10).split('-').map(Number);
  const days=new Date(Date.UTC(year,month,0)).getUTCDate();
  assert(month>=1&&month<=12&&day>=1&&day<=days&&Number(value.slice(11,13))<24, `${name}: date calendrier invalide`);
  return Date.parse(value);
}
export function list(value, name, max = 200) { assert(Array.isArray(value) && value.length <= max, `${name}: liste, max ${max}`); return value; }
export function unique(items, key, name) { assert(new Set(items.map(x => x[key])).size === items.length, `${name}: identifiants dupliqués`); }
export const round = n => Math.round(n * 1e6) / 1e6;
