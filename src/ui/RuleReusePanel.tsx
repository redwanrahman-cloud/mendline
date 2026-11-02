import {useEffect,useMemo,useRef,useState} from 'react';
import {type Review} from './adapter';
import {decideReuse,retainedRules,type RetainedRule} from './ruleReuse';

type Props={histories:readonly string[];review:Review|null;commit:(next:Review,message:string)=>void;fail:(error:unknown)=>void;dirty:(id:string,value:boolean)=>void};
export default function RuleReusePanel(props:Props){
  const result=useMemo(()=>{try{return {proposals:retainedRules(props.histories),error:''};}catch(e){return {proposals:[],error:String(e)};}},[props.histories]);
  if(!result.proposals.length&&!result.error)return null;
  return <section className="panel" aria-labelledby="reuse-title"><h2 id="reuse-title">Retained teaching — INACTIVE proposals</h2>
    <p>Archived reviews are evidence, not current authority. These proposals retain the original examples without retyping. No old approval, overlay or preview receipt transfers. Source history is consistency evidence, not authenticated authorship.</p>
    {!props.review&&<p>Import the later export, confirm its identity assumption and open a new review before choosing reuse.</p>}
    {result.error&&<p role="alert">Retained teaching could not be validated: {result.error}. No proposal activated.</p>}
    {result.proposals.map(proposal=><ReuseProposal key={`${proposal.sourceHistoryHash}-${proposal.sourceRule.ref.ruleId}-${props.review?.binding.generationHash??'no-target'}-${props.review?.binding.expectedRevision??0}`} {...props} proposal={proposal}/>)}
  </section>;
}
function ReuseProposal({proposal,review,commit,fail,dirty}:Props&{proposal:RetainedRule}){
  const [chosen,setChosen]=useState(false),[confirmed,setConfirmed]=useState(false),[reason,setReason]=useState('');
  const id=`reuse-${proposal.sourceHistoryHash}-${proposal.sourceRule.ref.ruleId}`;
  const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  useEffect(()=>{dirtyRef.current(id,chosen||!!reason||confirmed);return()=>dirtyRef.current(id,false);},[id,chosen,reason,confirmed]);
  const rule=proposal.sourceRule;
  const eligible=!!review&&review.policy.assumptionConfirmed&&!!review.policy.assumptionReason.trim();
  function decide(decision:'approve'|'reject'){
    if(!review)return;
    try{const next=decideReuse(review,proposal,decision,reason);setChosen(false);setReason('');setConfirmed(false);commit(next,decision==='approve'?'Retained teaching freshly approved for this target only. Request a new rule preview, then separately approve application.':'Reuse rejected for this target; reason and provenance recorded. No rule activated.');}catch(e){fail(e);}
  }
  return <article className="rule-inspection"><h3>INACTIVE proposal · {rule.spec.column}</h3>
    <p>Originating generation: <code>{proposal.sourceBinding.generationHash}</code></p>
    <p>Source rule: <code>{rule.ref.ruleId}</code> · v{rule.ref.version} · spec <code>{rule.ref.specHash}</code></p>
    <p>Original approval: {rule.approval.reason} · event {rule.approval.eventId}</p>
    <p>Operation: <code>{JSON.stringify(rule.spec.operation)}</code></p><p>Unchanged scope: <code>{JSON.stringify(rule.spec.predicate)}</code></p>
    <details><summary>Original teaching, examples and alternatives</summary><pre>{JSON.stringify(rule.teaching,null,2)}</pre></details>
    {review&&<p>Target generation: <code>{review.binding.generationHash}</code> · column {rule.spec.column}. Identity declaration: {review.policy.assumptionReason||'Not confirmed'}</p>}
    <label className="check"><input type="checkbox" disabled={!eligible} checked={chosen} onChange={e=>setChosen(e.target.checked)}/>Choose to reuse this retained teaching on the current target</label>
    {chosen&&<><label>Reuse decision reason (required)<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this target identity declaration and approve the displayed original operation and scope for these exports.</label>
      <button disabled={!eligible||!reason.trim()||!confirmed} onClick={()=>decide('approve')}>Approve retained rule for target</button>
      <button disabled={!eligible||!reason.trim()} onClick={()=>decide('reject')}>Reject reuse for target</button></>}
  </article>;
}
