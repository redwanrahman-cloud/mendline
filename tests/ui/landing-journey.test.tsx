import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import App from '../../src/ui/App';
import LandingPage,{scenes} from '../../src/ui/LandingPage';
import {StoryFrame,SCENE_MS} from '../../src/ui/landing/TeachingStoryboard';
describe('landing journey (static checks, not mounted browser proof)',()=>{
 it('offers real entry points before the optional illustration, with no heavy media',()=>{
  const html=renderToStaticMarkup(<LandingPage onTry={()=>{}} onUseOwn={()=>{}}/>);
  expect(html).toContain('New spreadsheet.');expect(html).toContain('Keep the lesson.');
  expect(html.indexOf('Try the example yourself')).toBeLessThan(html.indexOf('Illustrated walkthrough'));
  expect(html.indexOf('Use your own CSV')).toBeLessThan(html.indexOf('Illustrated walkthrough'));
  expect(html).toContain('Read the full walkthrough');expect(html).toContain('not a recording or a live approval');
  expect(html).not.toMatch(/<(video|audio|iframe|img)\b/);
  expect(html).toContain('Play walkthrough');expect(html).toContain('Replay');
 });
 it('covers clarification, an unseen value, fresh approval, exclusions and downloads in 33 seconds',()=>{
  expect(scenes).toHaveLength(6);expect(scenes.length*SCENE_MS).toBe(33000);
  expect(scenes[1].before).toBe('SKU:SKU:tea');expect(scenes[1].after).toBe('SKU:tea');
  expect(scenes[2].before).toBe('SKU:novel');expect(scenes[2].status).toBe('Unchanged');
  expect(scenes[3].after).toBe('novel');expect(scenes[3].status).toBe('Proposed');
  expect(scenes[4].caption).toContain('preview');expect(scenes[4].caption).toContain('never applies a correction automatically');
  expect(scenes[5].caption).toContain('Resolve outstanding holds before exporting');
  const html=renderToStaticMarkup(<LandingPage onTry={()=>{}} onUseOwn={()=>{}}/>);
  for(const scene of scenes)expect(html).toContain(scene.title);
 });
 it.each(scenes.map((s,i)=>({i,status:s.status})))('labels scene $i status without relying on color',({i,status})=>{
  const html=renderToStaticMarkup(<StoryFrame scene={i}/>);expect(html).toContain(status);
  if(i>=3){expect(html).toContain('Blocked from the rule');expect(html).toContain('Uncertain identity');}
  expect(html).not.toContain('story-animate');
 });
 it('preserves the original review workspace mounted but hidden on first visit',()=>{
  const html=renderToStaticMarkup(<App/>);expect(html).toContain('hidden=""');
  expect(html).toContain('for="file-O"');expect(html).toContain('Restore inputs');
 });
});
