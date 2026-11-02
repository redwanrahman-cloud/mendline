import {describe,it,expect} from 'vitest';
import {parseCsv,reconcile,resolve,undo,preview,exportReviewed,exportHistory,importHistory,saveSession,loadSession,hashBytes,teachRuleV1,decideRuleV1,previewRuleV1,decideApplicationV1,undoRuleV1} from '../../src/engine';
import type {Result,ReviewState,Role,RuleRefV1,TeachingV1,RuleReceiptV1} from '../../src/engine';
import {proposeCandidates,previewEffect} from '../../src/rules';
function value<T>(r:Result<T>):T{if(!r.ok)throw Error(JSON.stringify(r.error));return r.value}
const O='id,identity,label\na,I-a,SKU:tea\nb,I-b,SKU:cup\nd,I-d,SKU:SKU:tea\no,I-o,plain\nu,I-u,SKU:unsafe\nc,I-c,SKU:old';
const N='label,id,identity\nSKU:cup,b,I-b\nSKU:unsafe,u,REUSED\nplain,o,I-o\nSKU:new,c,I-c\nSKU:SKU:tea,d,I-d\nSKU:tea,a,I-a';
const snap=(role:Role,text:string)=>value(parseCsv(role,new TextEncoder().encode(text)));
function start(n=N){return value(reconcile(snap('O',O),snap('C',O.replace('c,I-c,SKU:old','c,I-c,old')),snap('N',n),{keyColumn:'id',identityColumns:['identity'],assumptionConfirmed:true,assumptionReason:'Fictional stable identity confirmed for this review'}))}
const examples=[{input:'SKU:tea',output:'tea'},{input:'SKU:SKU:tea',output:'SKU:tea'}];
const teach=()=>value(teachRuleV1('label',examples));
function rule(s=start(),t=teach(),decision:'approve'|'reject'='approve'){return value(decideRuleV1(s,{binding:s.binding,teaching:t,candidateId:t.alternatives.find(a=>a.operation.kind==='removePrefix')!.candidateId,predicate:{kind:'startsWith',value:'SKU:'},decision,reason:'Human selects prefix and unseen SKU scope'}))}
const ref=(s:ReviewState)=>s.intelligence!.rules.find(r=>r.active)!.ref;
const receipt=(s:ReviewState)=>value(previewRuleV1(s,ref(s))).receipt;
function apply(s:ReviewState,decision:'approve'|'reject'='approve'){return value(decideApplicationV1(s,{receipt:receipt(s),decision,reason:'Reviewed three changes and two exclusions'}))}
function complete(s:ReviewState){return value(resolve(s,{binding:s.binding,assessmentId:s.assessments[0].id,action:'keep_latest',reason:'Source change retained'}))}
function unchanged<T>(s:ReviewState,call:()=>Result<T>,code?:string){const before=JSON.stringify(s),r=call();expect(r.ok).toBe(false);if(code)expect(r).toMatchObject({error:{code}});expect(JSON.stringify(s)).toBe(before)}
describe('Nine-step correction intent demonstration (engine only)',()=>{
 it('keeps competing operations and distinguishing predictions; legacy remains exact only',()=>{
  const t=value(teachRuleV1('label',[examples[0]]));expect(t.status).toBe('ALTERNATIVES');expect(t.alternatives.some(a=>a.operation.kind==='removePrefix')).toBe(true);expect(t.alternatives.some(a=>a.operation.kind==='literalReplace'&&a.operation.from==='SKU:'&&a.operation.to==='')).toBe(true);
  const d=t.distinguishing.find(d=>d.input==='SKU:SKU:tea')!;expect(new Set(d.predictions.map(p=>p.output))).toEqual(new Set(['SKU:tea','tea']));
  const t2=teach();expect(t2.status).toBe('ALTERNATIVES');expect(t2.alternatives.some(a=>a.operation.kind==='literalReplace'&&a.operation.from==='SKU:')).toBe(false);expect(t2.distinguishing.some(d=>d.input==='SKU:cup')).toBe(true);
  const p=proposeCandidates('label',examples);expect(p.candidates.length).toBeGreaterThan(1);for(const c of p.candidates)expect(previewEffect(c,'label','SKU:cup')).toBeNull();expect(proposeCandidates('label',[examples[0]]).status).toBe('ABSTAIN');
 });
 it('previews unseen values by keys/headers, holds identity and conflict, records rejection, exports, recovers and undoes',()=>{
  const initial=start(),original=JSON.stringify(initial),s=rule(initial),p=value(previewRuleV1(s,ref(s)));
  expect(p.cells.map(c=>[c.key,c.decision])).toEqual([['b','ELIGIBLE'],['u','HOLD'],['o','OUT_OF_SCOPE'],['c','HOLD'],['d','ELIGIBLE'],['a','ELIGIBLE']]);expect(p.changedCells).toHaveLength(3);
  const rejected=apply(s,'reject');expect(value(preview(rejected)).changedCells).toHaveLength(0);expect(rejected.intelligence!.events.at(-1)!.kind).toBe('reject_application');
  const applied=apply(rejected);expect(exportReviewed(applied,applied.binding)).toMatchObject({error:{code:'UNRESOLVED'}});expect(applied.intelligence!.events.at(-1)!.cells!.filter(c=>c.decision==='HOLD')).toHaveLength(2);
  const done=complete(applied),out=value(exportReviewed(done,done.binding));expect(value(parseCsv('N',out.csvUtf8)).rows).toEqual([['cup','b','I-b'],['SKU:unsafe','u','REUSED'],['plain','o','I-o'],['SKU:new','c','I-c'],['SKU:tea','d','I-d'],['tea','a','I-a']]);expect(JSON.stringify(initial)).toBe(original);
  const restored=value(importHistory(out.historyJson,done.binding));expect(hashBytes(value(exportReviewed(restored,restored.binding)).csvUtf8)).toBe(hashBytes(out.csvUtf8));expect(restored.intelligence).toEqual(done.intelligence);
  const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v)},removeItem:(k:string)=>{store.delete(k)}};expect(saveSession(done,storage).ok).toBe(true);expect(value(loadSession(storage))!.intelligence).toEqual(done.intelligence);
  const application=done.intelligence!.events.find(e=>e.kind==='apply_rule')!,undone=value(undo(done,{binding:done.binding,eventId:application.eventId}));expect(value(preview(undone)).rows).toEqual(done.snapshots.N.rows);expect(value(preview(undone)).changedCells).toHaveLength(0);expect(value(importHistory(value(exportHistory(undone)))).intelligence).toEqual(undone.intelligence);expect(exportReviewed(undone,undone.binding).ok).toBe(true);
  unchanged(undone,()=>undoRuleV1(undone,{binding:undone.binding,eventId:application.eventId,reason:'Again'}));
  const approval=done.intelligence!.events.find(e=>e.kind==='approve_rule')!,unapproved=value(undoRuleV1(done,{binding:done.binding,eventId:approval.eventId,reason:'Withdraw scope'}));expect(unapproved.intelligence!.rules.every(r=>!r.active)).toBe(true);expect(value(preview(unapproved)).changedCells).toHaveLength(0);expect(importHistory(value(exportHistory(unapproved))).ok).toBe(true);
 });
 it('rejects stale and tampered receipts without mutation',()=>{
  const s=rule(),p=receipt(s);
  for(const edit of [(r:RuleReceiptV1)=>{r.binding.expectedRevision++},(r:RuleReceiptV1)=>{r.binding.generationHash='x'},(r:RuleReceiptV1)=>{r.binding.inputHashes.N='x'},(r:RuleReceiptV1)=>{r.binding.policyHash='x'},(r:RuleReceiptV1)=>{r.rule.version++},(r:RuleReceiptV1)=>{r.rule.specHash='x'},(r:RuleReceiptV1)=>{r.previewHash='x'}]){const r=structuredClone(p);edit(r);unchanged(s,()=>decideApplicationV1(s,{receipt:r,decision:'approve',reason:'test'}))}
  const resolved=complete(s);unchanged(resolved,()=>decideApplicationV1(resolved,{receipt:p,decision:'approve',reason:'Old receipt'}),'STALE_BINDING');
  const rejected=apply(s,'reject');unchanged(rejected,()=>decideApplicationV1(rejected,{receipt:p,decision:'approve',reason:'Old receipt'}),'STALE_BINDING');
  const applied=apply(s),undone=value(undoRuleV1(applied,{binding:applied.binding,eventId:applied.intelligence!.events.at(-1)!.eventId,reason:'Undo'}));unchanged(undone,()=>decideApplicationV1(undone,{receipt:p,decision:'approve',reason:'Old receipt'}),'STALE_BINDING');
  unchanged(start(N+'\nSKU:new,z,I-z'),()=>decideApplicationV1(start(N+'\nSKU:new,z,I-z'),{receipt:p,decision:'approve',reason:'Other generation'}),'STALE_BINDING');
 });
 it('forbids identity/key/wrong column, altered teaching, runtime predicate and rejected rule activation',()=>{
  const s=start();for(const column of ['id','identity','missing']){const t=value(teachRuleV1(column,examples));unchanged(s,()=>decideRuleV1(s,{binding:s.binding,teaching:t,candidateId:t.alternatives[0].candidateId,predicate:{kind:'startsWith',value:'SKU:'},decision:'approve',reason:'Forbidden'}),'RULE_INVALID')}
  const rejected=rule(s,teach(),'reject');expect(rejected.intelligence!.rules).toHaveLength(0);expect(rejected.intelligence!.events[0].kind).toBe('reject_rule');expect(importHistory(value(exportHistory(rejected))).ok).toBe(true);
  const t=teach();(t.examples[0] as {output:string}).output='forged';unchanged(s,()=>decideRuleV1(s,{binding:s.binding,teaching:t,candidateId:t.alternatives[0].candidateId,predicate:{kind:'startsWith',value:'SKU:'},decision:'approve',reason:'test'}),'RULE_INVALID');
  for(const predicate of [{kind:'startsWith',value:''},{kind:'regex',value:'.*'},{kind:'exactValues',values:[1]}])unchanged(s,()=>decideRuleV1(s,{binding:s.binding,teaching:teach(),candidateId:teach().alternatives[0].candidateId,predicate:predicate as never,decision:'approve',reason:'test'}),'RULE_INVALID');
 });
 it('rejects history/overlay/receipt/teaching tampering and wrong expected binding',()=>{
  const done=complete(apply(rule())),out=value(exportReviewed(done,done.binding));
  const edits=[(h:any)=>{h.intelligence.rules[0].spec.predicate.value=''},(h:any)=>{h.intelligence.events[0].teaching.examples[0].output='forged'},(h:any)=>{h.intelligence.events[1].cells[0].after='forged'},(h:any)=>{h.intelligence.events[1].cells[1].decision='ELIGIBLE'},(h:any)=>{h.intelligence.events[0].revision=7},(h:any)=>{h.outputSha256='x'},(h:any)=>{h.intelligence.events[0].spec.predicate.value='plain'},(h:any)=>{h.intelligence.events.reverse()}];
  for(const edit of edits){const h=JSON.parse(out.historyJson);edit(h);expect(importHistory(JSON.stringify(h)).ok).toBe(false)}
  const bad=structuredClone(done);(bad.intelligence!.rules[0].spec.predicate as {value:string}).value='plain';unchanged(bad,()=>previewRuleV1(bad,ref(bad)));unchanged(bad,()=>exportReviewed(bad,bad.binding));
  expect(importHistory(out.historyJson,{...done.binding,expectedRevision:99})).toMatchObject({error:{code:'STALE_BINDING'}});
 });
 it('holds new identities, retains formula gates, does not chain, and exposes storage failure',()=>{
  const s=rule(start(N+'\nSKU:new,z,I-z')),p=value(previewRuleV1(s,ref(s)));expect(p.cells.at(-1)).toMatchObject({key:'z',decision:'HOLD'});
  const applied=apply(s);expect(value(previewRuleV1(applied,ref(applied))).changedCells).toHaveLength(0);
  const risky=complete(apply(rule(start(N.replace('plain,o',' =1+1,o')))));expect(exportReviewed(risky,risky.binding)).toMatchObject({error:{code:'FORMULA_HOLD'}});
  expect(saveSession(applied,{getItem:()=>null,setItem:()=>{},removeItem:()=>{}})).toMatchObject({error:{code:'PERSISTENCE'}});
 });
 it('supports explicit exact-value permission, versioned revision and exact references',()=>{
  let s=rule();const t=teach(),old=ref(s);s=value(decideRuleV1(s,{binding:s.binding,teaching:t,candidateId:t.alternatives.find(a=>a.operation.kind==='removePrefix')!.candidateId,predicate:{kind:'exactValues',values:['SKU:tea']},decision:'approve',reason:'Narrow scope',revise:old}));expect(ref(s).version).toBe(2);expect(previewRuleV1(s,old)).toMatchObject({error:{code:'RULE_REF'}});expect(value(previewRuleV1(s,ref(s))).changedCells.map(c=>c.key)).toEqual(['a']);expect(importHistory(value(exportHistory(s))).ok).toBe(true);
 });
});

