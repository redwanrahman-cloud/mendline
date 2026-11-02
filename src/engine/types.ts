export type Role = 'O' | 'C' | 'N';
export interface EngineError {code:string;message:string;role?:Role;row?:number;column?:string;coordinates?:{row:number;column:string}[]}
export type Result<T> = {ok:true;value:T}|{ok:false;error:EngineError};
export interface Snapshot {id:string;rawSha256:string;contentSha256:string;headers:string[];rows:string[][];rawUtf8?:number[]}
export interface Policy {keyColumn:string;identityColumns:string[];assumptionConfirmed:boolean;assumptionReason:string}
export interface Binding {generationHash:string;inputHashes:Record<Role,string>;policyHash:string;expectedRevision:number}
export type Comparison = 'carry'|'upstream_fixed'|'conflict';
export type AssessmentState = Comparison|'orphan'|'identity_hold';
export interface Assessment {id:string;key:string;column:string;old:string;corrected:string;refreshed:string|null;state:AssessmentState;reason:string;comparison?:Comparison;resolved:boolean;outputValue:string|null}
export type Action = 'apply'|'keep_latest'|'replace'|'acknowledge_omission'|'retire'|'confirm_continuity';
export interface Choice {state:AssessmentState;resolved:boolean;outputValue:string|null;reason:string}
export interface ReviewEvent {id:string;eventId:string;revision:number;assessmentId:string;key:string;column:string;action:Action|'undo';reason:string;value?:string;timestamp:string;before:Choice;after:Choice;reverses?:string;invalidates?:string[]}
export interface ReviewState {intelligence?:import("../rules/intelligence").IntelligenceV1;binding:Binding;snapshots:Record<Role,Snapshot>;policy:Policy;assessments:Assessment[];events:ReviewEvent[];holds:string[]}
export interface ResolveRequest {binding:Binding;assessmentId:string;action:Action;reason?:string;value?:string}
export interface Preview {rows:string[][];headers:string[];changedCells:{key:string;column:string;before:string;after:string}[];holds:string[];counts:Record<AssessmentState,number>}
export interface ReviewedExport {csvUtf8:Uint8Array;historyJson:string;exportId:string;revision:number}
