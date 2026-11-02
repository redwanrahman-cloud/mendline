import {decideRuleRaw,decideApplicationRaw,undoRuleRaw,canonical} from '../rules/intelligence';
import type {IntelligenceEventV1} from '../rules/intelligence';
import {reconcile,resolve,undoLegacy,exportReviewed,exportHistory} from './index';
import type {ReviewState,Result,Binding,ReviewEvent} from './types';
const fail=(code:string,message:string):Result<never>=>({ok:false,error:{code,message}});
// Recovery reconstructs only the enclosed immutable generation. No decisions are
// applied to separately imported/replaced files. Optional expected binding guards a current desk.
let importDepth=0;
export function importHistory(text:string,expected?:Binding):Result<ReviewState>{
 if(importDepth>=8)return fail('HISTORY_LIMIT','Source provenance nesting exceeds eight levels');
 importDepth++;
 try{return importHistoryDocument(text,expected)}finally{importDepth--}
}
function importHistoryDocument(text:string,expected?:Binding):Result<ReviewState>{
 try{
  if(typeof text!=='string'||text.length>100_000_000)return fail('HISTORY_LIMIT','History exceeds recovery limit');
  const h=JSON.parse(text);
  if(!['mendline-history/v1','mendline-history/v2'].includes(h.schema)||!h.snapshots||!h.policy||!Array.isArray(h.events)||h.events.length>100000||typeof h.complete!=='boolean')return fail('HISTORY_SCHEMA','Unsupported or malformed history');
  const base=reconcile(h.snapshots.O,h.snapshots.C,h.snapshots.N,h.policy);if(!base.ok)return base;
  let state=base.value;
  if(h.generation!==state.binding.generationHash)return fail('HASH_MISMATCH','Generation does not match enclosed files and policy');
  if(expected&&(expected.generationHash!==h.generation||expected.policyHash!==h.binding?.policyHash||expected.expectedRevision!==h.binding?.expectedRevision||(['O','C','N'] as const).some(r=>expected.inputHashes[r]!==h.binding?.inputHashes?.[r])))return fail('STALE_BINDING','History does not match the current desk binding');
  const intelligence=h.schema==='mendline-history/v2';
  if(intelligence&&(!h.intelligence||h.intelligence.schema!=='mendline-intelligence/v1'||!Array.isArray(h.intelligence.events)||h.intelligence.events.length>100000))return fail('HISTORY_SCHEMA','Malformed intelligence history');
  if(!intelligence&&h.intelligence)return fail('HISTORY_SCHEMA','Legacy history cannot contain intelligence');
  const merged=[...h.events,...(intelligence?h.intelligence.events:[])].sort((a,b)=>a.revision-b.revision);
  for(const e of merged){
   if(e.revision!==state.binding.expectedRevision+1)return fail('HISTORY_MISMATCH','Global revisions must be contiguous');
   if('kind' in e){
    const event=e as IntelligenceEventV1;
    let next:Result<ReviewState>;
    if(event.kind==='approve_rule'||event.kind==='reject_rule'){
     const previous=event.rule&&event.rule.version>1?state.intelligence?.rules.find(v=>v.active&&v.ref.ruleId===event.rule?.ruleId):undefined;
     const candidate=event.teaching?.alternatives.find(a=>canonical(a.operation)===canonical(event.spec?.operation));
     next=decideRuleRaw(state,{binding:event.bindingBefore,teaching:event.teaching!,candidateId:candidate?.candidateId??'',predicate:event.spec?.predicate!,decision:event.kind==='approve_rule'?'approve':'reject',reason:event.reason,...(event.provenance?{provenance:event.provenance}:{}),...(previous?{revise:previous.ref}:{})});
    }else if(event.kind==='apply_rule'||event.kind==='reject_application')next=decideApplicationRaw(state,{receipt:event.receipt!,decision:event.kind==='apply_rule'?'approve':'reject',reason:event.reason});
    else if(event.kind==='undo_rule')next=undoRuleRaw(state,{binding:event.bindingBefore,eventId:event.reverses!,reason:event.reason});
    else return fail('HISTORY_MISMATCH','Unknown intelligence event');
    if(!next.ok)return next;
    const generated=next.value.intelligence!.events.at(-1)!;generated.timestamp=event.timestamp;
    if(typeof event.timestamp!=='string'||!Number.isFinite(Date.parse(event.timestamp))||canonical(generated)!==canonical(event))return fail('HISTORY_MISMATCH','Intelligence event does not reconstruct');
    state=next.value;continue;
   }
   if(typeof e.timestamp!=='string'||!Number.isFinite(Date.parse(e.timestamp)))return fail('HISTORY_SCHEMA','Event timestamp is invalid');
   const next=e.action==='undo'?undoLegacy(state,{binding:state.binding,eventId:e.reverses!}):resolve(state,{binding:state.binding,assessmentId:e.assessmentId,action:e.action,reason:e.reason,value:e.value});
   if(!next.ok)return next;
   const generated=next.value.events.at(-1)!;
   // Timestamp is provenance only; every semantic field must reconstruct exactly.
   generated.timestamp=e.timestamp;
   if(JSON.stringify(generated)!==JSON.stringify(e))return fail('HISTORY_MISMATCH','Event does not reconstruct from recorded decisions');
   state=next.value;
  }
  const serialized=exportHistory(state);if(!serialized.ok)return serialized;
  const c=JSON.parse(serialized.value);
  for(const field of ['events','binding','assessments','corrections','holds','omissions','retirements',...(intelligence?['intelligence']:[])])if(canonical(c[field])!==canonical(h[field]))return fail('HISTORY_MISMATCH','History '+field+' does not reconstruct');
  if(h.complete){const final=exportReviewed(state,state.binding);if(!final.ok)return final;const f=JSON.parse(final.value.historyJson);if(f.exportId!==h.exportId||f.outputSha256!==h.outputSha256||f.revision!==h.revision)return fail('HASH_MISMATCH','Final output receipt mismatch')}
  else if('exportId' in h||'outputSha256' in h||'revision' in h)return fail('HISTORY_SCHEMA','Incomplete history must not claim a final output');
  return {ok:true,value:state};
 }catch{return fail('HISTORY_SCHEMA','History is not a valid recoverable document')}
}
export const SESSION_STORAGE_KEY='mendline.review.v1';
export interface SessionStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export function saveSession(state:ReviewState,storage:SessionStorage=localStorage):Result<void>{
 const h=exportHistory(state);if(!h.ok)return h;
 try{storage.setItem(SESSION_STORAGE_KEY,h.value);if(storage.getItem(SESSION_STORAGE_KEY)!==h.value)return fail('PERSISTENCE','Session readback failed');return {ok:true,value:undefined}}catch{return fail('PERSISTENCE','Browser storage failed; download history before leaving')}
}
export function loadSession(storage:SessionStorage=localStorage):Result<ReviewState|null>{try{const text=storage.getItem(SESSION_STORAGE_KEY);return text===null?{ok:true,value:null}:importHistory(text)}catch{return fail('PERSISTENCE','Cannot read browser session')}}
export function clearSession(storage:SessionStorage=localStorage):Result<void>{try{storage.removeItem(SESSION_STORAGE_KEY);return {ok:true,value:undefined}}catch{return fail('PERSISTENCE','Cannot clear browser session')}}