describe('additional boundaries and mixed event replay',()=>{
 it('rejects contradictory/oversize/noninformative examples and retains nonidentity many-to-one transforms',()=>{
  for(const ex of [[],[{input:'x',output:'x'}],[{input:'x',output:'a'},{input:'x',output:'b'}],[{input:'x'.repeat(257),output:'a'}]])expect(teachRuleV1('label',ex).ok).toBe(false);
  expect(value(teachRuleV1('label',[{input:'a',output:'A'},{input:'A',output:'A'}])).alternatives.some(a=>a.operation.kind==='upper')).toBe(true);
 });
 it('holds empty identity evidence without mutating existing snapshots',()=>{
  const o=snap('O',O.replace('b,I-b','b,')),c=snap('C',O.replace('b,I-b','b,').replace('c,I-c,SKU:old','c,I-c,old')),n=snap('N',N.replace('cup,b,I-b','cup,b,'));const s=rule(value(reconcile(o,c,n,start().policy)));expect(value(previewRuleV1(s,ref(s))).cells[0]).toMatchObject({decision:'HOLD'});
 });
 it('reconstructs rejected teaching after an approval without inventing a revision',()=>{
  const s=rule(rule(),teach(),'reject');expect(importHistory(value(exportHistory(s))).ok).toBe(true);expect(s.intelligence!.rules.filter(r=>r.active)).toHaveLength(1);
 });
 it('undo of original approval invalidates dependent versions and applications',()=>{
  let s=rule();const approval=s.intelligence!.events[0].eventId,t=teach();s=value(decideRuleV1(s,{binding:s.binding,teaching:t,candidateId:t.alternatives.find(a=>a.operation.kind==='removePrefix')!.candidateId,predicate:{kind:'startsWith',value:'SKU:'},decision:'approve',reason:'Reconfirm version',revise:ref(s)}));s=apply(s);s=value(undoRuleV1(s,{binding:s.binding,eventId:approval,reason:'Withdraw original intent'}));expect(s.intelligence!.events.at(-1)!.invalidates).toHaveLength(2);expect(value(preview(s)).changedCells).toHaveLength(0);expect(importHistory(value(exportHistory(s))).ok).toBe(true);
 });
 it('original continuity undo invalidates active rule overlays in mixed history',()=>{
  let s=start();const o=s.snapshots.O,c=s.snapshots.C,n=snap('N',N.replace('new,c,I-c','new,c,REUSED'));s=value(reconcile(o,c,n,s.policy));s=value(resolve(s,{binding:s.binding,assessmentId:s.assessments[0].id,action:'confirm_continuity',reason:'Human confirms fictional c'}));const continuity=s.events[0].eventId;s=apply(rule(s));expect(value(preview(s)).changedCells).toHaveLength(3);s=value(undo(s,{binding:s.binding,eventId:continuity}));expect(value(preview(s)).changedCells).toHaveLength(0);expect(s.assessments[0].state).toBe('identity_hold');expect(importHistory(value(exportHistory(s))).ok).toBe(true);
 });
 it('zero eligible changes require an explicit decision and create a recoverable zero-change event',()=>{
  const s=rule(start(N.replaceAll('SKU:SKU:tea','plain').replaceAll('SKU:cup','plain').replaceAll('SKU:tea','plain'))),p=value(previewRuleV1(s,ref(s)));expect(p.changedCells).toHaveLength(0);const done=apply(s);expect(done.intelligence!.events.at(-1)!.cells!.filter(c=>c.decision==='ELIGIBLE')).toHaveLength(0);expect(importHistory(value(exportHistory(done))).ok).toBe(true);
 });
});
