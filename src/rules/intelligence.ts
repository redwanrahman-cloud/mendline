import {sha256} from '@noble/hashes/sha256';
import {bytesToHex} from '@noble/hashes/utils';
import {inferOneExample,transform} from './index';
import type {Example,Operation} from './index';
import type {Binding,ReviewState,Result} from '../engine/types';
import {importHistory} from '../engine/recovery';
import {exportHistory} from '../engine/index';
export type PredicateV1={kind:'exactValues';values:readonly string[]}|{kind:'startsWith';value:string};
export interface RuleSpecV1 {schema:'mendline-rule/v1';column:string;operation:Operation;predicate:PredicateV1}
export interface RuleAlternativeV1 {candidateId:string;operation:Operation;description:string;assumptions:readonly string[]}
export interface TeachingV1 {schema:'mendline-teaching/v1';teachingId:string;column:string;examples:readonly Example[];alternatives:readonly RuleAlternativeV1[];status:'ALTERNATIVES'|'SINGLE'|'ABSTAIN';reason:string;distinguishing:readonly {input:string;predictions:readonly {candidateId:string;output:string}[]}[]}
export interface RuleRefV1 {ruleId:string;version:number;specHash:string}
export interface RuleRecordV1 {ref:RuleRefV1;spec:RuleSpecV1;teaching:TeachingV1;approval:{eventId:string;reason:string};active:boolean;provenance?:RuleProposalV1}
export interface RuleCellV1 {cellId:string;key:string;column:string;before:string;after:string;decision:'ELIGIBLE'|'NO_CHANGE'|'OUT_OF_SCOPE'|'HOLD';reason:string;assessmentId?:string}
export interface RuleReceiptV1 {schema:'mendline-rule-preview/v1';binding:Binding;rule:RuleRefV1;previewHash:string}
export interface RulePreviewV1 {receipt:RuleReceiptV1;cells:readonly RuleCellV1[];changedCells:readonly RuleCellV1[]}
export interface IntelligenceEventV1 {eventId:string;revision:number;timestamp:string;kind:'approve_rule'|'reject_rule'|'apply_rule'|'reject_application'|'undo_rule';bindingBefore:Binding;rule?:RuleRefV1;teaching?:TeachingV1;spec?:RuleSpecV1;reason:string;receipt?:RuleReceiptV1;cells?:readonly RuleCellV1[];reverses?:string;invalidates?:readonly string[];provenance?:RuleProposalV1}
export interface IntelligenceV1 {schema:'mendline-intelligence/v1';rules:readonly RuleRecordV1[];events:readonly IntelligenceEventV1[]}
export const canonical=(v:unknown):string=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(canonical(v))));
const eq=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const ok=<T>(value:T):Result<T>=>({ok:true,value});
const fail=(code:string,message:string):Result<never>=>({ok:false,error:{code,message}});
const clone=<T>(x:T):T=>structuredClone(x);
export function teachRuleV1(column:string,examples:readonly Example[]):Result<TeachingV1>{
 if(typeof column!=='string'||!column.trim()||!Array.isArray(examples)||examples.length<1||examples.length>32||examples.some(e=>!e||typeof e.input!=='string'||typeof e.output!=='string'||e.input.length>256||e.output.length>256))return fail('RULE_INVALID','Require a column and 1..32 bounded string examples');
 const pairs=new Map<string,string>();for(const e of examples){if(pairs.has(e.input)&&pairs.get(e.input)!==e.output)return fail('RULE_INVALID','Contradictory examples');pairs.set(e.input,e.output)}
 if(!examples.some(e=>e.input!==e.output))return fail('RULE_INVALID','A changed example is required');
 const evidence=[...pairs].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([input,output])=>({input,output}));
 const proposal=inferOneExample(column,evidence);
 const alternatives=proposal.candidates.map(c=>({candidateId:digest(c.operation),operation:clone(c.operation),description:c.description,assumptions:['Explicit human scope required; examples do not establish universal intent']}));
 const inputs=new Set<string>();for(const e of evidence){inputs.add(e.input+e.input);for(const a of alternatives)if(a.operation.kind==='removePrefix'){inputs.add(a.operation.prefix+e.input);inputs.add(a.operation.prefix+'cup')}}
 const distinguishing=[...inputs].filter(x=>x.length<=256&&!pairs.has(x)).map(input=>({input,predictions:alternatives.map(a=>({candidateId:a.candidateId,output:transform(a.operation,input)}))})).filter(d=>new Set(d.predictions.map(p=>p.output)).size>1).slice(0,16);
 const status:TeachingV1['status']=alternatives.length>1?'ALTERNATIVES':alternatives.length?'SINGLE':'ABSTAIN';
 const body={schema:'mendline-teaching/v1' as const,column,examples:evidence,alternatives,status,reason:distinguishing.length?'Human selection and explicit scope required':'Human example needed; no safe informative discriminator found',distinguishing};
 return ok({...body,teachingId:digest(body)});
}
const safeColumn=(s:ReviewState,c:string)=>s.snapshots.N.headers.includes(c)&&c!==s.policy.keyColumn&&!s.policy.identityColumns.includes(c);
function predicateValid(p:PredicateV1):boolean{return !!p&&(p.kind==='startsWith'?typeof p.value==='string'&&p.value.length>0&&p.value.length<=256&&eq(Object.keys(p).sort(),['kind','value']):p.kind==='exactValues'&&Array.isArray(p.values)&&p.values.length>0&&p.values.length<=32&&p.values.every(v=>typeof v==='string'&&v.length<=256)&&eq(Object.keys(p).sort(),['kind','values']))}
export function inactiveRuleEvents(s:ReviewState):Set<string>{return new Set([...(s.intelligence?.events.flatMap(e=>e.kind==='undo_rule'?[e.reverses!,...(e.invalidates??[])]:[])??[]),...s.events.flatMap(e=>e.invalidates??[])])}
export function activeApplications(s:ReviewState):IntelligenceEventV1[]{const dead=inactiveRuleEvents(s);return s.intelligence?.events.filter(e=>e.kind==='apply_rule'&&!dead.has(e.eventId))??[]}
function checked(s:ReviewState):Result<ReviewState>{const h=exportHistory(s);return h.ok?importHistory(h.value):h}
function append(s:ReviewState,event:Omit<IntelligenceEventV1,'eventId'|'revision'|'timestamp'|'bindingBefore'>):ReviewState{
 const n=clone(s);n.intelligence??={schema:'mendline-intelligence/v1',rules:[],events:[]};const revision=++n.binding.expectedRevision;
 n.intelligence.events=[...n.intelligence.events,{...clone(event),bindingBefore:clone(s.binding),revision,eventId:digest([s.binding.generationHash,revision,event]),timestamp:new Date().toISOString()}];return n;
}
export type RuleDecisionRequestV1={binding:Binding;teaching:TeachingV1;candidateId:string;predicate:PredicateV1;decision:'approve'|'reject';reason:string;revise?:RuleRefV1;provenance?:RuleProposalV1};
export function decideRuleRaw(s:ReviewState,r:RuleDecisionRequestV1):Result<ReviewState>{
 if(!eq(s.binding,r?.binding))return fail('STALE_BINDING','Current full binding required');
 if(!r.teaching||!safeColumn(s,r.teaching.column)||!predicateValid(r.predicate)||!['approve','reject'].includes(r.decision)||typeof r.reason!=='string'||!r.reason.trim())return fail('RULE_INVALID','Unsafe column, predicate or decision');
 if(r.provenance){const v=validateRuleProposalV1(r.provenance);if(!v.ok)return v;if(!eq(r.teaching,v.value.sourceRule.teaching)||!eq(r.predicate,v.value.sourceRule.spec.predicate)||!eq(r.teaching.alternatives.find(a=>a.candidateId===r.candidateId)?.operation,v.value.sourceRule.spec.operation)||r.revise)return fail('RULE_INVALID','Reuse must preserve source intent without retargeting');}
 const t=teachRuleV1(r.teaching.column,r.teaching.examples);if(!t.ok||!eq(t.value,r.teaching))return fail('RULE_INVALID','Teaching does not reconstruct');
 const candidate=t.value.alternatives.find(a=>a.candidateId===r.candidateId);if(!candidate)return fail('RULE_INVALID','Candidate is not a teaching alternative');
 const previous=r.revise?s.intelligence?.rules.find(v=>v.active&&eq(v.ref,r.revise)):undefined;
 if(r.revise&&!previous)return fail('RULE_REF','Revision requires exact active reference');
 if(previous&&previous.spec.column!==t.value.column)return fail('RULE_INVALID','Cannot revise another column');
 const spec:RuleSpecV1={schema:'mendline-rule/v1',column:t.value.column,operation:clone(candidate.operation),predicate:clone(r.predicate)};
 const ref={ruleId:previous?.ref.ruleId??digest([t.value.teachingId,t.value.column]),version:previous?previous.ref.version+1:1,specHash:digest(spec)};
 if(r.decision==='approve'&&s.intelligence?.rules.some(v=>eq(v.ref,ref)))return fail('RULE_REF','Rule already decided; revise explicitly');
 const n=append(s,{kind:r.decision==='approve'?'approve_rule':'reject_rule',teaching:t.value,spec,rule:ref,reason:r.reason,...(r.provenance?{provenance:r.provenance}:{})});
 if(r.decision==='approve'){if(previous){n.intelligence!.rules=n.intelligence!.rules.map(v=>v.ref.ruleId===ref.ruleId?{...v,active:false}:v)}n.intelligence!.rules=[...n.intelligence!.rules,{ref,spec,teaching:t.value,approval:{eventId:n.intelligence!.events.at(-1)!.eventId,reason:r.reason},active:true,...(r.provenance?{provenance:clone(r.provenance)}:{})}]}
 return ok(n);
}
export function previewRuleRaw(s:ReviewState,ref:RuleRefV1):Result<RulePreviewV1>{
 const rule=s.intelligence?.rules.find(v=>v.active&&eq(v.ref,ref));if(!rule)return fail('RULE_REF','Exact active rule required');
 if(!safeColumn(s,rule.spec.column)||digest(rule.spec)!==ref.specHash)return fail('RULE_INVALID','Unsafe or modified specification');
 const {O,N}=s.snapshots,p=s.policy,column=rule.spec.column,ci=N.headers.indexOf(column),ki=N.headers.indexOf(p.keyColumn),oi=O.headers.indexOf(p.keyColumn);
 const originals=new Map(O.rows.map(row=>[row[oi],row]));const applications=activeApplications(s);
 const cells=N.rows.map(row=>{const key=row[ki],before=row[ci],predicate=rule.spec.predicate;
 const cell:RuleCellV1={cellId:digest([s.binding.generationHash,key,column]),key,column,before,after:before,decision:'OUT_OF_SCOPE',reason:'Outside explicitly approved predicate'};
 if(!(predicate.kind==='startsWith'?before.startsWith(predicate.value):predicate.values.includes(before)))return cell;
 const old=originals.get(key);const assessment=s.assessments.find(a=>a.key===key&&a.column===column);
 if(assessment){cell.decision='HOLD';cell.reason='Existing correction owns cell';cell.assessmentId=assessment.id;return cell}
 if(!old||!p.identityColumns.length||!p.assumptionConfirmed||!p.assumptionReason.trim()||!p.identityColumns.every(c=>old[O.headers.indexOf(c)]!==''&&old[O.headers.indexOf(c)]===row[N.headers.indexOf(c)])){cell.decision='HOLD';cell.reason='Identity continuity unknown';return cell}
 if(applications.some(e=>e.cells?.some(c=>c.cellId===cell.cellId&&c.decision==='ELIGIBLE'))){cell.decision='HOLD';cell.reason='Active rule application owns cell';return cell}
 cell.after=transform(rule.spec.operation,before);cell.decision=cell.after===before?'NO_CHANGE':'ELIGIBLE';cell.reason=cell.decision==='ELIGIBLE'?'Explicit approved scope and known continuity':'Operation leaves value unchanged';return cell;
 });
 const binding=clone(s.binding);return ok({receipt:{schema:'mendline-rule-preview/v1',binding,rule:clone(ref),previewHash:digest({binding,rule:ref,spec:rule.spec,cells})},cells,changedCells:cells.filter(c=>c.decision==='ELIGIBLE')});
}
export type ApplicationRequestV1={receipt:RuleReceiptV1;decision:'approve'|'reject';reason:string};
export function decideApplicationRaw(s:ReviewState,r:ApplicationRequestV1):Result<ReviewState>{
 if(!eq(s.binding,r?.receipt?.binding))return fail('STALE_BINDING','Preview binding is stale');
 if(!['approve','reject'].includes(r.decision)||typeof r.reason!=='string'||!r.reason.trim())return fail('RULE_INVALID','Explicit decision and reason required');
 const p=previewRuleRaw(s,r.receipt.rule);if(!p.ok)return p;if(!eq(p.value.receipt,r.receipt))return fail('RECEIPT_MISMATCH','Preview receipt does not reconstruct');
 return ok(append(s,{kind:r.decision==='approve'?'apply_rule':'reject_application',rule:r.receipt.rule,receipt:r.receipt,cells:p.value.cells,reason:r.reason}));
}
export type RuleUndoRequestV1={binding:Binding;eventId:string;reason:string};
export function undoRuleRaw(s:ReviewState,r:RuleUndoRequestV1):Result<ReviewState>{
 if(!eq(s.binding,r?.binding))return fail('STALE_BINDING','Current binding required');
 const dead=inactiveRuleEvents(s),target=s.intelligence?.events.find(e=>e.eventId===r.eventId&&!dead.has(e.eventId)&&['apply_rule','approve_rule'].includes(e.kind));
 if(!target||typeof r.reason!=='string'||!r.reason.trim())return fail('RULE_INVALID','An active approval/application and explicit reason are required');
 const invalidates=target.kind==='approve_rule'?s.intelligence!.events.filter(e=>e.eventId!==target.eventId&&e.rule?.ruleId===target.rule?.ruleId&&e.revision>target.revision&&!dead.has(e.eventId)).map(e=>e.eventId):[];
 const n=append(s,{kind:'undo_rule',reason:r.reason,reverses:target.eventId,invalidates,rule:target.rule});
 if(target.kind==='approve_rule')n.intelligence!.rules=n.intelligence!.rules.map(v=>v.ref.ruleId===target.rule!.ruleId?{...v,active:false}:v);
 return ok(n);
}
export function decideRuleV1(s:ReviewState,r:RuleDecisionRequestV1):Result<ReviewState>{const v=checked(s);return v.ok?decideRuleRaw(v.value,r):v}
export function previewRuleV1(s:ReviewState,r:RuleRefV1):Result<RulePreviewV1>{const v=checked(s);return v.ok?previewRuleRaw(v.value,r):v}
export function decideApplicationV1(s:ReviewState,r:ApplicationRequestV1):Result<ReviewState>{const v=checked(s);return v.ok?decideApplicationRaw(v.value,r):v}
export function undoRuleV1(s:ReviewState,r:RuleUndoRequestV1):Result<ReviewState>{const v=checked(s);return v.ok?undoRuleRaw(v.value,r):v}

