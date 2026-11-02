import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import ConfirmationDialog from '../../src/ui/ConfirmationDialog';
import {GuidedChoiceGate} from '../../src/ui/guided/choice';
import {openExample,checkpoint,restoreCheckpoint} from '../../src/ui/guided/journey';
import {api} from '../../src/ui/adapter';

describe('guided modal choice contracts',()=>{
 it.each(['restore','own','exit'] as const)('canceling %s preserves review, archive, checkpoint and drafts',kind=>{
  const review=openExample(),source=checkpoint(review,null);
  const state={review,archive:null,source,draft:'unfinished correction'};
  const before=JSON.stringify(state),gate=new GuidedChoiceGate();
  const pending=gate.begin(kind,before,source)!;
  expect(JSON.stringify(state)).toBe(before);
  expect(gate.settle(pending,false,before)).toBeNull();
  expect(gate.settle(pending,true,before)).toBeNull();
  expect(JSON.stringify(state)).toBe(before);
 });
 it.each(['generation','revision','source','archive','draft'] as const)('rejects changed %s while restore is pending',field=>{
  const source=checkpoint(openExample(),null),gate=new GuidedChoiceGate();
  const state={generation:1,revision:1,source,archive:'',draft:''};
  const pending=gate.begin('restore',JSON.stringify(state),source)!;
  const changed={...state,[field]:field==='generation'||field==='revision'?2:'changed'};
  expect(gate.settle(pending,true,JSON.stringify(changed))).toBeNull();
 });
 it('validates actual engine history before presenting and reconstructs accepted source only',()=>{
  const gate=new GuidedChoiceGate(),review=openExample(),source=checkpoint(review,null);
  expect(()=>gate.begin('restore','current','{}')).toThrow();expect(gate.pending).toBe(false);
  const corrupt=JSON.stringify({schema:'mendline-guided/v1',history:'{}',archive:null});
  expect(()=>gate.begin('restore','current',corrupt)).toThrow();expect(gate.pending).toBe(false);
  const pending=gate.begin('restore','current',source)!;
  expect(gate.begin('exit','current','')).toBeNull();
  const accepted=gate.settle(pending,true,'current')!;
  expect(api.exportHistory(restoreCheckpoint(accepted.source).review)).toBe(api.exportHistory(review));
  expect(gate.settle(pending,true,'current')).toBeNull();
 });
 it('old callbacks and unmount cancellation cannot consume a newer choice',()=>{
  const gate=new GuidedChoiceGate(),a=gate.begin('exit','current','')!;
  gate.cancel();const b=gate.begin('own','current','')!;
  expect(gate.settle(a,true,'current')).toBeNull();expect(gate.pending).toBe(true);
  expect(gate.settle(b,false,'current')).toBeNull();expect(gate.pending).toBe(false);
 });
 it('renders the shared native dialog with guided labels',()=>{
  const html=renderToStaticMarkup(<ConfirmationDialog title="Restore checkpoint?" cancelLabel="Cancel and continue" message="Keep drafts on cancel" accept="Restore checkpoint" settle={()=>{}}/>);
  expect(html).toContain('<dialog');expect(html).toContain('Restore checkpoint?');expect(html).toContain('Cancel and continue');
 });
});
