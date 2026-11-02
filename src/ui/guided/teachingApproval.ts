import {type Teaching} from '../ruleIntent';

// Teaching canonicalizes example order. Match exact pairs, never array positions.
// Duplicate inputs (even identical pairs) are not distinct current evidence.
export function hasCurrentGuidedEvidence(teaching:Teaching|null,output:string,clarification:string){
 if(!teaching || teaching.column!=='label')return false;
 const expected=new Map([['SKU:tea',output]]);
 if(clarification!=='')expected.set('SKU:SKU:tea',clarification);
 if(teaching.examples.length!==expected.size)return false;
 const seen=new Set<string>();
 return teaching.examples.every(pair=>{
  if(seen.has(pair.input)||!expected.has(pair.input)||expected.get(pair.input)!==pair.output)return false;
  seen.add(pair.input);return true;
 });
}
export function canApproveGuidedTeaching(teaching:Teaching|null,output:string,clarification:string,candidate:string,scope:string,confirmed:boolean,reason:string){
 return hasCurrentGuidedEvidence(teaching,output,clarification) &&
  !!candidate && !!teaching?.alternatives.some(a=>a.candidateId===candidate) &&
  (scope==='exactValues'||scope==='startsWith') && confirmed && !!reason.trim();
}
