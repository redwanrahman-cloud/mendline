import {expect,it} from 'vitest';
import {parseCsv,serializeCsv,reconcile,resolve,exportReviewed,hashBytes} from '../../src/engine';
import type {Result} from '../../src/engine';
const bytes=(s:string)=>new TextEncoder().encode(s);
const value=<T>(r:Result<T>):T=>{if(!r.ok)throw Error(JSON.stringify(r.error));return r.value};

it('preserves a literal leading marker through serialization and native UTF-8 decoding',()=>{
 const headers=['\uFEFFid','value'],rows=[['\uFEFF001','\uFEFFcell'],['002','']];
 const output=serializeCsv(headers,rows);
 expect(Array.from(output.slice(0,4))).toEqual([0x22,0xef,0xbb,0xbf]);
 expect(new TextDecoder().decode(output)).toBe('"\uFEFFid",value\r\n\uFEFF001,\uFEFFcell\r\n002,\r\n');
 const parsed=value(parseCsv('N',output));
 expect(parsed.headers).toEqual(headers);expect(parsed.rows).toEqual(rows);
});

it('consumes exactly one initial transport BOM and retains quoted literal markers and raw bytes',()=>{
 for(const text of ['id,value\n001,x','"\uFEFFid",value\n"\uFEFF001",\uFEFFx','\uFEFFid,value\n001,x']){
  const raw=bytes('\uFEFF'+text),parsed=value(parseCsv('O',raw));
  expect(parsed.headers[0]).toBe(text.startsWith('id')?'id':'\uFEFFid');
  expect(parsed.rawUtf8).toEqual(Array.from(raw));expect(parsed.rawSha256).toBe(hashBytes(raw));
 }
 expect(value(parseCsv('O',bytes('id,value\n\uFEFF001,\uFEFFx')))).toMatchObject({rows:[['\uFEFF001','\uFEFFx']]});
});

it('retains the quoted marker key and corrected cell through reviewed export without changing originals',()=>{
 const O=value(parseCsv('O',bytes('"\uFEFFid",identity,value\n001,P1,old')));
 const C=value(parseCsv('C',bytes('"\uFEFFid",identity,value\n001,P1,\uFEFFnew')));
 const N=value(parseCsv('N',bytes('"\uFEFFid",identity,value\n001,P1,old')));
 const originals=JSON.stringify([O,C,N]);
 const state=value(reconcile(O,C,N,{keyColumn:'\uFEFFid',identityColumns:['identity'],assumptionConfirmed:true,assumptionReason:'Synthetic stable identity'}));
 const done=value(resolve(state,{binding:state.binding,assessmentId:state.assessments[0].id,action:'apply'}));
 const output=value(exportReviewed(done,done.binding));
 expect(value(parseCsv('N',output.csvUtf8))).toMatchObject({headers:O.headers,rows:[['001','P1','\uFEFFnew']]});
 expect(JSON.stringify([O,C,N])).toBe(originals);
});

it('keeps empty CSV/header rejection and exact empty cell/quoted CSV invariants',()=>{
 for(const raw of ['', '\uFEFF'])expect(parseCsv('N',bytes(raw))).toMatchObject({ok:false,error:{code:'EMPTY_CSV'}});
 for(const raw of ['\n','id,\n001,x','"",value\n001,x','id,id\n001,x'])expect(parseCsv('N',bytes(raw))).toMatchObject({ok:false,error:{code:'HEADERS'}});
 const headers=['id','value'],rows=[['\uFEFF001',''],['002','comma, quote"\r\nline']];
 expect(value(parseCsv('N',serializeCsv(headers,rows)))).toMatchObject({headers,rows});
});
