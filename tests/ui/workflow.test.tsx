import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import App from '../../src/ui/App';
import {api,example,unwrap,csvText,valueLabel,type Review} from '../../src/ui/adapter';

const policy={keyColumn:'sku',identityColumns:['product_code'],assumptionConfirmed:true,assumptionReason:'Fictional stable product codes'};
function desk(latest=example.N){return unwrap(api.reconcile(...(['O','C','N'] as const).map(r=>unwrap(api.parseCsv(r,new TextEncoder().encode(r==='N'?latest:example[r])))) as [Review['snapshots']['O'],Review['snapshots']['C'],Review['snapshots']['N']],policy));}
function decide(state:Review,key:string,action:'apply'|'keep_latest'|'acknowledge_omission'|'retire'){
  return unwrap(api.resolve(state,{binding:state.binding,assessmentId:state.assessments.find(a=>a.key===key)!.id,action,reason:'Explicit fictional review'}));
}
function complete(state:Review){state=decide(state,'001','apply');state=decide(state,'003','keep_latest');state=decide(state,'004','acknowledge_omission');return decide(state,'005','retire');}
describe('UI adapter with real engine',()=>{
  it('exposes five distinct states and blocks unresolved export',()=>{
    const state=desk();expect(state.assessments.map(a=>a.state)).toEqual(['carry','upstream_fixed','conflict','orphan','identity_hold']);
    expect(api.exportReviewed(state,state.binding).ok).toBe(false);
    expect(JSON.parse(api.exportHistory(state)).complete).toBe(false);
  });
  it('exports the frozen exact output and undo restores a conflict hold',()=>{
    let state=complete(desk());const final=unwrap(api.exportReviewed(state,state.binding));
    expect(unwrap(api.parseCsv('N',final.csvUtf8)).rows).toEqual([['New item','006','P6'],['Large box','003','P3'],['Green tea','001','P1'],['Pad','005','P9'],['Blue cup','002','P2']]);
    expect(JSON.parse(final.historyJson).complete).toBe(true);
    const previous=state.binding;
    state=unwrap(api.undo(state,{binding:state.binding,eventId:state.events.find(e=>e.key==='003')!.id}));
    expect(state.assessments.find(a=>a.key==='003')?.resolved).toBe(false);
    expect(api.exportReviewed(state,state.binding).ok).toBe(false);
    expect(api.exportReviewed(state,previous)).toMatchObject({ok:false,error:{code:'STALE_BINDING'}});
  });
  it('holds untouched formula cells and reports coordinates',()=>{
    const state=complete(desk(example.N.replace('New item','=1+1')));
    expect(api.exportReviewed(state,state.binding)).toMatchObject({ok:false,error:{code:'FORMULA_HOLD',coordinates:[{row:2,column:'label'}]}});
  });
  it('serializes edited exact strings using the engine and distinguishes absent from empty',()=>{
    const rows=[['001','a,"b"\nnext'],['002','']];
    expect(unwrap(api.parseCsv('C',new TextEncoder().encode(csvText(['id','value'],rows)))).rows).toEqual(rows);
    expect(valueLabel(null)).toBe('Record absent');expect(valueLabel('')).toBe('(empty string)');expect(valueLabel(' a\n',true)).toBe('" a\\n"');
  });
  it('shows role/row diagnostics rather than claiming parse success',()=>{
    expect(()=>unwrap(api.parseCsv('N',new TextEncoder().encode('id,label\n1,x,y')))).toThrow('N · row 2');
  });
  it('renders explicit labelled import roles, identity disclosure and opt-in recovery',()=>{
    const html=renderToStaticMarkup(<App/>);
    for(const role of ['O','C','N'])expect(html).toContain(`for="file-${role}"`);
    expect(html).toContain('Same key does not always mean same record.');
    expect(html).toContain('Restore inputs');expect(html).toContain('Human-approved finite rules');
    expect(html).not.toContain('Download reviewed CSV');
  });
});
