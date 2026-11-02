import {api, unwrap, type Review} from './adapter';

export type RetainedRule = Extract<ReturnType<typeof api.extractRuleProposalV1>, {ok:true}>['value'];

// Archives are the existing recovery store. Revalidate evidence, never trust a saved proposal.
export function retainedRules(histories:readonly string[]):RetainedRule[]{
  const proposals=new Map<string,RetainedRule>();
  for(const history of histories){
    const source=unwrap(api.importHistory(history));
    for(const rule of source.intelligence?.rules??[]){
      if(!rule.active)continue;
      const proposal=unwrap(api.extractRuleProposalV1(history,rule.ref));
      proposals.set(`${proposal.sourceHistoryHash}:${rule.ref.ruleId}:${rule.ref.version}`,proposal);
    }
  }
  return [...proposals.values()];
}
export function decideReuse(review:Review,proposal:RetainedRule,decision:'approve'|'reject',reason:string){
  if(!review.policy.assumptionConfirmed||!review.policy.assumptionReason.trim())throw new Error('Confirm identity for the target exports before deciding reuse.');
  return unwrap(api.decideReusedRuleV1(review,{binding:review.binding,proposal,decision,reason}));
}
export const laterIntentExport='identity,label,id\r\nI-a,SKU:tea,a\r\nI-b,SKU:novel,b\r\nREUSED,SKU:unsafe,u\r\nI-c,SKU:new,c\r\nI-o,plain,o\r\nI-d,SKU:SKU:tea,d';
