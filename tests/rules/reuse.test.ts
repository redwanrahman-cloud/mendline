import {describe,it,expect} from 'vitest';
import {parseCsv,reconcile,teachRuleV1,decideRuleV1,extractRuleProposalV1,decideReusedRuleV1,previewRuleV1,decideApplicationV1,exportHistory,exportReviewed,importHistory,preview,resolve,undo,saveSession,loadSession} from '../../src/engine';
import type {Result,Role,ReviewState} from '../../src/engine';
const v=<T>(r:Result<T>):T=>{if(!r.ok)throw Error(JSON.stringify(r.error));return r.value};
const O='id,identity,label\na,A,SKU:tea\nb,B,SKU:cup\nc,C,SKU:old\nu,U,SKU:unsafe';
const C=O.replace('c,C,SKU:old','c,C,old');
const parse=(r:Role,s:string)=>v(parseCsv(r,new TextEncoder().encode(s)));
const start=(n:string)=>v(reconcile(parse('O',O),parse('C',C),parse('N',n),{keyColumn:'id',identityColumns:['identity'],assumptionConfirmed:true,assumptionReason:'Synthetic stable identities'}));
const ref=(s:ReviewState)=>s.intelligence!.rules.find(r=>r.active)!.ref;
function source(){let s=start(O);const t=v(teachRuleV1('label',[{input:'SKU:tea',output:'tea'},{input:'SKU:SKU:tea',output:'SKU:tea'}]));s=v(decideRuleV1(s,{binding:s.binding,teaching:t,candidateId:t.alternatives.find(a=>a.operation.kind==='removePrefix')!.candidateId,predicate:{kind:'startsWith',value:'SKU:'},decision:'approve',reason:'Source human intent'}));s=v(decideApplicationV1(s,{receipt:v(previewRuleV1(s,ref(s))).receipt,decision:'approve',reason:'Source application'}));return s;}
const N='label,identity,id\nSKU:novel,B,b\nSKU:unsafe,REUSED,u\nSKU:new,C,c\nSKU:tea,A,a';
const target=()=>start(N);
describe('F1 retained inactive intent across actual distinct exports',()=>{
 it('uses no target teaching, retains exact provenance, requires new permission, previews safe unseen values, exports/replays/recovers/undo',()=>{
  const old=source(),history=v(exportHistory(old)),proposal=v(extractRuleProposalV1(history,ref(old))),fresh=target(),before=JSON.stringify(fresh);
  expect(old.binding.generationHash).not.toBe(fresh.binding.generationHash);expect(proposal.status).toBe('INACTIVE');expect(proposal.sourceRule.teaching).toEqual(old.intelligence!.rules[0].teaching);expect(proposal.sourceRule.approval.reason).toBe('Source human intent');
  expect(v(preview(fresh)).changedCells).toHaveLength(0);expect(previewRuleV1(fresh,ref(old)).ok).toBe(false);
  const stale=v(previewRuleV1(old,ref(old))).receipt;
  expect(decideApplicationV1(fresh,{receipt:stale,decision:'approve',reason:'Old receipt'})).toMatchObject({error:{code:'STALE_BINDING'}});
  expect(decideReusedRuleV1(fresh,{binding:fresh.binding,proposal,decision:'approve',reason:''}).ok).toBe(false);expect(JSON.stringify(fresh)).toBe(before);
  let s=v(decideReusedRuleV1(fresh,{binding:fresh.binding,proposal,decision:'approve',reason:'Fresh human scope approval on later export'}));
  expect(v(preview(s)).changedCells).toHaveLength(0);expect(s.intelligence!.events[0].provenance).toEqual(proposal);expect(s.intelligence!.rules[0].provenance).toEqual(proposal);expect(s.intelligence!.rules[0].approval.reason).toBe('Fresh human scope approval on later export');
  const p=v(previewRuleV1(s,ref(s)));expect(p.cells.map(c=>[c.key,c.decision])).toEqual([['b','ELIGIBLE'],['u','HOLD'],['c','HOLD'],['a','ELIGIBLE']]);expect(p.changedCells[0]).toMatchObject({before:'SKU:novel',after:'novel'});
  expect(decideApplicationV1(s,{receipt:stale,decision:'approve',reason:'Old receipt after reuse'})).toMatchObject({error:{code:'STALE_BINDING'}});
  s=v(decideApplicationV1(s,{receipt:p.receipt,decision:'approve',reason:'New preview and exclusions reviewed'}));expect(exportReviewed(s,s.binding)).toMatchObject({error:{code:'UNRESOLVED'}});
  s=v(resolve(s,{binding:s.binding,assessmentId:s.assessments[0].id,action:'keep_latest',reason:'Retain changed source'}));const out=v(exportReviewed(s,s.binding));
  expect(v(parseCsv('N',out.csvUtf8)).rows).toEqual([['novel','B','b'],['SKU:unsafe','REUSED','u'],['SKU:new','C','c'],['tea','A','a']]);
  const recovered=v(importHistory(out.historyJson));expect(v(exportReviewed(recovered,recovered.binding)).csvUtf8).toEqual(out.csvUtf8);expect(recovered.intelligence).toEqual(s.intelligence);
  let stored:string|null=null;const storage={getItem:()=>stored,setItem:(_k:string,x:string)=>{stored=x},removeItem:()=>{stored=null}};v(saveSession(s,storage));expect(v(loadSession(storage))!.intelligence).toEqual(s.intelligence);
  const applied=s.intelligence!.events.find(e=>e.kind==='apply_rule')!;const undone=v(undo(s,{binding:s.binding,eventId:applied.eventId}));expect(v(preview(undone)).rows).toEqual(fresh.snapshots.N.rows);expect(importHistory(v(exportHistory(undone))).ok).toBe(true);expect(exportReviewed(undone,undone.binding).ok).toBe(true);
 });
 it('rejects forged source/provenance, stale binding, unsafe target columns and source undo; rejection never activates',()=>{
  const old=source(),proposal=v(extractRuleProposalV1(v(exportHistory(old)),ref(old))),s=target();
  for(const edit of [(p:any)=>{p.status='ACTIVE'},(p:any)=>{p.sourceBinding.generationHash='forged'},(p:any)=>{p.sourceRule.approval.reason='forged'},(p:any)=>{p.sourceRule.spec.column='id'},(p:any)=>{p.sourceHistoryHash='forged'},(p:any)=>{p.sourceRule.teaching.examples[0].output='forged'}]){const p=structuredClone(proposal);edit(p);expect(decideReusedRuleV1(s,{binding:s.binding,proposal:p,decision:'approve',reason:'Fresh'}).ok).toBe(false)}
  expect(decideReusedRuleV1(s,{binding:old.binding,proposal,decision:'approve',reason:'Fresh'})).toMatchObject({error:{code:'STALE_BINDING'}});
  const unsafe=v(reconcile(s.snapshots.O,s.snapshots.O,s.snapshots.N,{...s.policy,identityColumns:['identity','label']}));expect(decideReusedRuleV1(unsafe,{binding:unsafe.binding,proposal,decision:'approve',reason:'Fresh'})).toMatchObject({error:{code:'RULE_INVALID'}});
  const missing=v(reconcile(parse('O',O.replace('id,identity,label','id,identity,other')),parse('C',C.replace('id,identity,label','id,identity,other')),parse('N',N.replace('label,identity,id','other,identity,id')),s.policy));expect(decideReusedRuleV1(missing,{binding:missing.binding,proposal,decision:'approve',reason:'Fresh'}).ok).toBe(false);
  const rejected=v(decideReusedRuleV1(s,{binding:s.binding,proposal,decision:'reject',reason:'Decline source intent'}));expect(rejected.intelligence!.rules).toHaveLength(0);expect(importHistory(v(exportHistory(rejected))).ok).toBe(true);
  const approved=v(decideReusedRuleV1(s,{binding:s.binding,proposal,decision:'approve',reason:'Fresh'}));const h=JSON.parse(v(exportHistory(approved)));h.intelligence.events[0].provenance.sourceRule.approval.reason='forged';expect(importHistory(JSON.stringify(h)).ok).toBe(false);
  const withdrawn=v(undo(old,{binding:old.binding,eventId:old.intelligence!.events[0].eventId}));expect(extractRuleProposalV1(v(exportHistory(withdrawn)),ref(old)).ok).toBe(false);
 });
 it('keeps formula gate and target approval undo, supports another later proposal extraction',()=>{
  const old=source(),proposal=v(extractRuleProposalV1(v(exportHistory(old)),ref(old)));let s=target();s=v(decideReusedRuleV1(s,{binding:s.binding,proposal,decision:'approve',reason:'Fresh'}));expect(extractRuleProposalV1(v(exportHistory(s)),ref(s)).ok).toBe(true);
  const undone=v(undo(s,{binding:s.binding,eventId:s.intelligence!.events[0].eventId}));expect(undone.intelligence!.rules[0].active).toBe(false);expect(importHistory(v(exportHistory(undone))).ok).toBe(true);
  let risky=start(N.replace('SKU:novel','SKU:=1+1'));risky=v(decideReusedRuleV1(risky,{binding:risky.binding,proposal,decision:'approve',reason:'Fresh'}));risky=v(decideApplicationV1(risky,{receipt:v(previewRuleV1(risky,ref(risky))).receipt,decision:'approve',reason:'Preview'}));risky=v(resolve(risky,{binding:risky.binding,assessmentId:risky.assessments[0].id,action:'keep_latest',reason:'Source'}));expect(exportReviewed(risky,risky.binding)).toMatchObject({error:{code:'FORMULA_HOLD'}});
 });
});

