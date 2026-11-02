import {describe,it,expect} from 'vitest';
import {parseCsv,reconcile,resolve,undo,preview,exportReviewed,exportHistory,serializeCsv,importHistory,saveSession,loadSession,hashBytes} from '../../src/engine';
import type {Result,ReviewState,Policy,Role,Action} from '../../src/engine';
const bytes=(s:string)=>new TextEncoder().encode(s);
function value<T>(r:Result<T>):T{if(!r.ok)throw Error(JSON.stringify(r.error));return r.value}
const p:Policy={keyColumn:'sku',identityColumns:['product_code'],assumptionConfirmed:true,assumptionReason:'Stable catalog identity; same-key reuse cannot be detected if identity stays equal'};
const original=['sku,product_code,label','001,P1,Tea','002,P2,Cup','003,P3,Box','004,P4,Pen','005,P5,Pad'].join('\n');
const corrected=['sku,product_code,label','001,P1,Green tea','002,P2,Blue cup','003,P3,Gift box','004,P4,Black pen','005,P5,Memo pad'].join('\n');
const latest=['label,sku,product_code','New item,006,P6','Large box,003,P3','Tea,001,P1','Pad,005,P9','Blue cup,002,P2'].join('\n');
const snap=(r:Role,s:string)=>value(parseCsv(r,bytes(s)));
const start=(n=latest,policy=p)=>value(reconcile(snap('O',original),snap('C',corrected),snap('N',n),policy));
function act(s:ReviewState,key:string,action:Action,reason='Reviewed fictional catalog',v?:string){return value(resolve(s,{binding:s.binding,assessmentId:s.assessments.find(a=>a.key===key)!.id,action,reason,value:v}))}
function complete(s=start()){s=act(s,'001','apply');s=act(s,'003','keep_latest');s=act(s,'004','acknowledge_omission');return act(s,'005','retire')}
describe('frozen exact-key acceptance',()=>{
 it('classifies all five states and preserves original bytes and latest order',()=>{
  const s=start(),before=JSON.stringify(s);expect(s.assessments.map(a=>a.state)).toEqual(['carry','upstream_fixed','conflict','orphan','identity_hold']);
  const done=complete(s),out=value(exportReviewed(done,done.binding)),parsed=value(parseCsv('N',out.csvUtf8));
  expect(parsed.rows).toEqual([['New item','006','P6'],['Large box','003','P3'],['Green tea','001','P1'],['Pad','005','P9'],['Blue cup','002','P2']]);
  expect(JSON.stringify(s)).toBe(before);expect(done.snapshots.O.rawSha256).toBe(hashBytes(bytes(original)));expect(JSON.parse(out.historyJson).complete).toBe(true);
 });
 it('undo restores hold; all old revision or generation bindings fail without mutation',()=>{
  const done=complete(),old=structuredClone(done.binding),event=done.events.find(e=>e.key==='003')!,s=value(undo(done,{binding:done.binding,eventId:event.id}));
  expect(s.assessments.find(a=>a.key==='003')!.resolved).toBe(false);expect(exportReviewed(s,s.binding).ok).toBe(false);
  const before=JSON.stringify(s);expect(exportReviewed(s,old)).toMatchObject({ok:false,error:{code:'STALE_BINDING'}});
  expect(resolve(s,{binding:old,assessmentId:event.assessmentId,action:'apply',reason:'x'})).toMatchObject({ok:false,error:{code:'STALE_BINDING'}});expect(JSON.stringify(s)).toBe(before);
  const replaced=start(latest+'\nAnother,007,P7');expect(exportReviewed(replaced,done.binding)).toMatchObject({ok:false,error:{code:'STALE_BINDING'}});
 });
 it('identity precedes N==C and N==O; absent continuity holds every surviving correction',()=>{
  expect(start(latest.replace('Pad,005','Memo pad,005')).assessments.find(a=>a.key==='005')!.state).toBe('identity_hold');
  expect(start(latest,{...p,identityColumns:[]}).assessments.filter(a=>a.state==='identity_hold')).toHaveLength(4);
  const s=start(),confirmed=act(s,'005','confirm_continuity');expect(confirmed.assessments.find(a=>a.key==='005')).toMatchObject({state:'carry',resolved:false});
  const applied=act(confirmed,'005','apply'),undone=value(undo(applied,{binding:applied.binding,eventId:confirmed.events[0].id}));
  expect(undone.assessments.find(a=>a.key==='005')).toMatchObject({state:'identity_hold',resolved:false});expect(undone.events.at(-1)!.invalidates).toHaveLength(1);
  expect(importHistory(value(exportHistory(undone))).ok).toBe(true);
 });
 it('requires conflict/identity reasons and permits empty replacement',()=>{
  const s=start(),a=s.assessments.find(a=>a.key==='003')!;
  expect(resolve(s,{binding:s.binding,assessmentId:a.id,action:'replace',value:''})).toMatchObject({ok:false,error:{code:'INVALID_ACTION'}});
  expect(act(s,'003','replace','Explicit empty label','').assessments.find(a=>a.key==='003')!.outputValue).toBe('');
 });
 it('rejects duplicates, blank keys, edited keys and stable field corrections',()=>{
  for(const [n,code] of [[latest+'\nOther,001,P1','DUPLICATE_KEY'],[latest.replace('Tea,001,P1','Tea,,P1'),'BLANK_KEY']])expect(reconcile(snap('O',original),snap('C',corrected),snap('N',n),p)).toMatchObject({ok:false,error:{code}});
  expect(reconcile(snap('O',original),snap('C',corrected.replace('001,','01,')),snap('N',latest),p)).toMatchObject({ok:false,error:{code:'KEY_SET'}});
  expect(reconcile(snap('O',original),snap('C',corrected.replace('P1','PX')),snap('N',latest),p)).toMatchObject({ok:false,error:{code:'IDENTITY_EDIT'}});
 });
 it('formula hold scans untouched new rows and headers; incomplete JSON remains available',()=>{
  const s=complete(start(latest.replace('New item',' \t=1+1')));expect(exportReviewed(s,s.binding)).toMatchObject({ok:false,error:{code:'FORMULA_HOLD',row:2,column:'label'}});
  expect(JSON.parse(value(exportHistory(s))).complete).toBe(false);
  for(const risk of ['+1','-1','@SUM(A1)','\u0000=1']){const risky=complete(start(latest.replace('New item',risk)));expect(exportReviewed(risky,risky.binding)).toMatchObject({ok:false,error:{code:'FORMULA_HOLD'}})}
 });
 it('strict parser handles quoted comma, quote, newline and empty distinctly from absence',()=>{
  const headers=['sku','label'],rows=[['001','comma, quote" and\nnewline'],['002','']];const s=value(parseCsv('N',serializeCsv(headers,rows)));expect(s.rows).toEqual(rows);
  for(const bad of ['a,a\n1,2','a,b\n1','a,b\n"unclosed,2','a,b\n"x"oops,2','a,b\nhi"x,2'])expect(parseCsv('O',bytes(bad)).ok).toBe(false);
  expect(parseCsv('O',new Uint8Array([0xff])).ok).toBe(false);
 });
 it('recovers exact decisions on reload and rejects tampered hashes, events and stale desk',()=>{
  const s=complete(),out=value(exportReviewed(s,s.binding));expect(value(importHistory(out.historyJson))).toEqual(s);
  const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v)},removeItem:(k:string)=>{store.delete(k)}};
  expect(saveSession(s,storage).ok).toBe(true);expect(value(loadSession(storage))).toEqual(s);
  const h=JSON.parse(out.historyJson);h.snapshots.N.rows[0][0]='tampered';expect(importHistory(JSON.stringify(h)).ok).toBe(false);
  const e=JSON.parse(out.historyJson);e.events[0].after.outputValue='tampered';expect(importHistory(JSON.stringify(e)).ok).toBe(false);
  expect(importHistory(out.historyJson,start().binding)).toMatchObject({ok:false,error:{code:'STALE_BINDING'}});
  expect(saveSession(s,{...storage,setItem:()=>{throw Error('quota')}})).toMatchObject({ok:false,error:{code:'PERSISTENCE'}});
 });
});

