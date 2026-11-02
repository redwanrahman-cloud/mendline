import {api, unwrap, type Review} from './adapter';

export type Teaching = Extract<ReturnType<typeof api.teachRuleV1>, {ok:true}>['value'];
export type RulePreview = Extract<ReturnType<typeof api.previewRuleV1>, {ok:true}>['value'];
export type RuleRef = RulePreview['receipt']['rule'];
export type Predicate = Parameters<typeof api.decideRuleV1>[1]['predicate'];
export type ExamplePair = Teaching['examples'][number];
export type Binding = Review['binding'];

// These helpers orchestrate the public API, never execute rules or validate receipts.
export function sameReviewBinding(a:Binding,b:Binding){
  return a.generationHash===b.generationHash && a.policyHash===b.policyHash &&
    a.expectedRevision===b.expectedRevision && (['O','C','N'] as const).every(r=>a.inputHashes[r]===b.inputHashes[r]);
}
export function teach(column:string,examples:readonly ExamplePair[]){return unwrap(api.teachRuleV1(column,examples));}
export function decideTeaching(state:Review,binding:Binding,teaching:Teaching,candidateId:string,predicate:Predicate,decision:'approve'|'reject',reason:string){
  return unwrap(api.decideRuleV1(state,{binding,teaching,candidateId,predicate,decision,reason}));
}
export function inspectRule(state:Review,ref:RuleRef){return unwrap(api.previewRuleV1(state,ref));}
export function decideApplication(state:Review,preview:RulePreview,decision:'approve'|'reject',reason:string){
  // Pass the original receipt; do not silently recompute or retry stale decisions.
  return unwrap(api.decideApplicationV1(state,{receipt:preview.receipt,decision,reason}));
}
export function compensateRule(state:Review,eventId:string,reason:string){return unwrap(api.undoRuleV1(state,{binding:state.binding,eventId,reason}));}
export function persistDecision(state:Review,storage:Parameters<typeof api.saveSession>[1]){
  return api.saveSession(state,storage);
}
export const intentExample={
  O:'id,identity,label\r\na,I-a,SKU:tea\r\nb,I-b,SKU:cup\r\nd,I-d,SKU:SKU:tea\r\no,I-o,plain\r\nu,I-u,SKU:unsafe\r\nc,I-c,SKU:old',
  C:'id,identity,label\r\na,I-a,SKU:tea\r\nb,I-b,SKU:cup\r\nd,I-d,SKU:SKU:tea\r\no,I-o,plain\r\nu,I-u,SKU:unsafe\r\nc,I-c,old',
  N:'label,id,identity\r\nSKU:cup,b,I-b\r\nSKU:unsafe,u,REUSED\r\nplain,o,I-o\r\nSKU:new,c,I-c\r\nSKU:SKU:tea,d,I-d\r\nSKU:tea,a,I-a',
};
