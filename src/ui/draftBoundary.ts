/** Synchronous desk-level draft tracking, including cards hidden by filters. */
export class DraftBoundary {
  private dirty = new Set<string>();
  mark(id:string, dirty:boolean){if(dirty)this.dirty.add(id);else this.dirty.delete(id);}
  clear(){this.dirty.clear();}
  has(id?:string){return id === undefined ? this.dirty.size > 0 : this.dirty.has(id);}
  allow(confirm:()=>boolean, id?:string){return !this.has(id) || confirm();}
}
