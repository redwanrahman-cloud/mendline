import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import RuleIntentPanel,{RuleCells} from '../../src/ui/RuleIntentPanel';
import {api,unwrap,snapshotInputs,type Review} from '../../src/ui/adapter';
import {intentExample,teach,decideTeaching,inspectRule,decideApplication,compensateRule,persistDecision,sameReviewBinding} from '../../src/ui/ruleIntent';

const policy={keyColumn:'id',identityColumns:['identity'],assumptionConfirmed:true,assumptionReason:'Fictional stable identity confirmed for this review'};
function desk(){return unwrap(api.reconcile(unwrap(api.parseCsv('O',new TextEncoder().encode(intentExample.O))),unwrap(api.parseCsv('C',new TextEncoder().encode(intentExample.C))),unwrap(api.parseCsv('N',new TextEncoder().encode(intentExample.N))),policy));}
const examples=[{input:'SKU:tea',output:'tea'},{input:'SKU:SKU:tea',output:'SKU:tea'}];
function approve(state=desk(),scope:'startsWith'|'exactValues'='startsWith'){
  const teaching=teach('label',examples);const candidate=teaching.alternatives.find(a=>a.operation.kind==='removePrefix')!;
  return decideTeaching(state,state.binding,teaching,candidate.candidateId,scope==='startsWith'?{kind:scope,value:'SKU:'}:{kind:scope,values:examples.map(e=>e.input)},'approve','Explicit prefix rule and unseen-value permission');
}
const ref=(s:Review)=>s.intelligence!.rules.find(r=>r.active)!.ref;
const bytes=(s:Review)=>Array.from(unwrap(api.exportReviewed(s,s.binding)).csvUtf8);
const render=(review:Review)=>renderToStaticMarkup(<RuleIntentPanel review={review} commit={()=>{throw new Error('Render must not decide');}} fail={()=>{}} dirty={()=>{}}/>);

