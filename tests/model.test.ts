import { describe,it,expect } from 'vitest';
import { createExample } from '../shared/examples';
import { validateProject,validateCircuit,getLessonIssues,getExportIssues,makeProposal,applyProposal,touchProject,pinPosition,flowPathIssue,analyzeFlow } from '../shared/model';

describe('editable circuit document and graph semantics',()=>{
 it('all teaching examples are valid, confirmed, and independently editable',()=>{
  for(const kind of ['series','parallel','switch'] as const){const p=createExample(kind); expect(validateProject(p).id).toBe(p.id);expect(getExportIssues(p)).toEqual([]);expect(createExample(kind).id).not.toBe(p.id);}
 });
 it('rejects dangling terminals and duplicate component IDs',()=>{
  const p=createExample('series');p.circuit.wires[0].from={componentId:'missing',pin:'a'};expect(validateCircuit(p.circuit).join(' ')).toMatch(/端点|引脚|元件/);
  expect(()=>validateProject(p)).toThrow();p.circuit.components.push(p.circuit.components[0]);expect(validateCircuit(p.circuit).join(' ')).toMatch(/重复/);
 });
 it('does not infer connections at geometric wire crossings',()=>{
  const p=createExample('series');const original=structuredClone(p.circuit.wires.map(w=>[w.from,w.to]));p.circuit.wires.forEach(w=>w.points=[{x:500,y:400}]);expect(validateCircuit(p.circuit)).toEqual([]);expect(p.circuit.junctions).toEqual([]);expect(p.circuit.wires.map(w=>[w.from,w.to])).toEqual(original);
 });
 it('keeps lesson edits from changing the electric graph and rejects stale proposals',()=>{
  const p=createExample('series');const lesson=structuredClone(p.lesson);lesson.steps[0].caption='先看电源';const proposal=makeProposal(p,lesson,'lesson','修改字幕');const next=applyProposal(p,proposal);
  expect(next.circuit).toEqual(p.circuit);expect(next.lesson.steps[0].caption).toBe('先看电源');expect(next.revision).toBe(p.revision+1);expect(p.lesson).not.toEqual(lesson);expect(()=>applyProposal(touchProject(p),proposal)).toThrow(/版本/);
 });
 it('flags obsolete animation references after circuit removal instead of silently dropping them',()=>{
  const p=createExample('series');p.lesson.steps[0].actions=[{type:'highlight',targetIds:['lost-wire']}];expect(getLessonIssues(p).join()).toContain('lost-wire');expect(getExportIssues(p).length).toBeGreaterThan(0);expect(()=>validateProject(p)).not.toThrow();
 });
 it('blocks unreviewed images and unresolved ambiguities from final exports',()=>{
  const p=createExample('series');p.review.confirmed=false;expect(getExportIssues(p).join()).toMatch(/校对/);p.review.confirmed=true;p.uncertainties=[{id:'u1',message:'交点不清楚',targetIds:[],resolved:false}];expect(getExportIssues(p).join()).toContain('交点不清楚');
 });
 it('rotates pins around component center without moving the component',()=>{
  const c=createExample('series').circuit.components[0];c.x=100;c.y=100;c.rotation=90;expect(pinPosition(c,'a')).toEqual({x:100,y:50});expect(pinPosition(c,'b')).toEqual({x:100,y:150});
 });
 it('only enables flow on a complete conducting path and rejects dead branches',()=>{
  const p=createExample('series');const ids=p.circuit.wires.map(w=>w.id);expect(flowPathIssue(p.circuit,ids)).toBeNull();const s=p.circuit.components.find(c=>c.type==='switch')!;s.closed=false;expect(flowPathIssue(p.circuit,ids)).toMatch(/断开|闭合|通路/);expect(flowPathIssue(p.circuit,ids,{[s.id]:true})).toBeNull();
  p.circuit.junctions.push({id:'loose',x:900,y:90});p.circuit.wires.push({id:'dead',from:{componentId:s.id,pin:'a'},to:{junctionId:'loose'},points:[]});expect(flowPathIssue(p.circuit,[...ids,'dead'],{[s.id]:true})).not.toBeNull();
 });
 it('rejects excessive graphs, invalid source and arbitrary action types',()=>{
  const p=createExample('series');p.circuit.components=Array.from({length:31},(_,i)=>({...p.circuit.components[0],id:'c'+i}));expect(()=>validateProject(p)).toThrow();
  const q:any=createExample('series');q.source={name:'x',dataUrl:'javascript:alert(1)'};expect(()=>validateProject(q)).toThrow();delete q.source;q.lesson.steps[0].actions=[{type:'eval',targetIds:[],text:'alert(1)'}];expect(()=>validateProject(q)).toThrow();
 });
 it('does not mistake Object prototype keys for enabled switches',()=>{
  const p=createExample('switch');const sw=p.circuit.components.find(c=>c.type==='switch')!;const old=sw.id;sw.id='constructor';
  for(const w of p.circuit.wires)for(const ep of [w.from,w.to])if(ep.componentId===old)ep.componentId=sw.id;
  expect(analyzeFlow(p.circuit,p.circuit.wires.map(w=>w.id)).activeWireIds).toEqual([]);
 });
 it('preserves current in the remaining branch when a parallel branch opens',()=>{
  const p=createExample('parallel');
  p.circuit.components.push({id:'branchSwitch',type:'switch',label:'支路开关',value:'',x:430,y:470,rotation:0,closed:false});
  const w=p.circuit.wires.find(w=>w.id==='w4')!;const end=w.to;w.to={componentId:'branchSwitch',pin:'a'};
  p.circuit.wires.push({id:'branch-link',from:{componentId:'branchSwitch',pin:'b'},to:end,points:[]});
  const state=analyzeFlow(p.circuit,p.circuit.wires.map(w=>w.id));
  expect(state.activeComponentIds).toContain('lamp1');expect(state.activeComponentIds).not.toContain('lamp2');expect(state.activeWireIds).toContain('w2');expect(state.activeWireIds).not.toContain('w4');
 });
});
