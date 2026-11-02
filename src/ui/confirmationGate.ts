/** One pending choice; cancellation and stale callbacks can never authorize mutation. */
export class ConfirmationGate {
  private active: ((accepted:boolean)=>void)|null=null;
  get pending(){return this.active!==null;}
  request(valid:()=>boolean,present:(settle:(accepted:boolean)=>void)=>void):Promise<boolean>{
    if(this.pending||!valid())return Promise.resolve(false);
    return new Promise(resolve=>{
      const settle=(accepted:boolean)=>{
        if(this.active!==settle)return;
        this.active=null;
        resolve(accepted&&valid());
      };
      this.active=settle;
      present(settle);
    });
  }
  cancel(){this.active?.(false);}
}