describe('integrity boundaries',()=>{
 it('hashes standard SHA-256 and the exact content/policy/generation tuples',()=>{
  expect(hashBytes(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const s=start(),h=(v:unknown)=>hashBytes(bytes(JSON.stringify(v))),{O,C,N}=s.snapshots;
  expect(O.contentSha256).toBe(h([O.headers,O.rows]));
  expect(s.binding.policyHash).toBe(h([p.keyColumn,p.identityColumns,p.assumptionConfirmed,p.assumptionReason]));
  expect(s.binding.generationHash).toBe(h([O.rawSha256,O.contentSha256,C.rawSha256,C.contentSha256,N.rawSha256,N.contentSha256,s.binding.policyHash]));
  expect(s.assessments[0].id).toBe(h([s.binding.generationHash,'001','label']));
 });
 it('preserves distinct empty, numeric-looking and Unicode exact strings',()=>{
  const rows=[['001','1'],['1','001'],[' 1',''],['?','e?']];
  expect(value(parseCsv('N',serializeCsv(['id','value'],rows))).rows).toEqual(rows);
 });
 it('no-correction generation retains every latest cell; formula-risk headers also hold',()=>{
  const o=snap('O','id,name\n001,Tea'),c=snap('C','id,name\n001,Tea'),n=snap('N','name,id\nCoffee,001\nCup,002');
  const s=value(reconcile(o,c,n,{keyColumn:'id',identityColumns:[],assumptionConfirmed:false,assumptionReason:''}));
  expect(s.assessments).toHaveLength(0);expect(value(preview(s)).rows).toEqual(n.rows);expect(exportReviewed(s,s.binding).ok).toBe(true);
  const a=snap('O','id,=name\n001,Tea'),b=snap('C','id,=name\n001,Tea'),d=snap('N','id,=name\n001,Tea');
  const held=value(reconcile(a,b,d,s.policy));expect(exportReviewed(held,held.binding)).toMatchObject({ok:false,error:{code:'FORMULA_HOLD',row:1}});
 });
 it('schema changes and blank headers reject; replacement policy resets revision without replay',()=>{
  expect(parseCsv('N',bytes('id,\n1,x'))).toMatchObject({ok:false,error:{code:'HEADERS'}});
  expect(reconcile(snap('O',original),snap('C',corrected),snap('N',latest.replace('label,sku','name,sku')),p)).toMatchObject({ok:false,error:{code:'SCHEMA'}});
  const previous=complete(),next=start(latest,{...p,assumptionReason:'New explicit policy reason'});expect(next.events).toEqual([]);expect(next.binding.expectedRevision).toBe(0);
  expect(exportReviewed(next,previous.binding)).toMatchObject({ok:false,error:{code:'STALE_BINDING'}});
 });
 it('each binding component is checked and failed/cancelled operations do not mutate',()=>{
  const s=start(),before=JSON.stringify(s),a=s.assessments[0];
  for(const b of [{...s.binding,generationHash:'x'},{...s.binding,policyHash:'x'},{...s.binding,inputHashes:{...s.binding.inputHashes,N:'x'}}])expect(resolve(s,{binding:b,assessmentId:a.id,action:'apply'})).toMatchObject({ok:false,error:{code:'STALE_BINDING'}});
  expect(resolve(s,{binding:s.binding,assessmentId:a.id,action:'replace',value:'draft'})).toMatchObject({ok:false,error:{code:'INVALID_ACTION'}});
  expect(JSON.stringify(s)).toBe(before);
 });
 it('raw snapshot mutation and invented output claims fail recovery',()=>{
  const s=start(),h=JSON.parse(value(exportHistory(s)));h.snapshots.O.rawUtf8[0]=0;
  expect(importHistory(JSON.stringify(h)).ok).toBe(false);
  const invented=JSON.parse(value(exportHistory(s)));invented.outputSha256='x';expect(importHistory(JSON.stringify(invented))).toMatchObject({ok:false,error:{code:'HISTORY_SCHEMA'}});
 });
});

it('final export rejects altered in-memory inputs and decisions',()=>{
 const s=complete();s.snapshots.N.rows[0][0]='unexpected';expect(exportReviewed(s,s.binding)).toMatchObject({ok:false,error:{code:'HASH_MISMATCH'}});
 const d=complete();d.assessments[0].outputValue='invented';expect(exportReviewed(d,d.binding)).toMatchObject({ok:false,error:{code:'HISTORY_MISMATCH'}});
});
