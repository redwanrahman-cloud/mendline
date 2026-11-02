import type {RuleSpecV1} from '../../rules/intelligence';
import type {Teaching} from '../ruleIntent';
import {hasCurrentGuidedEvidence} from './teachingApproval';

// Presentation only: never infer approval from a stage or a single remaining candidate.
export function teachingStage(teaching:Teaching|null,output:string,clarification:string,candidate:string){
 if(!teaching)return 'correction';
 if(!clarification||!hasCurrentGuidedEvidence(teaching,output,clarification))return 'question';
 return teaching.alternatives.some(a=>a.candidateId===candidate)?'scope':'choice';
}
export function correctionSummary(spec:RuleSpecV1){
 const op=spec.operation;
 const operation=op.kind==='removePrefix'?'Remove one leading '+JSON.stringify(op.prefix):op.kind==='addPrefix'?'Add the prefix '+JSON.stringify(op.prefix):op.kind==='literalReplace'?'Replace every '+JSON.stringify(op.from)+' with '+JSON.stringify(op.to):op.kind==='trim'?'Remove spaces at the start and end':op.kind==='lower'?'Make letters lowercase':'Make letters uppercase';
 const scope=spec.predicate.kind==='startsWith'?'all labels starting with '+JSON.stringify(spec.predicate.value)+', including new values':'only these exact labels: '+spec.predicate.values.map(v=>JSON.stringify(v)).join(', ');
 return operation+' in '+spec.column+'; apply to '+scope+'.';
}
