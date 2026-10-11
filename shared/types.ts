export const COMPONENT_TYPES = ['battery','switch','resistor','rheostat','lamp','ammeter','voltmeter'] as const;
export type ComponentType = typeof COMPONENT_TYPES[number];
export interface Point { x:number; y:number }
export interface CircuitComponent { id:string; type:ComponentType; label:string; value:string; x:number; y:number; rotation:0|90|180|270; closed?:boolean }
// Component pins a,b; rheostat also w. Coordinates are center positions in a 1280x720 scene.
export interface Endpoint { componentId?:string; pin?:'a'|'b'|'w'; junctionId?:string }
export interface Junction extends Point { id:string }
export interface Wire { id:string; from:Endpoint; to:Endpoint; points:Point[] }
export interface Circuit { components:CircuitComponent[]; junctions:Junction[]; wires:Wire[] }
export type ActionType = 'highlight'|'flow'|'switch'|'lamp'|'label';
export interface LessonAction { type:ActionType; targetIds:string[]; enabled?:boolean; text?:string; reverse?:boolean }
export interface LessonStep { id:string; title:string; durationMs:number; caption:string; actions:LessonAction[] }
export interface Lesson { steps:LessonStep[] }
export interface Uncertainty { id:string; message:string; targetIds:string[]; resolved:boolean }
export interface Project {
  schemaVersion:1; id:string; title:string; revision:number; createdAt:string; updatedAt:string;
  source?:{ name:string; dataUrl:string };
  circuit:Circuit; lesson:Lesson; uncertainties:Uncertainty[];
  review:{ confirmed:boolean; reviewedAt?:string };
  metrics:{ workMs:number; editCount:number };
}
export type ChangeMode='circuit'|'lesson';
export interface Proposal { baseRevision:number; project:Project; summary:string; changes:string[]; usage?:Usage }
export interface Usage { promptTokens:number; completionTokens:number; totalTokens:number; model:string; at:string }
export interface ProviderSettings { baseUrl:string; model:string; apiKey?:string; hasKey?:boolean; timeoutMs:number }
export type ExportFormat='png'|'svg'|'pdf'|'html'|'mp4'|'json';
export interface ExportJob { id:string; status:'queued'|'running'|'completed'|'failed'; progress:number; format:ExportFormat; filename?:string; path?:string; downloadUrl?:string; error?:string }
export interface ProjectSummary { id:string; title:string; updatedAt:string; revision:number }
export interface RevisionSummary { revision:number; savedAt:string; title:string }
