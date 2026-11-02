import {useEffect, useRef, useState} from 'react';
import LandingPage from './LandingPage';
import GuidedExample from './GuidedExample';
import ReviewDesk from './ReviewDesk';
import '../styles/landing.css';
type View = 'landing' | 'guided' | 'desk';
export default function App(){
 const [view,setView]=useState<View>('landing');
 const [guidedVisited,setGuidedVisited]=useState(false);
 const heading=useRef<HTMLDivElement>(null);
 function navigate(next:View){if(next==='guided')setGuidedVisited(true);setView(next);}
 useEffect(()=>{heading.current?.focus();},[view]);
 return <div className="mendline-product">
  <div ref={heading} tabIndex={-1} className="view-announcement" aria-label={view==='landing'?'Mendline home':view==='guided'?'Live example':'Your CSV workspace'} />
  {view!=='landing'&&<nav className="journey-nav" aria-label="Workspace navigation"><button onClick={()=>navigate('landing')}>← Mendline home</button><span>Your work stays here while you switch views. Save recovery before closing this tab.</span></nav>}
  {view==='landing'&&<LandingPage onTry={()=>navigate('guided')} onUseOwn={()=>navigate('desk')}/>}
  <div hidden={view!=='guided'}>{guidedVisited&&<GuidedExample onExit={()=>navigate('landing')} onUseOwnData={()=>navigate('desk')}/>}</div>
  <div hidden={view!=='desk'}><ReviewDesk/></div>
 </div>;
}
