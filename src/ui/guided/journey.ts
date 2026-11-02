import {api,unwrap,type Review} from '../adapter';
import {intentExample,teach} from '../ruleIntent';
import {laterIntentExport,retainedRules} from '../ruleReuse';
export {teach};
export const files={previous:intentExample.O,corrected:intentExample.C,updated:intentExample.N,later:laterIntentExport};
export function openExample(later=false):Review {
 const parse=(role:'O'|'C'|'N',text:string)=>unwrap(api.parseCsv(role,new TextEncoder().encode(text)));
 return unwrap(api.reconcile(parse('O',files.previous),parse('C',files.corrected),parse('N',later?files.later:files.updated),{keyColumn:'id',identityColumns:['identity'],assumptionConfirmed:true,assumptionReason:'User confirmed fictional id plus identity identify the same products; changed identity is excluded'}));
}
export function proposal(history:string){return retainedRules([history])[0];}
export function activeRule(review:Review){const rule=review.intelligence?.rules.find(r=>r.active);if(!rule)throw Error('Approve a rule first');return rule.ref;}
export function checkpoint(review:Review,archive:string|null){return JSON.stringify({schema:'mendline-guided/v1',history:api.exportHistory(review),archive});}
export function restoreCheckpoint(text:string){const p=JSON.parse(text);if(p.schema!=='mendline-guided/v1'||typeof p.history!=='string'||(p.archive!==null&&typeof p.archive!=='string'))throw Error('Not a guided checkpoint');const review=unwrap(api.importHistory(p.history));if(p.archive)proposal(p.archive);return {review,archive:p.archive as string|null};}
