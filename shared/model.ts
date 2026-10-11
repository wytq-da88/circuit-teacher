import { z } from 'zod';
import { COMPONENT_TYPES } from './types.ts';
import type { Circuit, CircuitComponent, Endpoint, Project, Lesson, ChangeMode, Proposal, Point } from './types.ts';

const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/,'标识只能包含字母、数字、下划线和连字符');
const coordinate=z.number().finite().min(-10000).max(10000);
const point=z.object({x:coordinate,y:coordinate});
const endpoint=z.object({componentId:id.optional(),pin:z.enum(['a','b','w']).optional(),junctionId:id.optional()}).refine(e=>e.componentId ? !!e.pin&&!e.junctionId : !!e.junctionId&&!e.pin,'端点必须指定一个元件引脚或连接点');
const component=z.object({id,type:z.enum(COMPONENT_TYPES),label:z.string().max(80),value:z.string().max(100),x:coordinate,y:coordinate,rotation:z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)]),closed:z.boolean().optional()});
export const circuitSchema=z.object({components:z.array(component).max(30,'最多支持30个元件'),junctions:z.array(point.extend({id})).max(120),wires:z.array(z.object({id,from:endpoint,to:endpoint,points:z.array(point).max(40)})).max(180)});
export const lessonSchema=z.object({steps:z.array(z.object({id,title:z.string().max(120),durationMs:z.number().int().min(500).max(120000),caption:z.string().max(1000),actions:z.array(z.object({type:z.enum(['highlight','flow','switch','lamp','label']),targetIds:z.array(id).max(200),enabled:z.boolean().optional(),text:z.string().max(500).optional(),reverse:z.boolean().optional()})).max(100)})).max(60)}).refine(l=>l.steps.reduce((n,s)=>n+s.durationMs,0)<=600000,'单个课件不超过10分钟');
export const uncertaintySchema=z.object({id,message:z.string().max(1000),targetIds:z.array(id).max(200),resolved:z.boolean()});
const projectSchema=z.object({schemaVersion:z.literal(1),id,title:z.string().min(1).max(120),revision:z.number().int().nonnegative(),createdAt:z.string().datetime({offset:true}),updatedAt:z.string().datetime({offset:true}),source:z.object({name:z.string().max(255),dataUrl:z.string().max(14*1024*1024).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/,'原图必须为PNG/JPG/WebP')}).optional(),circuit:circuitSchema,lesson:lessonSchema,uncertainties:z.array(uncertaintySchema).max(200),review:z.object({confirmed:z.boolean(),reviewedAt:z.string().optional()}),metrics:z.object({workMs:z.number().finite().nonnegative(),editCount:z.number().int().nonnegative()})});

