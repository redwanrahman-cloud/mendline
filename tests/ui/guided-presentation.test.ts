import {describe,it,expect} from 'vitest';
import {teach} from '../../src/ui/ruleIntent';
import {teachingStage,correctionSummary} from '../../src/ui/guided/presentation';
describe('progressive guided decisions',()=>{
 it('never skips clarification or chooses the sole remaining candidate for the user',()=>{
  const one=teach('label',[{input:'SKU:tea',output:'tea'}]);
  expect(teachingStage(null,'tea','','')).toBe('correction');
  expect(teachingStage(one,'tea','','')).toBe('question');
  expect(teachingStage(one,'tea','SKU:tea','')).toBe('question');
  const clarified=teach('label',[{input:'SKU:tea',output:'tea'},{input:'SKU:SKU:tea',output:'SKU:tea'}]);
  const id=clarified.alternatives.find(a=>a.operation.kind==='removePrefix')!.candidateId;
  expect(teachingStage(clarified,'tea','SKU:tea','')).toBe('choice');
  expect(teachingStage(clarified,'tea','SKU:tea',id)).toBe('scope');
  expect(teachingStage(clarified,'tea','tea',id)).toBe('question');
  expect(teachingStage(clarified,'coffee','SKU:tea',id)).toBe('question');
  expect(teachingStage(clarified,'tea','SKU:tea','stale')).toBe('choice');
 });
 it('displays the actual retained scope, including exact-only and unseen-value distinctions',()=>{
  const base={schema:'mendline-rule/v1' as const,column:'label',operation:{kind:'removePrefix' as const,prefix:'SKU:'}};
  expect(correctionSummary({...base,predicate:{kind:'startsWith',value:'SKU:'}})).toBe('Remove one leading "SKU:" in label; apply to all labels starting with "SKU:", including new values.');
  const exact=correctionSummary({...base,predicate:{kind:'exactValues',values:['SKU:tea','SKU:SKU:tea']}});
  expect(exact).toContain('only these exact labels');expect(exact).not.toContain('including new values');
  expect(correctionSummary({...base,operation:{kind:'literalReplace',from:'SKU:',to:''},predicate:{kind:'exactValues',values:['SKU:tea']}})).toContain('Replace every');
 });
});