export interface RuleProposalV1 {
 schema:'mendline-rule-proposal/v1';status:'INACTIVE';sourceHistory:string;
 sourceHistoryHash:string;sourceBinding:Binding;sourceRule:RuleRecordV1;
}
export function extractRuleProposalV1(sourceHistory:string,ref:RuleRefV1):Result<RuleProposalV1>{
 const source=importHistory(sourceHistory);if(!source.ok)return source;
 const rule=source.value.intelligence?.rules.find(r=>r.active&&eq(r.ref,ref));
 if(!rule)return fail('RULE_REF','Exact active source approval required');
 return ok({schema:'mendline-rule-proposal/v1',status:'INACTIVE',sourceHistory,sourceHistoryHash:digest(sourceHistory),sourceBinding:clone(source.value.binding),sourceRule:clone(rule)});
}
export function validateRuleProposalV1(p:RuleProposalV1):Result<RuleProposalV1>{
 if(!p||p.schema!=='mendline-rule-proposal/v1'||p.status!=='INACTIVE'||typeof p.sourceHistory!=='string'||!p.sourceRule?.ref)return fail('RULE_INVALID','Inactive source-backed proposal required');
 const rebuilt=extractRuleProposalV1(p.sourceHistory,p.sourceRule.ref);if(!rebuilt.ok)return rebuilt;
 return eq(p,rebuilt.value)?rebuilt:fail('HISTORY_MISMATCH','Source proposal does not reconstruct');
}
export function decideReusedRuleV1(s:ReviewState,r:{binding:Binding;proposal:RuleProposalV1;decision:'approve'|'reject';reason:string}):Result<ReviewState>{
 if(!eq(s.binding,r?.binding))return fail('STALE_BINDING','Current target full binding required');
 const p=validateRuleProposalV1(r.proposal);if(!p.ok)return p;
 const source=p.value.sourceRule,candidate=source.teaching.alternatives.find(a=>eq(a.operation,source.spec.operation));
 if(!candidate)return fail('RULE_INVALID','Source selected operation missing');
 return decideRuleV1(s,{binding:r.binding,teaching:source.teaching,candidateId:candidate.candidateId,predicate:source.spec.predicate,decision:r.decision,reason:r.reason,provenance:p.value});
}
