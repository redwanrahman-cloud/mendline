import {useEffect,useRef,useState} from 'react';
import {valueLabel,type Review} from './adapter';
import {teach,decideTeaching,inspectRule,decideApplication,compensateRule,sameReviewBinding,
  type Teaching,type ExamplePair,type Binding,type Predicate,type RulePreview} from './ruleIntent';

type Props={review:Review;commit:(next:Review,message:string)=>void;fail:(error:unknown)=>void;dirty:(id:string,value:boolean)=>void};
export default function RuleIntent({review,commit,fail,dirty}:Props){
  const columns=review.snapshots.N.headers.filter(h=>h!==review.policy.keyColumn&&!review.policy.identityColumns.includes(h));
  const [column,setColumn]=useState('');
  const [examples,setExamples]=useState<ExamplePair[]>([{input:'',output:''}]);
  const [proposal,setProposal]=useState<{teaching:Teaching;binding:Binding}|null>(null);
  const [candidate,setCandidate]=useState('');
  const [scope,setScope]=useState<'exactValues'|'startsWith'>('exactValues');
  const [prefix,setPrefix]=useState('');const [reason,setReason]=useState('');
  const [confirmed,setConfirmed]=useState(false);const [isDirty,setDirty]=useState(false);
  const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  useEffect(()=>{dirtyRef.current('rule-teaching',isDirty);return()=>dirtyRef.current('rule-teaching',false);},[isDirty]);
  function invalidateTeaching(){setProposal(null);setCandidate('');setConfirmed(false);setDirty(true);}
  function runTeaching(){try{const teaching=teach(column,examples);setProposal({teaching,binding:review.binding});setCandidate('');setConfirmed(false);setDirty(true);}catch(e){fail(e);}}
  const teaching=proposal?.teaching;
  const predicate:Predicate=scope==='startsWith'?{kind:'startsWith',value:prefix}:{kind:'exactValues',values:[...new Set((teaching?.examples??examples).map(e=>e.input))]};
  const stale=!!proposal&&!sameReviewBinding(proposal.binding,review.binding);
  const canDecide=!!proposal&&!!candidate&&!!reason.trim()&&!stale&&(scope==='exactValues'||prefix.length>0);
  function decide(decision:'approve'|'reject'){
    if(!proposal)return;
    try{const next=decideTeaching(review,proposal.binding,proposal.teaching,candidate,predicate,decision,reason);
      setProposal(null);setCandidate('');setReason('');setConfirmed(false);setDirty(false);
      commit(next,decision==='approve'?'Rule approved, not applied. Inspect its effects on Latest before deciding.':'Rule rejected. No transformation was applied.');
    }catch(e){fail(e);}
  }
  const rules=review.intelligence?.rules??[];
  const events=review.intelligence?.events??[];
  return <section className="panel rule-intent" aria-labelledby="rule-title">
    <p className="eyebrow">TEACH / INSPECT / DECIDE</p><h2 id="rule-title">Teach a correction rule</h2>
    <p>Examples suggest finite alternatives, not universal intent. No rule is selected or applied automatically. Key and identity fields are excluded.</p>
    <p className="small">A rule acts on this generation's raw Latest export, never another rule's output. Loading refreshed files archives this review and retains its approved teaching as INACTIVE proposals. Explicitly reuse and approve for the new target; then preview and apply afresh. Existing CSV correction review remains separate.</p>
    <label>Rule column<select value={column} onChange={e=>{setColumn(e.target.value);invalidateTeaching();}}><option value="">Choose a non-identity column</option>{columns.map(h=><option key={h}>{h}</option>)}</select></label>
    <fieldset><legend>Your exact examples (1–32; empty output is valid)</legend>
      {examples.map((pair,i)=><div className="rule-example" key={i}>
        <label>Example {i+1} input<textarea maxLength={256} value={pair.input} onChange={e=>{setExamples(v=>v.map((p,j)=>j===i?{...p,input:e.target.value}:p));invalidateTeaching();}}/></label>
        <label>Example {i+1} desired output<textarea maxLength={256} value={pair.output} onChange={e=>{setExamples(v=>v.map((p,j)=>j===i?{...p,output:e.target.value}:p));invalidateTeaching();}}/></label>
        <button disabled={examples.length===1} onClick={()=>{setExamples(v=>v.filter((_,j)=>j!==i));invalidateTeaching();}}>Remove example {i+1}</button>
      </div>)}
      <div className="toolbar"><button disabled={examples.length>=32} onClick={()=>{setExamples(v=>[...v,{input:'',output:''}]);invalidateTeaching();}}>Add example</button><button disabled={!column} onClick={runTeaching}>Find alternatives</button></div>
    </fieldset>
    {teaching&&<div className="rule-proposal">
      <h3>{teaching.status} · {teaching.alternatives.length} alternatives</h3><p>{teaching.reason}</p>
      {stale&&<p role="alert" className="hold">Teaching decision is stale: the review changed. Find alternatives again before deciding. Nothing was retried.</p>}
      <fieldset><legend>Select one alternative explicitly — even when only one fits</legend>
        {teaching.alternatives.map((alt,i)=><div className="rule-alternative" key={alt.candidateId}>
          <label className="check"><input type="radio" name="rule-alternative" checked={candidate===alt.candidateId} onChange={()=>{setCandidate(alt.candidateId);setConfirmed(false);setDirty(true);}}/>Alternative {i+1}: {alt.description}</label>
          <p className="small">Operation: <code>{JSON.stringify(alt.operation)}</code></p><ul>{alt.assumptions.map((a,j)=><li key={j}>{a}</li>)}</ul>
        </div>)}
      </fieldset>
      <h3>Which output did you intend?</h3><p>These distinguishing inputs reveal disagreement. Supply your own desired output as another example; predicted outputs are not human evidence.</p>
      {teaching.distinguishing.length===0&&<p>No distinguishing input is available. Add another human example if intent remains uncertain.</p>}
      {teaching.distinguishing.map((d,i)=><div className="distinguishing" key={i}><p>Input: <code>{valueLabel(d.input,true)}</code></p><ul>{d.predictions.map(p=><li key={p.candidateId}>Alternative {teaching.alternatives.findIndex(a=>a.candidateId===p.candidateId)+1}: <code>{valueLabel(p.output,true)}</code></li>)}</ul>
        <button disabled={examples.length>=32} onClick={()=>{setExamples(v=>[...v,{input:d.input,output:''}]);invalidateTeaching();}}>Use distinguishing input {i+1} — enter desired output</button>
      </div>)}
      <label>Approved scope<select value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setConfirmed(false);setDirty(true);}}><option value="exactValues">Only the exact example inputs</option><option value="startsWith">Values starting with an explicit literal (includes unseen values)</option></select></label>
      {scope==='startsWith'&&<label>Case-sensitive literal prefix<input maxLength={256} value={prefix} onChange={e=>{setPrefix(e.target.value);setConfirmed(false);setDirty(true);}}/></label>}
      <p className="scope-summary">Scope on {column}: <code>{JSON.stringify(predicate)}</code></p>
      <p>{scope==='startsWith'?'This deliberately permits matching values never present in your examples. Examples do not prove that broader intent.':'Limited exact-observed mode: unseen values are excluded.'} Approval still does not apply a rule.</p>
      <label>Rule decision reason (required)<input value={reason} onChange={e=>{setReason(e.target.value);setDirty(true);}}/></label>
      <label className="check"><input type="checkbox" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setDirty(true);}}/>I approve the selected alternative and the displayed scope, including any unseen values it permits.</label>
      <div className="toolbar"><button className="primary" disabled={!canDecide||!confirmed} onClick={()=>decide('approve')}>Approve selected rule</button><button disabled={!canDecide} onClick={()=>decide('reject')}>Reject selected rule</button></div>
    </div>}
    <button onClick={()=>{setColumn('');setExamples([{input:'',output:''}]);setProposal(null);setCandidate('');setScope('exactValues');setPrefix('');setReason('');setConfirmed(false);setDirty(false);}}>Clear teaching draft</button>
    <h3 className="rule-subtitle">Approved rules · {rules.filter(r=>r.active).length} active</h3>
    {rules.map(rule=><RuleInspection key={`${rule.ref.ruleId}-${rule.ref.version}`} rule={rule} review={review} commit={commit} fail={fail} dirty={dirty}/>)}
    <details><summary>Rule decision history · {events.length} events</summary><p>Reasons, scope, exceptions and reversals are preserved. Undo appends compensation; earlier downloads remain unchanged.</p>
      {events.map(event=><div className="rule-history" key={event.eventId}><h3>r{event.revision} · {event.kind}</h3><p>{event.reason}</p>
        {event.spec&&<p>Approved specification: <code>{JSON.stringify(event.spec)}</code></p>}
        {event.teaching&&<details><summary>Teaching evidence and competing alternatives</summary><pre>{JSON.stringify(event.teaching,null,2)}</pre></details>}
        {event.cells&&<RuleCells cells={event.cells}/>}
        {event.invalidates?.length? <p>Invalidated events: {event.invalidates.join(', ')}</p>:null}
        {event.reverses&&<p>Reverses: {event.reverses}</p>}
        {(event.kind==='approve_rule'||event.kind==='apply_rule')&&!events.some(e=>e.reverses===event.eventId||e.invalidates?.includes(event.eventId))&&<RuleUndo eventId={event.eventId} revision={event.revision} review={review} commit={commit} fail={fail} dirty={dirty}/>}
      </div>)}
    </details>
  </section>;
}

