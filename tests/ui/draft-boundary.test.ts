import {describe,it,expect,vi} from 'vitest';
import {DraftBoundary} from '../../src/ui/draftBoundary';

describe('desk draft replacement boundary',()=>{
  it.each(['file','text','policy','example'])('canceled %s replacement preserves the entire desk and dirty tracking',()=>{
    const drafts=new DraftBoundary();drafts.mark('hidden-card',true);drafts.mark('editor',true);
    const desk={inputs:{C:'original'},review:{revision:3},drafts:{reason:'pending',value:''},saved:true};
    const before=structuredClone(desk);const confirm=vi.fn(()=>false);
    if(drafts.allow(confirm)){drafts.clear();desk.inputs.C='replacement';desk.review.revision=0;desk.saved=false;}
    expect(desk).toEqual(before);expect(drafts.has('hidden-card')).toBe(true);expect(drafts.has('editor')).toBe(true);expect(confirm).toHaveBeenCalledOnce();
  });
  it('accepted replacement clears the old desk once, then does not repeatedly prompt',()=>{
    const drafts=new DraftBoundary();drafts.mark('card',true);const confirm=vi.fn(()=>true);
    if(drafts.allow(confirm))drafts.clear();
    expect(drafts.allow(confirm)).toBe(true);expect(confirm).toHaveBeenCalledOnce();
  });
  it('retarget cancellation retains the editor; accepted clear leaves other review drafts guarded',()=>{
    const drafts=new DraftBoundary();drafts.mark('editor',true);drafts.mark('card',true);
    expect(drafts.allow(()=>false,'editor')).toBe(false);expect(drafts.has('editor')).toBe(true);
    if(drafts.allow(()=>true,'editor'))drafts.mark('editor',false);
    expect(drafts.has('editor')).toBe(false);expect(drafts.has()).toBe(true);
  });
  it('canceling or saving the last review draft removes the need to confirm',()=>{
    const drafts=new DraftBoundary();drafts.mark('card',true);drafts.mark('card',false);
    const confirm=vi.fn(()=>false);expect(drafts.allow(confirm)).toBe(true);expect(confirm).not.toHaveBeenCalled();
  });
});
