import {describe,it,expect} from 'vitest';
import {teach,type Teaching} from '../../src/ui/ruleIntent';
import {hasCurrentGuidedEvidence,canApproveGuidedTeaching} from '../../src/ui/guided/teachingApproval';

describe('guided approval uses exact current semantic evidence',()=>{
 const clarified=()=>teach('label',[{input:'SKU:tea',output:'tea'},{input:'SKU:SKU:tea',output:'SKU:tea'}]);
 const allowed=(t:Teaching,output='tea',clarification='SKU:tea',candidate=t.alternatives.find(a=>a.operation.kind==='removePrefix')!.candidateId,scope='startsWith',confirmed=true,reason='Remove one prefix')=>canApproveGuidedTeaching(t,output,clarification,candidate,scope,confirmed,reason);
 it('approves the actual canonical reversed-order clarification with explicit choices',()=>{
  const t=clarified();expect(t.examples.map(e=>e.input)).toEqual(['SKU:SKU:tea','SKU:tea']);
  expect(allowed(t)).toBe(true);
  expect(allowed({...t,examples:[...t.examples].reverse()})).toBe(true);
 });
 it('accepts one current example without clarification, including exact empty output',()=>{
  const t=teach('label',[{input:'SKU:tea',output:'tea'}]);expect(allowed(t,'tea','')).toBe(true);
  const empty=teach('label',[{input:'SKU:tea',output:''}]);expect(hasCurrentGuidedEvidence(empty,'','')).toBe(true);
  expect(hasCurrentGuidedEvidence(t,'','')).toBe(false);
 });
 it('blocks changed, cleared, newly added and not-yet-compared clarification evidence',()=>{
  const t=clarified();expect(allowed(t,'coffee')).toBe(false);
  expect(allowed(t,'tea','tea')).toBe(false);expect(allowed(t,'tea','')).toBe(false);
  const one=teach('label',[{input:'SKU:tea',output:'tea'}]);expect(hasCurrentGuidedEvidence(one,'tea','SKU:tea')).toBe(false);
  expect(hasCurrentGuidedEvidence(null,'tea','')).toBe(false);
 });
 it('rejects duplicate inputs, contradictions, swapped outputs and unexpected inputs or column',()=>{
  const t=clarified();const base={input:'SKU:tea',output:'tea'};
  for(const examples of [[base,base],[base,{...base,output:'SKU:tea'}],t.examples.map(e=>({...e,output:e.input==='SKU:tea'?'SKU:tea':'tea'})),[base,{input:'other',output:'SKU:tea'}],[...t.examples,base]]){
   expect(allowed({...t,examples})).toBe(false);
  }
  expect(allowed({...t,column:'identity'})).toBe(false);
 });
 it('still requires a current candidate, valid scope, reason and explicit checkbox',()=>{
  const t=clarified(),id=t.alternatives.find(a=>a.operation.kind==='removePrefix')!.candidateId;
  expect(allowed(t,'tea','SKU:tea','')).toBe(false);expect(allowed(t,'tea','SKU:tea','stale-candidate')).toBe(false);
  expect(allowed(t,'tea','SKU:tea',id,'other')).toBe(false);
  expect(allowed(t,'tea','SKU:tea',id,'startsWith',false)).toBe(false);
  expect(allowed(t,'tea','SKU:tea',id,'startsWith',true,'  ')).toBe(false);
 });
});