export function RuleCells({cells}:{cells:RulePreview['cells']}){
  return <div className="table-wrap" tabIndex={0} role="region" aria-label="Rule effects and exceptions"><table><thead><tr>{['Key / column','Latest value','Proposed value','Decision','Why'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{cells.map(c=><tr key={c.cellId} className={c.decision==='HOLD'?'rule-held':''}><td>{c.key} / {c.column}</td><td>{valueLabel(c.before,true)}</td><td>{valueLabel(c.after,true)}</td><td>{c.decision}</td><td>{c.reason}</td></tr>)}</tbody></table></div>;
}
function RuleInspection({rule,review,commit,fail,dirty}:Props&{rule:NonNullable<Review['intelligence']>['rules'][number]}){
  const [preview,setPreview]=useState<RulePreview|null>(null);const [reason,setReason]=useState('');const [confirmed,setConfirmed]=useState(false);
  const draftId=`rule-application-${rule.ref.ruleId}-${rule.ref.version}`;
  const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  useEffect(()=>{dirtyRef.current(draftId,!!reason||confirmed);return()=>dirtyRef.current(draftId,false);},[draftId,reason,confirmed]);
  const stale=!!preview&&(!sameReviewBinding(preview.receipt.binding,review.binding)||!rule.active);
  function inspect(){try{setPreview(inspectRule(review,rule.ref));setConfirmed(false);}catch(e){fail(e);}}
  function decide(decision:'approve'|'reject'){if(!preview)return;try{const next=decideApplication(review,preview,decision,reason);setConfirmed(false);setReason('');commit(next,decision==='approve'?`Application recorded: ${preview.changedCells.length} eligible changes; held cells excluded. Existing conflicts still require review.`:'Application rejected. No rule changes applied. Request a fresh preview to reconsider.');}catch(e){fail(e);}}
  return <article className="rule-inspection"><h4>{rule.spec.column} · rule v{rule.ref.version} · {rule.active?'active':'inactive'}</h4><p><code>{JSON.stringify(rule.spec.operation)}</code></p><p>Scope: <code>{JSON.stringify(rule.spec.predicate)}</code></p><p>Approval: {rule.approval.reason}</p>
    <button disabled={!rule.active} onClick={inspect}>Preview rule v{rule.ref.version} on Latest</button>
    {preview&&<><p>Preview r{preview.receipt.binding.expectedRevision}: {preview.changedCells.length} eligible changes; {preview.cells.filter(c=>c.decision==='HOLD').length} held exceptions. No changes applied by preview.</p>
      {stale&&<p role="alert" className="hold">Stale preview — the review or rule changed. Request a fresh preview and approve again. This receipt cannot be applied.</p>}
      <RuleCells cells={preview.cells}/>
      <p>HOLD cells are excluded, not resolved. Existing corrections own their cells. Identity-uncertain records stay untouched. Out-of-scope and no-change cells are not written. Zero eligible changes means zero rule edits.</p>
      <label>Application decision reason (required)<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the changes and excluded exceptions; apply only eligible cells.</label>
      <div className="toolbar"><button className="primary" disabled={stale||!rule.active||!reason.trim()||!confirmed} onClick={()=>decide('approve')}>Apply previewed eligible changes</button><button disabled={stale||!rule.active||!reason.trim()} onClick={()=>decide('reject')}>Reject this application</button></div>
    </>}
  </article>;
}
function RuleUndo({eventId,revision,review,commit,fail,dirty}:Props&{eventId:string;revision:number}){
  const [reason,setReason]=useState('');const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  useEffect(()=>{dirtyRef.current(`undo-${eventId}`,!!reason);return()=>dirtyRef.current(`undo-${eventId}`,false);},[eventId,reason]);
  return <div><label>Undo reason for rule event r{revision}<input value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={!reason.trim()} onClick={()=>{try{const next=compensateRule(review,eventId,reason);setReason('');commit(next,'Rule undo recorded. Dependent applications may be invalidated; inspect output and history.');}catch(e){fail(e);}}}>Undo rule event r{revision}</button></div>;
}
