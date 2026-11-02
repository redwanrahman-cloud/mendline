import {restoreCheckpoint} from './journey';

export type GuidedChoice=Readonly<{kind:'restore'|'own'|'exit';context:string;source:string}>;
/** Exact pending ticket and source binding; consuming cancel never authorizes work. */
export class GuidedChoiceGate {
 private active:GuidedChoice|null=null;
 get pending(){return this.active!==null;}
 begin(kind:GuidedChoice['kind'],context:string,source:string):GuidedChoice|null {
  if(this.active)return null;
  if(kind==='restore')restoreCheckpoint(source);
  return this.active=Object.freeze({kind,context,source});
 }
 settle(choice:GuidedChoice,accepted:boolean,context:string):GuidedChoice|null {
  if(choice!==this.active)return null;
  this.active=null;
  if(!accepted||choice.context!==context)return null;
  return choice;
 }
 cancel(){this.active=null;}
}
