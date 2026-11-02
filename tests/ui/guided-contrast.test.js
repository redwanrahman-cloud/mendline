import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const guided=readFileSync(new URL('../../src/styles/guided-example.css',import.meta.url),'utf8');
const landing=readFileSync(new URL('../../src/styles/landing.css',import.meta.url),'utf8');
function luminance(hex){const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe('declared-color contrast (not computed browser styles or accessibility certification)',()=>{
 it.each(['#ffffff','#fffdf8','#f5f1e8','#e3e9f2'])('keeps guided disclosure text and focus legible on %s',background=>{
  const text=guided.match(/\.guided-example summary,\.guided-example small,\.guided-example \.small\{color:(#[\da-f]{6})\}/)[1];
  const focus=guided.match(/\.guided-example :focus-visible\{outline:3px solid (#[\da-f]{6});outline-offset:3px\}/)[1];
  expect(contrast(text,background)).toBeGreaterThanOrEqual(4.5);expect(contrast(focus,background)).toBeGreaterThanOrEqual(3);
 });
 it.each([['#526071','#fffdf8'],['#415064','#f5f1e8'],['#a23f25','#f5f1e8'],['#68431a','#f5e8d4'],['#24533e','#e0eee5'],['#4b5360','#eceae4'],['#fffdf8','#182d46'],['#182d46','#e3e9f2']])('checks landing text/status pair %s on %s',(text,background)=>{
  expect(landing).toContain(text);expect(landing).toContain(background);expect(contrast(text,background)).toBeGreaterThanOrEqual(4.5);
 });
 it('keeps shared table headings readable',()=>{const css=readFileSync(new URL('../../src/styles/mendline.css',import.meta.url),'utf8');const pair=css.match(/th\{background:(#[\da-f]{6});color:(#[\da-f]{6})\}/);expect(contrast(pair[2],pair[1])).toBeGreaterThanOrEqual(4.5);});
 it('includes reduced-motion suppression and preserves hidden workspace isolation',()=>{expect(landing).toContain('@media(prefers-reduced-motion:reduce)');expect(landing).toContain('animation:none!important');expect(landing).toContain('[hidden]{display:none!important}');});
});
