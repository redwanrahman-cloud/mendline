import {api, unwrap, type Review, type Role} from './adapter';
export const uniqueHistories=(histories:string[])=>[...new Set(histories)];
// Validate before mutation; never replay decisions onto independently changed inputs.
export function restoreGeneration(data:any,reviewed:boolean):Review|null {
  const roles:Role[]=['O','C','N'];
  if(data?.version!==1||!roles.every(r=>typeof data.inputs?.[r]==='string')||typeof data.policy?.keyColumn!=='string'||!Array.isArray(data.policy.identityColumns)||!data.policy.identityColumns.every((x:unknown)=>typeof x==='string')||typeof data.policy.assumptionReason!=='string'||typeof data.policy.assumptionConfirmed!=='boolean'||(data.archives!==undefined&&(!Array.isArray(data.archives)||!data.archives.every((x:unknown)=>typeof x==='string'))))throw new Error('Recovery copy is invalid. Current desk was not changed.');
  if(!reviewed)return null;
  if(typeof data.history!=='string')throw new Error('No reviewed generation was saved. Use Restore inputs.');
  const restored=unwrap(api.importHistory(data.history));
  const snapshots=roles.map(r=>unwrap(api.parseCsv(r,new TextEncoder().encode(data.inputs[r]))));
  const base=unwrap(api.reconcile(snapshots[0],snapshots[1],snapshots[2],data.policy));
  if(base.binding.generationHash!==restored.binding.generationHash)throw new Error('Saved inputs or policy do not match the reviewed generation. Current desk was not changed.');
  return restored;
}
