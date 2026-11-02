import {useEffect,useState} from 'react';
export const SCENE_MS=5500;
export const scenes = [
 {title:'Fix a familiar label.',tab:'Correct',file:'Previous export',before:'SKU:tea',after:'tea',status:'Example correction',tone:'example',note:'A label changes. The product ID does not.',caption:'Your weekly product export adds SKU: to labels. Show the correction SKU:tea → tea. One example can fit several rules.'},
 {title:'One prefix, or every prefix?',tab:'Clarify',file:'A simple question',before:'SKU:SKU:tea',after:'SKU:tea',status:'Your intended answer',tone:'question',note:'Keep one SKU: here. Remove only the first prefix.',caption:'For SKU:SKU:tea, choose SKU:tea—not tea. Then choose the matching rule and explicitly allow labels starting with SKU:, including new values.'},
 {title:'A new week. A new export.',tab:'Later file',file:'Later export · new + reordered rows',before:'SKU:novel',after:'Not changed yet',status:'Unchanged',tone:'unchanged',note:'Your teaching is retained. Your old approval is not.',caption:'The later export includes SKU:novel, a label you never taught. The retained correction is inactive until you approve it for this file.'},
 {title:'A proposal, not a promise.',tab:'Proposal',file:'Review the retained lesson',before:'SKU:novel',after:'novel',status:'Proposed',tone:'proposed',note:'New value, chosen scope. Still needs fresh approval.',caption:'Review the retained rule and scope for this later file. The proposed result is novel. Uncertain identities and competing corrections stay excluded.'},
 {title:'You give the fresh go-ahead.',tab:'Approve',file:'Illustrated decision · later file',before:'SKU:novel',after:'novel',status:'Approved in this illustration',tone:'approved',note:'Approve this file’s rule → preview → approve eligible changes.',caption:'Explicitly approve reuse for this file, preview the suggestions, then approve eligible changes. An old approval never applies a correction automatically.'},
 {title:'Take a clean copy with you.',tab:'Download',file:'Illustrated result · originals preserved',before:'Reviewed CSV',after:'+ correction history',status:'Ready after review',tone:'download',note:'Uncertain identity: unchanged. Source conflict: your decision.',caption:'Resolve outstanding holds before exporting. Download the reviewed CSV and separate history. Uncertain records stay unchanged, and original files are never overwritten.'}
] as const;
export function StoryFrame({scene,animate=false}:{scene:number;animate?:boolean}){
 const current=scenes[scene];
 return <div className={`story-frame story-${current.tone}${animate?' story-animate':''}`}>
  <div className="sheet-heading"><span aria-hidden="true">▤</span><span>{current.file}</span><span className="sheet-count">{String(scene+1).padStart(2,'0')} / 06</span></div>
  <div className="story-sheet"><p className="sheet-label">{scene<5?'PRODUCT LABEL':'DOWNLOADS'}</p><div className="story-values"><span>{current.before}</span><span className="mend-join" aria-hidden="true">↓</span><strong>{current.after}</strong></div><p className="story-status"><span aria-hidden="true">{scene===4?'✓':scene===3?'?':scene===2?'—':'↳'}</span>{current.status}</p></div>
  <p className="sheet-annotation">{current.note}</p>
  {scene>=3&&<div className="story-exception"><strong>Blocked from the rule</strong><span>Uncertain identity / competing correction</span></div>}
 </div>;
}
export default function TeachingStoryboard({onTry}:{onTry:()=>void}){
 const [scene,setScene]=useState(0),[playing,setPlaying]=useState(false),[reduced,setReduced]=useState(false),[playback,setPlayback]=useState(0);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>{setReduced(media.matches);if(media.matches)setPlaying(false);};update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{if(!playing||reduced)return;const timer=window.setTimeout(()=>{if(scene===scenes.length-1)setPlaying(false);else setScene(scene+1);},SCENE_MS);return()=>window.clearTimeout(timer);},[playing,scene,reduced,playback]);
 function select(index:number){setPlaying(false);setScene(index);}
 const current=scenes[scene];
 return <section className="walkthrough" aria-labelledby="walkthrough-title">
  <div className="walkthrough-top"><h2 id="walkthrough-title">A weekly export, mended.</h2><span>33 seconds · no audio</span></div><p className="walkthrough-disclaimer">Illustrated walkthrough · not a recording or a live approval.</p>
  <div className="story-rail" role="group" aria-label="Walkthrough scenes">{scenes.map((s,i)=><button key={s.tab} aria-current={i===scene?'step':undefined} aria-label={`Scene ${i+1}: ${s.tab}`} onClick={()=>select(i)}><span aria-hidden="true">{i+1}</span><span>{s.tab}</span></button>)}</div>
  <div className="story-stage" aria-live={playing?'off':'polite'} aria-atomic="true"><h3>{current.title}</h3><StoryFrame key={`${playback}-${scene}`} scene={scene} animate={playing&&!reduced}/><p className="story-caption">{current.caption}</p></div>
  <div className="story-controls">{!reduced&&<button className="story-play" aria-pressed={playing} onClick={()=>{if(!playing&&scene===scenes.length-1)setScene(0);setPlaying(!playing);}}>{playing?'Pause walkthrough':'Play walkthrough'}</button>}<button disabled={scene===0} onClick={()=>select(scene-1)}>Previous</button><button disabled={scene===scenes.length-1} onClick={()=>select(scene+1)}>Next</button><button onClick={()=>{setScene(0);setPlayback(value=>value+1);setPlaying(!reduced);}}>{reduced?'Start again':'Replay'}</button></div>
  <p className="landing-footnote">{reduced?'Reduced motion: use Previous, Next or the numbered scenes. Nothing advances automatically.':'Optional playback. Pause to read, or choose any numbered scene.'}</p><details><summary>Read the full walkthrough</summary><ol>{scenes.map(s=><li key={s.title}><strong>{s.title}</strong><p>{s.caption}</p></li>)}</ol></details><button className="story-try" onClick={onTry}>Try the example yourself <span aria-hidden="true">↗</span></button>
 </section>;
}

