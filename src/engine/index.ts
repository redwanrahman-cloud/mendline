import {activeApplications,undoRuleV1} from '../rules/intelligence';
import {importHistory as validateHistory} from './recovery';
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex} from '@noble/hashes/utils';
import type {Role,Result,Snapshot,Policy,Binding,Assessment,Comparison,ReviewState,ResolveRequest,ReviewEvent,Choice,Preview,ReviewedExport} from './types';
export * from './types';
const enc=new TextEncoder();
export const hashBytes=(v:Uint8Array)=>bytesToHex(sha256(v));
const hash=(v:unknown)=>hashBytes(enc.encode(JSON.stringify(v)));
const ok=<T>(value:T):Result<T>=>({ok:true,value});
const fail=<T=never>(code:string,message:string,extra:object={}):Result<T>=>({ok:false,error:{code,message,...extra}});
const copy=<T>(v:T):T=>structuredClone(v);
const policyHash=(p:Policy)=>hash([p.keyColumn,p.identityColumns,p.assumptionConfirmed,p.assumptionReason]);
export function serializeCsv(headers:string[],rows:string[][]):Uint8Array {
 // A literal first-field U+FEFF must not become an outside-quote encoding BOM.
 const field=(s:string,first:boolean)=>/[",\r\n]/.test(s)||(first&&s.startsWith('\uFEFF'))?'"'+s.replaceAll('"','""')+'"':s;
 return enc.encode([headers,...rows].map((r,i)=>r.map((s,j)=>field(s,i===0&&j===0)).join(',')).join('\r\n')+'\r\n');
}
export function parseCsv(role:Role,utf8Bytes:Uint8Array):Result<Snapshot>{
 if(!(utf8Bytes instanceof Uint8Array)||utf8Bytes.length>20_000_000)return fail('INPUT_LIMIT','Input must be UTF-8 bytes under 20 MB',{role});
 // Only the initial UTF-8 BOM bytes are transport metadata. Decode the remainder
 // without automatic BOM removal so a second or quoted literal marker survives.
 const offset=utf8Bytes[0]===0xef&&utf8Bytes[1]===0xbb&&utf8Bytes[2]===0xbf?3:0;
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(utf8Bytes.subarray(offset))}catch{return fail('UTF8','Invalid UTF-8',{role})}
 if(!text)return fail('EMPTY_CSV','CSV has no header',{role});
 const records:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false,atStart=true,ended=false;
 const emitCell=()=>{row.push(cell);cell='';closed=false;atStart=true};
 const emitRow=()=>{emitCell();records.push(row);row=[];ended=true};
 for(let i=0;i<text.length;i++){
  const c=text[i];ended=false;
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}
  if(closed&&c!==','&&c!=='\r'&&c!=='\n')return fail('MALFORMED_CSV','Unexpected character after closing quote',{role,row:records.length+1,column:String(row.length+1)});
  if(c==='"'){if(!atStart)return fail('MALFORMED_CSV','Quote inside unquoted field',{role,row:records.length+1,column:String(row.length+1)});quoted=true;atStart=false}
  else if(c===',')emitCell();
  else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;emitRow()}
  else{cell+=c;atStart=false}
 }
 if(quoted)return fail('MALFORMED_CSV','Unclosed quoted field',{role,row:records.length+1});
 if(!ended)emitRow();
 const headers=records.shift()!;
 if(headers.some(h=>h==='')||new Set(headers).size!==headers.length)return fail('HEADERS','Headers must be unique and nonempty',{role,row:1});
 for(let i=0;i<records.length;i++)if(records[i].length!==headers.length)return fail('RAGGED_ROW','Row width does not match header',{role,row:i+2});
 if(records.length>100000||headers.length>1000)return fail('INPUT_LIMIT','At most 100000 rows and 1000 columns',{role});
 const contentSha256=hash([headers,records]);
 return ok({id:contentSha256,rawSha256:hashBytes(utf8Bytes),contentSha256,headers,rows:records,rawUtf8:Array.from(utf8Bytes)});
}
function validateSnapshot(role:Role,s:Snapshot):Result<Snapshot>{
 if(!s||!Array.isArray(s.headers)||!Array.isArray(s.rows)||s.headers.some(h=>typeof h!=='string'||h==='')||new Set(s.headers).size!==s.headers.length||s.rows.some(r=>!Array.isArray(r)||r.length!==s.headers.length||r.some(c=>typeof c!=='string')))return fail('SNAPSHOT','Invalid snapshot',{role});
 if(s.id!==s.contentSha256||hash([s.headers,s.rows])!==s.contentSha256||! /^[a-f0-9]{64}$/.test(s.rawSha256))return fail('HASH_MISMATCH','Snapshot hash mismatch',{role});
 if(!s.rawUtf8||s.rawUtf8.some(b=>!Number.isInteger(b)||b<0||b>255))return fail('RAW_REQUIRED','Raw bytes required to validate snapshot',{role});
 const parsed=parseCsv(role,Uint8Array.from(s.rawUtf8));
 if(!parsed.ok)return parsed;
 if(parsed.value.rawSha256!==s.rawSha256||parsed.value.contentSha256!==s.contentSha256)return fail('HASH_MISMATCH','Raw and content hash mismatch',{role});
 return ok(s);
}
function binding(O:Snapshot,C:Snapshot,N:Snapshot,p:Policy):Binding {
 const ph=policyHash(p);return {generationHash:hash([O.rawSha256,O.contentSha256,C.rawSha256,C.contentSha256,N.rawSha256,N.contentSha256,ph]),inputHashes:{O:O.rawSha256,C:C.rawSha256,N:N.rawSha256},policyHash:ph,expectedRevision:0};
}
function comparison(a:Assessment):Comparison{return a.refreshed===a.old?'carry':a.refreshed===a.corrected?'upstream_fixed':'conflict'}
function setComparison(a:Assessment){a.state=comparison(a);a.comparison=a.state;a.resolved=a.state==='upstream_fixed';a.outputValue=a.refreshed;a.reason=a.state==='carry'?'Latest matches original; explicit inclusion required':a.state==='upstream_fixed'?'Latest already contains the correction':'Latest and correction both changed the original'}
function finish(s:ReviewState){s.holds=s.assessments.filter(a=>!a.resolved).map(a=>a.id);return s}
export function reconcile(O:Snapshot,C:Snapshot,N:Snapshot,policy:Policy):Result<ReviewState>{
 for(const [role,s] of Object.entries({O,C,N})){const v=validateSnapshot(role as Role,s);if(!v.ok)return v}
 if(!policy||typeof policy.keyColumn!=='string'||!Array.isArray(policy.identityColumns)||policy.identityColumns.some(c=>typeof c!=='string')||typeof policy.assumptionConfirmed!=='boolean'||typeof policy.assumptionReason!=='string'||new Set(policy.identityColumns).size!==policy.identityColumns.length||policy.identityColumns.includes(policy.keyColumn))return fail('POLICY','Invalid identity policy');
 const p=copy(policy);
 for(const [role,s] of Object.entries({O,C,N}))if(s.headers.length!==O.headers.length||O.headers.some(h=>!s.headers.includes(h)))return fail('SCHEMA','Input header sets differ',{role});
 if(!O.headers.includes(p.keyColumn)||p.identityColumns.some(c=>!O.headers.includes(c)))return fail('POLICY','Key and identity columns must exist');
 const maps={} as Record<Role,Map<string,string[]>>;
 for(const [role,s] of Object.entries({O,C,N}) as [Role,Snapshot][]){const m=new Map<string,string[]>();const ki=s.headers.indexOf(p.keyColumn);for(let i=0;i<s.rows.length;i++){const key=s.rows[i][ki];if(key===''||m.has(key))return fail(key===''?'BLANK_KEY':'DUPLICATE_KEY','Keys must be nonempty and unique',{role,row:i+2,column:p.keyColumn});m.set(key,s.rows[i])}maps[role]=m}
 if(maps.O.size!==maps.C.size||[...maps.O.keys()].some(k=>!maps.C.has(k)))return fail('KEY_SET','Original and corrected key sets differ',{role:'C',column:p.keyColumn});
 const b=binding(O,C,N,p),assessments:Assessment[]=[];
 for(const [key,oldRow] of maps.O){const c=maps.C.get(key)!,n=maps.N.get(key);
  for(const identity of p.identityColumns)if(oldRow[O.headers.indexOf(identity)]!==c[C.headers.indexOf(identity)])return fail('IDENTITY_EDIT','Corrected copy changes a stable identity field',{role:'C',column:identity,row:C.rows.indexOf(c)+2});
  for(const column of O.headers){if(column===p.keyColumn||p.identityColumns.includes(column))continue;const old=oldRow[O.headers.indexOf(column)],corrected=c[C.headers.indexOf(column)];if(old===corrected)continue;
   const a:Assessment={id:hash([b.generationHash,key,column]),key,column,old,corrected,refreshed:n?n[N.headers.indexOf(column)]:null,state:'orphan',reason:'Record missing from latest; never resurrected',resolved:false,outputValue:null};
   if(n){const known=p.identityColumns.length>0&&p.assumptionConfirmed&&p.assumptionReason.trim()!==''&&p.identityColumns.every(col=>oldRow[O.headers.indexOf(col)]===n[N.headers.indexOf(col)]);if(known)setComparison(a);else{a.state='identity_hold';a.comparison=comparison(a);a.reason='Record continuity unknown or identity fields changed; human assumption required';a.outputValue=a.refreshed}}
   assessments.push(a);
  }
 }
 return ok(finish({binding:b,snapshots:copy({O,C,N}),policy:p,assessments,events:[],holds:[]}));
}
const sameBinding=(a:Binding,b:Binding)=>!!b&&a.generationHash===b.generationHash&&a.policyHash===b.policyHash&&a.expectedRevision===b.expectedRevision&&(['O','C','N'] as Role[]).every(r=>a.inputHashes[r]===b.inputHashes?.[r]);
const choice=(a:Assessment):Choice=>({state:a.state,resolved:a.resolved,outputValue:a.outputValue,reason:a.reason});
function apply(a:Assessment,action:string,reason:string,value?:string):boolean{
 if(a.resolved)return false;
 if(a.state==='orphan'){if(action!=='acknowledge_omission')return false;a.resolved=true;a.reason='Omission acknowledged';return true}
 if(a.state==='identity_hold'){
  if(!reason.trim())return false;
  if(action==='retire'){a.resolved=true;a.outputValue=a.refreshed;a.reason=reason;return true}
  if(action==='confirm_continuity'){setComparison(a);a.reason+='; continuity assumed: '+reason;return true}return false;
 }
 if(a.state!=='carry'&&a.state!=='conflict')return false;
 if(a.state==='conflict'&&!reason.trim())return false;
 if(action==='apply')a.outputValue=a.corrected;
 else if(action==='keep_latest')a.outputValue=a.refreshed;
 else if(action==='replace'&&a.state==='conflict'&&typeof value==='string')a.outputValue=value;
 else return false;
 a.resolved=true;a.reason=reason||'Explicit '+action;return true;
}
export function resolve(state:ReviewState,request:ResolveRequest):Result<ReviewState>{
 if(!sameBinding(state.binding,request.binding))return fail('STALE_BINDING','Data or revision changed; reopen current review');
 const next=copy(state),a=next.assessments.find(a=>a.id===request.assessmentId);if(!a)return fail('ASSESSMENT','Unknown assessment');
 const before=choice(a);if(!apply(a,request.action,request.reason??'',request.value))return fail('INVALID_ACTION','Action is invalid for the current state, or requires a reason');
 const revision=++next.binding.expectedRevision,id=hash([next.binding.generationHash,revision,a.id,request.action]);
 next.events.push({id,eventId:id,revision,assessmentId:a.id,key:a.key,column:a.column,action:request.action,reason:request.reason??'',...(request.value!==undefined?{value:request.value}:{}),timestamp:new Date().toISOString(),before,after:choice(a)});
 return ok(finish(next));
}
function inactive(events:ReviewEvent[]){return new Set(events.flatMap(e=>e.action==='undo'?[e.reverses!,...(e.invalidates??[])]:[]))}
export function undoLegacy(state:ReviewState,request:{binding:Binding;eventId:string}):Result<ReviewState>{
 if(!sameBinding(state.binding,request.binding))return fail('STALE_BINDING','Data or revision changed; reopen current review');
 const dead=inactive(state.events),target=state.events.find(e=>e.id===request.eventId&&e.action!=='undo'&&!dead.has(e.id));if(!target)return fail('INVALID_ACTION','Event is not an active user decision');
 const base=reconcile(state.snapshots.O,state.snapshots.C,state.snapshots.N,state.policy);if(!base.ok)return base;
 const next=copy(state),a=next.assessments.find(a=>a.id===target.assessmentId)!,before=choice(a);
 const invalidates=target.action==='confirm_continuity'?state.events.filter(e=>e.assessmentId===a.id&&e.revision>target.revision&&e.action!=='undo'&&!dead.has(e.id)).map(e=>e.id):[];
 if(target.action==='confirm_continuity')invalidates.push(...activeApplications(state).map(e=>e.eventId));
 dead.add(target.id);invalidates.forEach(id=>dead.add(id));
 const rebuilt=base.value.assessments.find(v=>v.id===a.id)!;
 for(const e of state.events)if(e.assessmentId===a.id&&e.action!=='undo'&&!dead.has(e.id))if(!apply(rebuilt,e.action,e.reason,e.value))return fail('HISTORY','Cannot reconstruct active decisions');
 Object.assign(a,rebuilt);const revision=++next.binding.expectedRevision,id=hash([next.binding.generationHash,revision,'undo',target.id]);
 next.events.push({id,eventId:id,revision,assessmentId:a.id,key:a.key,column:a.column,action:'undo',reason:'Reversed decision; previous downloads unchanged',timestamp:new Date().toISOString(),before,after:choice(a),reverses:target.id,invalidates});return ok(finish(next));
}
export function preview(state:ReviewState):Result<Preview>{
 const n=state.snapshots.N,rows=copy(n.rows),changedCells:Preview['changedCells']=[],counts:Preview['counts']={carry:0,upstream_fixed:0,conflict:0,orphan:0,identity_hold:0};
 const keyIndex=n.headers.indexOf(state.policy.keyColumn),indices=new Map(rows.map((r,i)=>[r[keyIndex],i]));
 for(const a of state.assessments){counts[a.state]++;if(!a.resolved||a.outputValue===null||a.state==='orphan')continue;const ri=indices.get(a.key);if(ri===undefined)return fail('STATE','Target row missing');const ci=n.headers.indexOf(a.column),before=rows[ri][ci];rows[ri][ci]=a.outputValue;if(before!==a.outputValue)changedCells.push({key:a.key,column:a.column,before,after:a.outputValue})}
 for(const event of activeApplications(state))for(const cell of event.cells??[]){if(cell.decision!=='ELIGIBLE')continue;if(cell.column===state.policy.keyColumn||state.policy.identityColumns.includes(cell.column))return fail('RULE_INVALID','Rule cannot alter identity');const ri=indices.get(cell.key),ci=n.headers.indexOf(cell.column);if(ri===undefined||ci<0)return fail('STATE','Rule target missing');const before=rows[ri][ci];rows[ri][ci]=cell.after;if(before!==cell.after)changedCells.push({key:cell.key,column:cell.column,before,after:cell.after})}
 return ok({headers:[...n.headers],rows,changedCells,holds:state.assessments.filter(a=>!a.resolved).map(a=>a.id),counts});
}
function history(state:ReviewState,final?:{exportId:string;outputSha256:string;revision:number}){return JSON.stringify({schema:state.intelligence?'mendline-history/v2':'mendline-history/v1',...(state.intelligence?{intelligence:state.intelligence}:{}),generation:state.binding.generationHash,binding:state.binding,snapshots:state.snapshots,policy:state.policy,corrections:state.assessments.map(({id,key,column,old,corrected})=>({id,key,column,old,corrected})),assessments:state.assessments,events:state.events,holds:state.holds,omissions:state.assessments.filter(a=>a.state==='orphan'),retirements:state.events.filter(e=>e.action==='retire'),complete:!!final,...final},null,2)}
export function exportHistory(state:ReviewState):Result<string>{return ok(history(state))}
export function exportReviewed(state:ReviewState,b:Binding):Result<ReviewedExport>{
 if(!sameBinding(state.binding,b))return fail('STALE_BINDING','Data or revision changed; reopen current review');
 // Reconstruct before final export so altered in-memory snapshots, policy or decisions cannot bypass holds.
 const integrity=validateHistory(history(state));if(!integrity.ok)return integrity;
 const p=preview(integrity.value);if(!p.ok)return p;if(p.value.holds.length)return fail('UNRESOLVED','Resolve every correction before final export');
 const coordinates:{row:number;column:string}[]=[];
 for(const [i,row] of [p.value.headers,...p.value.rows].entries())for(const [j,cell] of row.entries())if(/^[\u0000-\u0020]*[=+@-]/.test(cell))coordinates.push({row:i+1,column:p.value.headers[j]});
 if(coordinates.length)return fail('FORMULA_HOLD','Formula-risk cells block CSV export',{coordinates,row:coordinates[0].row,column:coordinates[0].column});
 const csvUtf8=serializeCsv(p.value.headers,p.value.rows),outputSha256=hashBytes(csvUtf8),revision=b.expectedRevision,exportId=hash([b.generationHash,revision,outputSha256]);
 return ok({csvUtf8,historyJson:history(state,{exportId,outputSha256,revision}),exportId,revision});
}

export {importHistory,saveSession,loadSession,clearSession,SESSION_STORAGE_KEY} from './recovery';
export type {SessionStorage} from './recovery';

export function undo(state:ReviewState,request:{binding:Binding;eventId:string}):Result<ReviewState>{return state.intelligence?.events.some(e=>e.eventId===request.eventId)?undoRuleV1(state,{...request,reason:'Explicit undo'}):undoLegacy(state,request)}
export {teachRuleV1,decideRuleV1,previewRuleV1,decideApplicationV1,undoRuleV1} from '../rules/intelligence';
export type {PredicateV1,RuleSpecV1,RuleAlternativeV1,TeachingV1,RuleRefV1,RuleRecordV1,RuleCellV1,RuleReceiptV1,RulePreviewV1,IntelligenceV1,IntelligenceEventV1} from '../rules/intelligence';

export {extractRuleProposalV1,decideReusedRuleV1} from '../rules/intelligence';
export type {RuleProposalV1} from '../rules/intelligence';
