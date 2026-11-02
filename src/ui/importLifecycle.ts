/** Role reads survive other role commits, but never supersession or desk replacement. */
export class ImportLifecycle {
  private epoch=0;
  private tickets={O:0,C:0,N:0};
  begin(role:'O'|'C'|'N'){
    const epoch=this.epoch;
    const ticket=++this.tickets[role];
    return ()=>epoch===this.epoch&&ticket===this.tickets[role];
  }
  reset(){this.epoch++;}
}

/** Bind a real discard choice to its desk; an unprompted independent import can settle. */
export async function settleImport(readValid:()=>boolean,deskValid:()=>boolean,needsChoice:boolean,allow:(valid:()=>boolean)=>Promise<boolean>,commit:()=>void){
  const valid=()=>readValid()&&(!needsChoice||deskValid());
  if(!await allow(valid)||!valid())return false;
  commit();
  return true;
}
