import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
// Hook/timer simulation drives actual production handlers. Not a mounted DOM/browser test.
const h=vi.hoisted(()=>({states:[],effects:[],si:0,ei:0,pending:[]}));
vi.mock('react',async original=>({...await original(),
 useState(initial){const i=h.si++;if(!(i in h.states))h.states[i]=initial;return[h.states[i],value=>{h.states[i]=typeof value==='function'?value(h.states[i]):value;}];},
 useEffect(fn,deps){const i=h.ei++,prev=h.effects[i];if(!prev||deps.some((d,j)=>!Object.is(d,prev.deps[j]))){prev?.cleanup?.();h.effects[i]={deps};h.pending.push(()=>{h.effects[i].cleanup=fn();});}}
}));
import TeachingStoryboard from '../../src/ui/landing/TeachingStoryboard';
let listener,media;
function render(onTry=()=>{}){h.si=0;h.ei=0;const tree=TeachingStoryboard({onTry});h.pending.splice(0).forEach(fn=>fn());return tree;}
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return[];return[tree,...nodes(tree.props?.children)];}
function label(node){const c=node?.props?.children;return Array.isArray(c)?c.filter(x=>typeof x==='string').join(''):c;}
function click(name,tree=render()){const node=nodes(tree).find(n=>n.type==='button'&&(label(n)===name||n.props['aria-label']===name));expect(node,`button ${name}`).toBeDefined();expect(node.props.disabled).not.toBe(true);node.props.onClick();return render();}
beforeEach(()=>{h.states=[];h.effects=[];h.pending=[];vi.useFakeTimers();media={matches:false,addEventListener:vi.fn((_,fn)=>listener=fn),removeEventListener:vi.fn()};vi.stubGlobal('window',{matchMedia:()=>media,setTimeout,clearTimeout});});
afterEach(()=>{h.effects.forEach(e=>e.cleanup?.());vi.unstubAllGlobals();vi.useRealTimers();});
describe('actual storyboard controls with simulated React hooks and clock',()=>{
 it('does not autoplay; pauses without advancing; resumes and stops after six scenes',()=>{render();vi.advanceTimersByTime(10000);expect(h.states[0]).toBe(0);click('Play walkthrough');vi.advanceTimersByTime(5500);render();expect(h.states[0]).toBe(1);click('Pause walkthrough');vi.advanceTimersByTime(11000);render();expect(h.states[0]).toBe(1);click('Play walkthrough');for(let i=0;i<5;i++){vi.advanceTimersByTime(5500);render();}expect(h.states[0]).toBe(5);expect(h.states[1]).toBe(false);expect(vi.getTimerCount()).toBe(0);});
 it('manual scene choice pauses, Previous/Next work and Replay starts over',()=>{render();click('Play walkthrough');click('Scene 4: Proposal');expect(h.states[0]).toBe(3);expect(h.states[1]).toBe(false);click('Previous');expect(h.states[0]).toBe(2);click('Next');expect(h.states[0]).toBe(3);click('Replay');expect(h.states[0]).toBe(0);expect(h.states[1]).toBe(true);});
 it('Replay restarts the first scene timer even while already playing',()=>{render();click('Play walkthrough');vi.advanceTimersByTime(5000);click('Replay');vi.advanceTimersByTime(500);render();expect(h.states[0]).toBe(0);vi.advanceTimersByTime(5000);render();expect(h.states[0]).toBe(1);});
 it('preference changes stop timers, expose manual-only controls and clean up',()=>{render();click('Play walkthrough');media.matches=true;listener();const tree=render();expect(h.states[1]).toBe(false);expect(vi.getTimerCount()).toBe(0);expect(nodes(tree).some(n=>label(n)==='Play walkthrough')).toBe(false);click('Next');expect(h.states[0]).toBe(1);click('Start again');expect(h.states[0]).toBe(0);expect(h.states[1]).toBe(false);});
 it('reduced-motion startup stays manual and unmount cancels active playback',()=>{media.matches=true;render();render();vi.advanceTimersByTime(33000);expect(h.states[0]).toBe(0);media.matches=false;listener();render();click('Play walkthrough');h.effects.forEach(e=>e.cleanup?.());expect(vi.getTimerCount()).toBe(0);expect(media.removeEventListener).toHaveBeenCalled();});
 it('Try invokes the frozen navigation callback and never applies engine work',()=>{const onTry=vi.fn();click('Try the example yourself ',render(onTry));expect(onTry).toHaveBeenCalledOnce();});
});

