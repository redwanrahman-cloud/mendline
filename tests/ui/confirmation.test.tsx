import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import ConfirmationDialog from '../../src/ui/ConfirmationDialog';
import {ConfirmationGate} from '../../src/ui/confirmationGate';
import {DraftBoundary} from '../../src/ui/draftBoundary';

describe('visible confirmation boundary',()=>{
  it('renders an explicitly labelled dialog with separate cancel and restore controls',()=>{
    const html=renderToStaticMarkup(<ConfirmationDialog message="Replace saved inputs; discard drafts" accept="Restore inputs" settle={()=>{}}/>);
    expect(html).toContain('<dialog');expect(html).toContain('aria-labelledby="confirmation-title"');
    expect(html).toContain('aria-describedby="confirmation-message"');expect(html).toContain('Cancel — keep current desk');expect(html).toContain('Restore inputs');
  });
  it.each([false,true])('does not mutate before choice; acceptance %s controls replacement',async accepted=>{
    const gate=new ConfirmationGate();let choose!:(yes:boolean)=>void;
    const desk={input:'original',history:['immutable'],draft:'pending'};
    const action=gate.request(()=>true,callback=>{choose=callback;}).then(ok=>{if(ok){desk.history.push(desk.input);desk.input='restored';desk.draft='';}});
    expect(desk).toEqual({input:'original',history:['immutable'],draft:'pending'});
    choose(accepted);await action;
    expect(desk).toEqual(accepted?{input:'restored',history:['immutable','original'],draft:''}:{input:'original',history:['immutable'],draft:'pending'});
  });
  it.each(['epoch','revision','ticket'] as const)('rejects async completion when original %s changes while choosing',async field=>{
    const gate=new ConfirmationGate();const current={epoch:1,revision:2,ticket:3};const original={...current};let choose!:(yes:boolean)=>void;
    const mutate=vi.fn();const action=gate.request(()=>Object.keys(original).every(k=>current[k as keyof typeof current]===original[k as keyof typeof current]),cb=>{choose=cb;}).then(ok=>{if(ok)mutate();});
    current[field]++;choose(true);await action;expect(mutate).not.toHaveBeenCalled();
  });
  it('blocks duplicates and ignores callbacks from an already canceled dialog',async()=>{
    const gate=new ConfirmationGate();let first!:(yes:boolean)=>void;let second!:(yes:boolean)=>void;
    const a=gate.request(()=>true,cb=>{first=cb;});const show=vi.fn();
    expect(await gate.request(()=>true,show)).toBe(false);expect(show).not.toHaveBeenCalled();
    first(false);expect(await a).toBe(false);
    const b=gate.request(()=>true,cb=>{second=cb;});first(true);expect(gate.pending).toBe(true);
    second(false);expect(await b).toBe(false);
  });
  it('accepted discard clears guards once, without another dialog for subsequent typing',async()=>{
    const gate=new ConfirmationGate();const drafts=new DraftBoundary();drafts.mark('editor',true);let choose!:(yes:boolean)=>void;
    const shown=vi.fn((cb:(yes:boolean)=>void)=>{choose=cb;});
    const first=gate.request(()=>true,shown);choose(true);if(await first)drafts.clear();
    if(drafts.has())await gate.request(()=>true,shown);
    expect(drafts.has()).toBe(false);expect(shown).toHaveBeenCalledOnce();
  });
  it('unmount cancellation rejects pending work',async()=>{
    const gate=new ConfirmationGate();const pending=gate.request(()=>true,()=>{});gate.cancel();expect(await pending).toBe(false);expect(gate.pending).toBe(false);
  });
});
