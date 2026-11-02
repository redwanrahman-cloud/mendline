import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {api,unwrap,type Review} from '../../src/ui/adapter';
import {intentExample,teach,decideTeaching,inspectRule,decideApplication,compensateRule} from '../../src/ui/ruleIntent';
import {retainedRules,decideReuse,laterIntentExport} from '../../src/ui/ruleReuse';
import RuleReusePanel from '../../src/ui/RuleReusePanel';
import {restoreGeneration} from '../../src/ui/preservation';
import {DraftBoundary} from '../../src/ui/draftBoundary';

const policy={keyColumn:'id',identityColumns:['identity'],assumptionConfirmed:true,assumptionReason:'Fresh fictional identity confirmation'};
function desk(N=intentExample.N){return unwrap(api.reconcile(...(['O','C','N'] as const).map(role=>unwrap(api.parseCsv(role,new TextEncoder().encode(role==='N'?N:intentExample[role])))) as [Review['snapshots']['O'],Review['snapshots']['C'],Review['snapshots']['N']],policy));}
function source(){const s=desk(),t=teach('label',[{input:'SKU:tea',output:'tea'},{input:'SKU:SKU:tea',output:'SKU:tea'}]);return decideTeaching(s,s.binding,t,t.alternatives.find(a=>a.operation.kind==='removePrefix')!.candidateId,{kind:'startsWith',value:'SKU:'},'approve','Source intent only');}
const active=(s:Review)=>s.intelligence!.rules.find(r=>r.active)!.ref;

describe('retained teaching UI with real additive API',()=>{
  it('archives source teaching without authority; freshly approves changed N, previews, applies, holds, recovers and undoes',()=>{
    let original=source();const stale=inspectRule(original,active(original));original=decideApplication(original,stale,'approve','Source application');
    const history=api.exportHistory(original),proposal=retainedRules([history])[0];
    let target=desk(laterIntentExport);
    expect(proposal.status).toBe('INACTIVE');expect(proposal.sourceRule.teaching.examples).toHaveLength(2);
    expect(unwrap(api.preview(target)).changedCells).toHaveLength(0);
    expect(()=>decideApplication(target,stale,'approve','Old receipt')).toThrow();
    target=decideReuse(target,proposal,'approve','Fresh target approval without retyping');
    expect(unwrap(api.preview(target)).changedCells).toHaveLength(0);
    expect(target.intelligence!.rules[0].teaching).toEqual(proposal.sourceRule.teaching);
    const fresh=inspectRule(target,active(target));
    expect(fresh.cells.find(c=>c.key==='b')).toMatchObject({before:'SKU:novel',after:'novel',decision:'ELIGIBLE'});
    expect(fresh.cells.filter(c=>c.decision==='HOLD').map(c=>c.key)).toEqual(['u','c']);
    target=decideApplication(target,fresh,'approve','Only safe eligible cells');
    const application=target.intelligence!.events.at(-1)!;
    expect(api.exportReviewed(target,target.binding)).toMatchObject({ok:false,error:{code:'UNRESOLVED'}});
    target=unwrap(api.resolve(target,{binding:target.binding,assessmentId:target.assessments.find(a=>a.key==='c')!.id,action:'keep_latest',reason:'Retain changed source'}));
    const exported=unwrap(api.exportReviewed(target,target.binding));
    expect(new TextDecoder().decode(exported.csvUtf8)).toContain('I-b,novel,b');
    target=unwrap(api.importHistory(api.exportHistory(target)));
    target=compensateRule(target,application.eventId,'Undo target only');
    expect(unwrap(api.preview(target)).changedCells).toHaveLength(0);
    expect(api.exportHistory(original)).toBe(history);
    expect(()=>decideApplication(target,fresh,'approve','Stale after undo')).toThrow();
  });
  it('shows inactive source provenance with no target and never decides on render; validates recovered archives',()=>{
    const history=api.exportHistory(source()),archives=[history];
    const html=renderToStaticMarkup(<RuleReusePanel histories={archives} review={null} commit={()=>{throw new Error('No implicit decisions');}} fail={()=>{}} dirty={()=>{}}/>);
    expect(html).toContain('INACTIVE proposal');expect(html).toContain('Source intent only');expect(html).toContain('Original teaching, examples and alternatives');expect(html).toContain('disabled');
    const data=JSON.parse(JSON.stringify({version:1,inputs:{...intentExample,N:laterIntentExport},policy,history:null,archives}));
    expect(restoreGeneration(data,false)).toBeNull();expect(retainedRules(data.archives)[0].sourceRule.teaching).toEqual(source().intelligence!.rules[0].teaching);
    expect(()=>retainedRules(['{}'])).toThrow();
    expect(retainedRules([history,history])).toHaveLength(1);
  });
  it('requires fresh target identity and reason; rejection has provenance but no active rule or overlay',()=>{
    const proposal=retainedRules([api.exportHistory(source())])[0];const target=desk(laterIntentExport);
    expect(()=>decideReuse({...target,policy:{...target.policy,assumptionConfirmed:false}},proposal,'approve','Reason')).toThrow('Confirm identity');
    expect(()=>decideReuse(target,proposal,'approve','')).toThrow();
    const rejected=decideReuse(target,proposal,'reject','Not appropriate for later export');
    expect(rejected.intelligence!.rules).toHaveLength(0);expect(rejected.intelligence!.events.at(-1)?.reason).toBe('Not appropriate for later export');
    expect(unwrap(api.preview(rejected)).changedCells).toHaveLength(0);
  });
  it('canceled replacement retains source review, archive list and reuse draft atomically',()=>{
    const sourceReview=source(),history=api.exportHistory(sourceReview),drafts=new DraftBoundary();drafts.mark('reuse-proposal',true);
    const state={review:sourceReview,archives:[history],input:intentExample.N};const before=JSON.stringify(state);
    if(drafts.allow(()=>false)){state.archives.push(api.exportHistory(state.review));state.input=laterIntentExport;drafts.clear();}
    expect(JSON.stringify(state)).toBe(before);expect(drafts.has('reuse-proposal')).toBe(true);
  });
});
