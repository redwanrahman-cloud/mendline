import * as engine from '../engine/index';

// The UI owns orchestration only. Parsing, reconciliation and decisions stay in the engine.
export const api = {...engine, exportHistory:(state:Review)=>unwrap(engine.exportHistory(state))};
export type Review = Extract<ReturnType<typeof engine.reconcile>, {ok:true}>['value'];
export type Policy = Review['policy'];
export type Assessment = Review['assessments'][number];
export type Role = 'O' | 'C' | 'N';
export const example = {
  O: 'sku,product_code,label\r\n001,P1,Tea\r\n002,P2,Cup\r\n003,P3,Box\r\n004,P4,Pen\r\n005,P5,Pad',
  C: 'sku,product_code,label\r\n001,P1,Green tea\r\n002,P2,Blue cup\r\n003,P3,Gift box\r\n004,P4,Black pen\r\n005,P5,Memo pad',
  N: 'label,sku,product_code\r\nNew item,006,P6\r\nLarge box,003,P3\r\nTea,001,P1\r\nPad,005,P9\r\nBlue cup,002,P2',
};
export function csvText(headers:string[], rows:string[][]) {
  return new TextDecoder().decode(engine.serializeCsv(headers,rows));
}
export function valueLabel(value:string|null, visible=false) {
  if(value === null) return 'Record absent';
  if(value === '') return '(empty string)';
  return visible ? JSON.stringify(value) : value;
}
export function unwrap<T>(result:{ok:true;value:T}|{ok:false;error:{code:string;message:string;role?:string;row?:number;column?:string}}):T {
  if(result.ok) return result.value;
  const e=result.error;
  throw new Error([e.code,e.role,e.row === undefined ? '' : `row ${e.row}`,e.column,e.message].filter(Boolean).join(' · '));
}
export function download(contents:string|Uint8Array,name:string,type:string) {
  const data = typeof contents === 'string' ? contents : new Uint8Array(contents).buffer;
  const url=URL.createObjectURL(new Blob([data],{type}));
  const anchor=document.createElement('a'); anchor.href=url; anchor.download=name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}

// Preserve original bytes when restoring the desk; reserialization could change its binding.
export function snapshotInputs(review:Review):Record<Role,string>{
  return Object.fromEntries((['O','C','N'] as const).map(role=>{
    const snapshot=review.snapshots[role];
    return [role,snapshot.rawUtf8?new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(new Uint8Array(snapshot.rawUtf8)):csvText(snapshot.headers,snapshot.rows)];
  })) as Record<Role,string>;
}
