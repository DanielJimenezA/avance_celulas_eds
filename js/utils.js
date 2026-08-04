export function escapeHtml(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
export function normalizeProgress(v){if(v===null||v===undefined||v==="")return 0;let n=typeof v==='string'?Number(v.trim().replace('%','').replace(',','.')):Number(v);if(!Number.isFinite(n))return 0;if(n>=0&&n<=1)n*=100;return Math.min(100,Math.max(0,n));}
export function parseDate(v){if(!v)return null;const d=new Date(`${v}T00:00:00`);return Number.isNaN(d.getTime())?null:d;}
export function toISODate(d){return d.toISOString().slice(0,10);}
export function formatDate(v){const d=parseDate(v);return d?new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d):'Pendiente de programar';}
export function diffDays(a,b){return Math.round((Date.UTC(b.getFullYear(),b.getMonth(),b.getDate())-Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()))/86400000);}
export function normalizeEntity(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');}