describe('rule UI orchestration against real finite-rule API (no mocks)',()=>{
  it('retains competing alternatives and distinguishing inputs, never selects or approves on render',()=>{
    const state=desk();const first=teach('label',[examples[0]]);
    expect(first.alternatives.some(a=>a.operation.kind==='removePrefix')).toBe(true);
    expect(first.alternatives.some(a=>a.operation.kind==='literalReplace'&&a.operation.from==='SKU:')).toBe(true);
    expect(first.distinguishing.some(d=>d.input==='SKU:SKU:tea')).toBe(true);
    const second=teach('label',examples);
    expect(second.alternatives.length).toBeGreaterThan(1);
    expect(second.distinguishing.some(d=>d.input==='SKU:cup')).toBe(true);
    const html=render(state);expect(html).toContain('Find alternatives');expect(html).toContain('No rule is selected or applied automatically');
    expect(html).not.toContain('<option>id</option>');expect(html).not.toContain('<option>identity</option>');
    expect(state.intelligence).toBeUndefined();expect(state.binding.expectedRevision).toBe(0);
  });
  it('rejects teaching without applying; exact scope excludes novel values; explicit broad scope includes them',()=>{
    const base=desk(),t=teach('label',examples),candidate=t.alternatives[0];
    const rejected=decideTeaching(base,base.binding,t,candidate.candidateId,{kind:'exactValues',values:examples.map(e=>e.input)},'reject','Intent not established');
    expect(rejected.intelligence!.events.at(-1)?.kind).toBe('reject_rule');expect(rejected.intelligence!.rules).toHaveLength(0);
    const exact=approve(base,'exactValues');expect(inspectRule(exact,ref(exact)).cells.find(c=>c.key==='b')?.decision).toBe('OUT_OF_SCOPE');
    const broad=approve(base);const p=inspectRule(broad,ref(broad));
    expect(p.changedCells.map(c=>c.key)).toEqual(['b','d','a']);
    expect(p.cells.find(c=>c.key==='b')).toMatchObject({before:'SKU:cup',after:'cup',decision:'ELIGIBLE'});
    expect(p.cells.filter(c=>c.decision==='HOLD').map(c=>c.key)).toEqual(['u','c']);
    const html=renderToStaticMarkup(<RuleCells cells={p.cells}/>);expect(html).toContain('Identity continuity unknown');expect(html).toContain('Existing correction owns cell');expect(html).toContain('OUT_OF_SCOPE');
    expect(render(broad)).toContain('Preview rule v1 on Latest');
  });
  it('records rejection, requires fresh receipts, skips exceptions, keeps conflict blocked, resolves separately and undoes',()=>{
    let state=approve();const original=JSON.stringify(state.snapshots);const p=inspectRule(state,ref(state));
    state=decideApplication(state,p,'reject','Check exceptions first');
    expect(state.intelligence!.events.at(-1)?.kind).toBe('reject_application');
    expect(unwrap(api.preview(state)).changedCells).toHaveLength(0);
    expect(sameReviewBinding(p.receipt.binding,state.binding)).toBe(false);
    expect(()=>decideApplication(state,p,'approve','Stale must fail')).toThrow(/STALE_BINDING|RECEIPT_MISMATCH/);
    const fresh=inspectRule(state,ref(state));state=decideApplication(state,fresh,'approve','Only eligible cells; u and c excluded');
    const application=state.intelligence!.events.at(-1)!;
    expect(application.cells?.filter(c=>c.decision==='HOLD')).toHaveLength(2);
    expect(api.exportReviewed(state,state.binding)).toMatchObject({ok:false,error:{code:'UNRESOLVED'}});
    state=unwrap(api.resolve(state,{binding:state.binding,assessmentId:state.assessments.find(a=>a.key==='c')!.id,action:'keep_latest',reason:'Source change retained'}));
    const output=unwrap(api.exportReviewed(state,state.binding));
    expect(unwrap(api.parseCsv('N',output.csvUtf8)).rows.map(r=>r[0])).toEqual(['cup','SKU:unsafe','plain','SKU:new','SKU:tea','tea']);
    expect(JSON.stringify(state.snapshots)).toBe(original);
    const html=render(state);expect(html).toContain('Only eligible cells; u and c excluded');expect(html).toContain('Undo rule event');expect(html).toContain('Teaching evidence and competing alternatives');
    state=compensateRule(state,application.eventId,'Restore raw Latest labels');
    expect(unwrap(api.preview(state)).rows.map(r=>r[0])).toEqual(['SKU:cup','SKU:unsafe','plain','SKU:new','SKU:SKU:tea','SKU:tea']);
    expect(state.assessments.find(a=>a.key==='c')?.resolved).toBe(true);
    expect(()=>decideApplication(state,fresh,'approve','No auto replay')).toThrow();
  });
  it('stales on legacy decisions, rule undo and changed generation, without modifying rejected state',()=>{
    let state=approve();const p=inspectRule(state,ref(state));
    state=unwrap(api.resolve(state,{binding:state.binding,assessmentId:state.assessments[0].id,action:'keep_latest',reason:'Keep source'}));
    const before=JSON.stringify(state);expect(()=>decideApplication(state,p,'approve','Old receipt')).toThrow();expect(JSON.stringify(state)).toBe(before);
    const current=inspectRule(state,ref(state));state=compensateRule(state,state.intelligence!.events[0].eventId,'Withdraw broad scope');
    expect(()=>decideApplication(state,current,'approve','Undone rule')).toThrow();
    const old=desk().binding;expect(sameReviewBinding(old,{...old,inputHashes:{...old.inputHashes,N:'different'}})).toBe(false);
    expect(sameReviewBinding(old,{...old,policyHash:'different'})).toBe(false);
    expect(sameReviewBinding(old,{...old,generationHash:'different'})).toBe(false);
  });
  it('round-trips real history/session including undo; failed storage keeps recoverable decision evidence',()=>{
    let state=approve();state=decideApplication(state,inspectRule(state,ref(state)),'approve','Explicit test application');
    state=unwrap(api.resolve(state,{binding:state.binding,assessmentId:state.assessments[0].id,action:'keep_latest',reason:'Source change retained'}));
    const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
    expect(persistDecision(state,storage).ok).toBe(true);const restored=unwrap(api.loadSession(storage))!;expect(bytes(restored)).toEqual(bytes(state));
    expect(bytes(unwrap(api.importHistory(api.exportHistory(state))))).toEqual(bytes(state));
    expect(snapshotInputs(restored)).toEqual(intentExample);
    const failed={...storage,setItem:()=>{throw new Error('Quota exceeded');}};
    const before=JSON.stringify(state);expect(persistDecision(state,failed)).toMatchObject({ok:false,error:{code:'PERSISTENCE'}});expect(JSON.stringify(state)).toBe(before);
    expect(persistDecision(state,{...storage,getItem:()=>null})).toMatchObject({ok:false,error:{code:'PERSISTENCE'}});
    expect(api.exportHistory(state)).toContain('Explicit test application');
    state=compensateRule(state,state.intelligence!.events.find(e=>e.kind==='apply_rule')!.eventId,'Undo after recovery');
    expect(persistDecision(state,storage).ok).toBe(true);expect(bytes(unwrap(api.loadSession(storage))!)).toEqual(bytes(state));
  });
  it('shows errors for contradictory examples, unsafe columns, blank reasons and altered receipts',()=>{
    expect(()=>teach('label',[examples[0],{input:'SKU:tea',output:'other'}])).toThrow('RULE_INVALID');
    const s=desk(),t=teach('id',examples);expect(()=>decideTeaching(s,s.binding,t,t.alternatives[0].candidateId,{kind:'startsWith',value:'SKU:'},'approve','No key edits')).toThrow('RULE_INVALID');
    const state=approve(),p=inspectRule(state,ref(state));expect(()=>decideApplication(state,p,'approve','')).toThrow();
    expect(()=>decideApplication(state,{...p,receipt:{...p.receipt,previewHash:'altered'}},'approve','Reject tamper')).toThrow('RECEIPT_MISMATCH');
    expect(state.binding.expectedRevision).toBe(1);
  });
});