export function validateCircuit(input:Circuit):string[]{
 const result=circuitSchema.safeParse(input);
 if(!result.success)return result.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`);
 const circuit=result.data, issues:string[]=[],allIds=new Set<string>();
 for(const item of [...circuit.components,...circuit.junctions,...circuit.wires]){if(allIds.has(item.id))issues.push(`标识重复：${item.id}`);allIds.add(item.id);}
 const keys=(e:Endpoint)=>e.componentId?`c:${e.componentId}:${e.pin}`:`j:${e.junctionId}`;
 for(const wire of circuit.wires){
  for(const e of [wire.from,wire.to]){
   if(e.componentId){const c=circuit.components.find(c=>c.id===e.componentId);if(!c)issues.push(`导线 ${wire.id} 的端点引用不存在的元件 ${e.componentId}`);else if(e.pin==='w'&&c.type!=='rheostat')issues.push(`元件 ${c.id} 没有 w 引脚`);}
   else if(!circuit.junctions.some(j=>j.id===e.junctionId))issues.push(`导线 ${wire.id} 引用不存在的连接点 ${e.junctionId}`);
  }
  if(keys(wire.from)===keys(wire.to))issues.push(`导线 ${wire.id} 的两个端点相同`);
 }
 return issues;
}
export function validateProject(input:unknown):Project{
 const result=projectSchema.safeParse(input);
 if(!result.success)throw new Error(`工程格式不正确：${result.error.issues.slice(0,5).map(e=>`${e.path.join('.')}: ${e.message}`).join('；')}`);
 const errors=validateCircuit(result.data.circuit);if(errors.length)throw new Error(errors.join('；'));
 return result.data as Project;
}
export function getLessonIssues(p:Project):string[]{
 const issues:string[]=[],stepIds=new Set<string>();
 const all=new Set([...p.circuit.components,...p.circuit.junctions,...p.circuit.wires].map(i=>i.id));
 for(const step of p.lesson.steps){
  if(stepIds.has(step.id))issues.push(`步骤标识重复：${step.id}`);stepIds.add(step.id);
  for(const a of step.actions){
   if(!a.targetIds.length&&a.type!=='label')issues.push(`「${step.title}」的${a.type}动作尚未选择对象`);
   for(const target of a.targetIds){
    if(!all.has(target)){issues.push(`「${step.title}」引用已不存在的对象 ${target}`);continue;}
    if(a.type==='flow'&&!p.circuit.wires.some(w=>w.id===target))issues.push(`「${step.title}」的电流路径必须选择导线：${target}`);
    if(a.type==='switch'&&!p.circuit.components.some(c=>c.id===target&&c.type==='switch'))issues.push(`「${step.title}」的开关动作不能用于 ${target}`);
    if(a.type==='lamp'&&!p.circuit.components.some(c=>c.id===target&&c.type==='lamp'))issues.push(`「${step.title}」的亮灯动作不能用于 ${target}`);
   }
  }
 }
 return [...new Set(issues)];
}
export function getExportIssues(p:Project):string[]{
 try{validateProject(p);}catch(e){return [(e as Error).message];}
 const errors=getLessonIssues(p);
 if(!p.review.confirmed)errors.unshift('请先完成电路校对并确认');
 for(const u of p.uncertainties)if(!u.resolved)errors.push(`待确认：${u.message}`);
 if(p.circuit.components.length===0)errors.push('请先添加电路元件');
 return errors;
}
export function touchProject(p:Project):Project{const next=structuredClone(p);next.revision++;next.updatedAt=new Date().toISOString();next.metrics.editCount++;return next;}
export function makeProposal(p:Project,candidate:Circuit|Lesson,mode:ChangeMode,summary:string):Proposal{
 const project=structuredClone(p),changes:string[]=[];
 if(mode==='lesson'){
  project.lesson=lessonSchema.parse(candidate);changes.push(`讲解步骤：${p.lesson.steps.length} → ${project.lesson.steps.length}`);
  for(const s of project.lesson.steps)if(JSON.stringify(p.lesson.steps.find(x=>x.id===s.id))!==JSON.stringify(s))changes.push(`更新步骤「${s.title}」`);
 }else{
  project.circuit=circuitSchema.parse(candidate);project.review={confirmed:false};
  const old=new Map(p.circuit.components.map(c=>[c.id,c]));const now=new Map(project.circuit.components.map(c=>[c.id,c]));
  for(const c of project.circuit.components){const prev=old.get(c.id);if(!prev)changes.push(`添加元件 ${c.label}`);else if(JSON.stringify(prev)!==JSON.stringify(c))changes.push(`修改元件 ${c.label}`);}
  for(const c of p.circuit.components)if(!now.has(c.id))changes.push(`移除元件 ${c.label}`);
  if(JSON.stringify(p.circuit.wires)!==JSON.stringify(project.circuit.wires))changes.push(`更新导线：${p.circuit.wires.length} → ${project.circuit.wires.length}`);
  if(JSON.stringify(p.circuit.junctions)!==JSON.stringify(project.circuit.junctions))changes.push('更新连接点');
 }
 return {baseRevision:p.revision,project:validateProject(project),summary:summary.slice(0,1500),changes:changes.length?changes:['没有改变当前内容']};
}
export function applyProposal(p:Project,proposal:Proposal):Project{
 if(proposal.baseRevision!==p.revision||proposal.project.id!==p.id)throw new Error('工程版本已变化，请重新生成修改建议');
 const checked=validateProject(proposal.project);checked.revision=p.revision;checked.metrics=p.metrics;checked.createdAt=p.createdAt;return touchProject(checked);
}
// Standalone functions below are also embedded in the offline player/video renderer.
export function pinPosition(c:CircuitComponent,pin:string):Point{
 const x=pin==='a'?-50:pin==='b'?50:0,y=pin==='w'?-40:0,rad=c.rotation*Math.PI/180;
 return {x:c.x+Math.round(x*Math.cos(rad)-y*Math.sin(rad)),y:c.y+Math.round(x*Math.sin(rad)+y*Math.cos(rad))};
}
export function endpointPosition(c:Circuit,e:Endpoint):Point{
 if(e.componentId){const item=c.components.find(c=>c.id===e.componentId);if(item&&e.pin)return pinPosition(item,e.pin);}
 const j=c.junctions.find(j=>j.id===e.junctionId);if(j)return {x:j.x,y:j.y};throw new Error('找不到导线端点');
}
export function analyzeFlow(circuit:Circuit,wireIds:string[],switchStates:Record<string,boolean>={}):{activeWireIds:string[];activeComponentIds:string[];directions:Record<string,boolean>;issue:string|null}{
 const active=new Set<string>(),components=new Set<string>(),directions:Record<string,boolean>=Object.create(null);
 const result=(issue:string|null)=>({activeWireIds:[...active],activeComponentIds:[...components],directions,issue});
 const batteries=circuit.components.filter(c=>c.type==='battery');
 if(batteries.length!==1)return result('电流方向示意目前需要且只支持一个直流电源');
 const target=new Set(wireIds);if(!target.size)return result('请选择电流路径导线');
 if(wireIds.some(id=>!circuit.wires.some(w=>w.id===id)))return result('电流路径引用不存在的导线');
 type Edge={to:string;wire?:string;component?:string;forward:boolean};
 const graph=new Map<string,Edge[]>();
 const key=(e:Endpoint)=>e.componentId?`c:${e.componentId}:${e.pin}`:`j:${e.junctionId}`;
 const add=(a:string,b:string,wire?:string,component?:string)=>{if(!graph.has(a))graph.set(a,[]);if(!graph.has(b))graph.set(b,[]);graph.get(a)!.push({to:b,wire,component,forward:true});graph.get(b)!.push({to:a,wire,component,forward:false});};
 for(const w of circuit.wires)if(target.has(w.id))add(key(w.from),key(w.to),w.id);
 for(const c of circuit.components){
  const closed=Object.hasOwn(switchStates,c.id)?switchStates[c.id]:(c.closed??false);
  if(c.type==='battery'||c.type==='voltmeter'||(c.type==='switch'&&!closed))continue;
  add(`c:${c.id}:a`,`c:${c.id}:b`,undefined,c.id);
  if(c.type==='rheostat'){add(`c:${c.id}:a`,`c:${c.id}:w`,undefined,c.id);add(`c:${c.id}:w`,`c:${c.id}:b`,undefined,c.id);}
 }
 const start=`c:${batteries[0].id}:a`,end=`c:${batteries[0].id}:b`,seen=new Set([start]);
 const path:Edge[]=[];let visits=0,limited=false;
 function dfs(at:string):void{
  if(++visits>20000){limited=true;return;}
  if(at===end){for(const edge of path){if(edge.wire){active.add(edge.wire);if(directions[edge.wire]===undefined)directions[edge.wire]=edge.forward;}if(edge.component)components.add(edge.component);}return;}
  for(const edge of graph.get(at)||[]){if(seen.has(edge.to))continue;seen.add(edge.to);path.push(edge);dfs(edge.to);path.pop();seen.delete(edge.to);if(limited||active.size===target.size)return;}
 }
 dfs(start);
 if(limited)return result('电路路径过于复杂，请将电流示意拆分为单独支路');
 if(!active.size)return result('电源两端没有闭合通路，请检查断开的开关和导线');
 if(active.size!==target.size)return result('部分导线不在闭合通路中，仅演示可连通支路');
 return result(null);
}
export function flowPathIssue(c:Circuit,ids:string[],switchStates:Record<string,boolean>={}):string|null{return analyzeFlow(c,ids,switchStates).issue;}
