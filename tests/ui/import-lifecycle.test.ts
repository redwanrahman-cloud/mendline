import {describe,it,expect} from 'vitest';
import {ImportLifecycle,settleImport} from '../../src/ui/importLifecycle';
import {ConfirmationGate} from '../../src/ui/confirmationGate';

describe('shared App import lifecycle',()=>{
  function desk(){
    const reads=new ImportLifecycle();let epoch=0;
    const values:Partial<Record<'O'|'C'|'N',string>>={};
    const apply=(role:'O'|'C'|'N',text:string,valid=reads.begin(role))=>{
      const original=epoch;
      return settleImport(valid,()=>epoch===original,false,async check=>check(),()=>{epoch++;values[role]=text;});
    };
    return {reads,values,apply};
  }
  it.each([['O','C','N'],['N','C','O'],['C','O','N']] as const)('keeps independent roles in completion order %s %s %s',async(a,b,c)=>{
    const d=desk();const tokens={O:d.reads.begin('O'),C:d.reads.begin('C'),N:d.reads.begin('N')};
    // Both continuations enter before either commits, matching resolved File reads.
    expect(await Promise.all([d.apply(a,a,tokens[a]),d.apply(b,b,tokens[b])])).toEqual([true,true]);
    expect(await d.apply(c,c,tokens[c])).toBe(true);
    expect(d.values).toEqual({O:'O',C:'C',N:'N'});
  });
  it('newer same-role selection wins even if the older read finishes last',async()=>{
    const d=desk();const old=d.reads.begin('C');const newer=d.reads.begin('C');
    expect(await d.apply('C','new',newer)).toBe(true);
    expect(await d.apply('C','old',old)).toBe(false);expect(d.values.C).toBe('new');
  });
  it('same-role typing supersedes an in-flight file',async()=>{
    const d=desk();const file=d.reads.begin('O');await d.apply('O','typed');
    expect(await d.apply('O','file',file)).toBe(false);expect(d.values.O).toBe('typed');
  });
  it.each(['desk replacement','policy','history restore','review revision'])('%s rejects every pending role',async()=>{
    const d=desk();const tokens={O:d.reads.begin('O'),C:d.reads.begin('C'),N:d.reads.begin('N')};
    d.reads.reset();for(const role of ['O','C','N'] as const)expect(await d.apply(role,'stale',tokens[role])).toBe(false);
    expect(d.values).toEqual({});
  });
  it.each(['cancel','desk','same role','reset','accept'] as const)('confirmation handles %s without stale mutation',async reason=>{
    const reads=new ImportLifecycle();const read=reads.begin('C');const gate=new ConfirmationGate();let current=true;let committed=false;let choose!:(yes:boolean)=>void;
    const pending=settleImport(read,()=>current,true,valid=>gate.request(valid,cb=>{choose=cb;}),()=>{committed=true;});
    expect(committed).toBe(false);
    if(reason==='desk')current=false;if(reason==='same role')reads.begin('C');if(reason==='reset')reads.reset();
    choose(reason!=='cancel');expect(await pending).toBe(reason==='accept');expect(committed).toBe(reason==='accept');
  });
});
