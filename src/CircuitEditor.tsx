import {useEffect,useMemo,useState} from 'react';
import {ReactFlow,Background,Controls,Handle,Position,ConnectionMode,BaseEdge,useNodesState,ReactFlowProvider,useReactFlow,type NodeProps,type EdgeProps,type Node,type Edge,type Connection} from '@xyflow/react';
import {CirclePlus,RotateCw,Trash2,MousePointer2,Dot} from 'lucide-react';
import type {Circuit, CircuitComponent,ComponentType,Endpoint,Point,Project} from '../shared/types';
import {endpointPosition,pinPosition} from '../shared/model';
import {Symbol,componentNames} from './Symbol';
import {uid} from './api';
export type Selection={kind:'component'|'junction'|'wire';id:string}|null;
export type Edit=(fn:(draft:Project)=>void,circuitChanged?:boolean)=>void;
type SymbolData={component:CircuitComponent;[key:string]:unknown};
const center={x:60,y:48};
function CircuitNode({data,selected}:NodeProps<Node<SymbolData>>) {
 const component=data.component;
 return <div className={`circuit-node ${selected?'node-selected':''}`}>
  <div className="symbol-wrap" style={{transform:`rotate(${component.rotation}deg)`}}><Symbol type={component.type} closed={component.closed} size={106}/></div>
  <div className="component-label">{component.label}<span>{component.value}</span></div>
  {(['a','b',...(component.type==='rheostat'?['w']:[])] as ('a'|'b'|'w')[]).map(pin=>{const p=pinPosition(component,pin);const dx=p.x-component.x,dy=p.y-component.y;return <Handle title={`连接 ${component.label} 的 ${pin} 端`} key={pin} id={pin} type="source" position={Math.abs(dx)>Math.abs(dy)?(dx<0?Position.Left:Position.Right):(dy<0?Position.Top:Position.Bottom)} style={{left:center.x+dx,top:center.y+dy,transform:'translate(-50%, -50%)',right:'auto',bottom:'auto'}}/>;})}
 </div>;
}
function JunctionNode({selected}:NodeProps) {return <div className={`junction-node ${selected?'node-selected':''}`}><Handle type="source" id="j" position={Position.Top} style={{left:8,top:8,transform:'translate(-50%,-50%)'}}/></div>;}
function CircuitWire({id,data,selected}:EdgeProps) {
 const pts=data?.points as Point[]|undefined;
 if(!pts?.length)return null;
 const path=pts.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');
 return <><BaseEdge id={id} path={path} style={{stroke:selected?'#d28338':'#31564c',strokeWidth:selected?3.3:2.5}}/>{selected&&pts.slice(1,-1).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="5" fill="#fff" stroke="#d28338" strokeWidth="2" pointerEvents="none"/>)}</>;
}
const nodeTypes={component:CircuitNode,junction:JunctionNode};
const edgeTypes={wire:CircuitWire};
function endpointNode(ep:Endpoint){return ep.componentId||`junction-${ep.junctionId}`;}
function asEndpoint(node:string,handle:string|null|undefined):Endpoint{return node.startsWith('junction-')?{junctionId:node.slice(9)}:{componentId:node,pin:(handle||'a') as 'a'|'b'|'w'};}
function EditorInner({circuit,edit,selection,onSelect}:{circuit:Circuit;edit:Edit;selection:Selection;onSelect:(s:Selection)=>void}) {
 const [nodes,setNodes,onNodesChange]=useNodesState<Node>([]);
 const {screenToFlowPosition}=useReactFlow();
 useEffect(()=>{setNodes([
  ...circuit.components.map(component=>({id:component.id,type:'component',position:{x:component.x-center.x,y:component.y-center.y},data:{component},selected:selection?.id===component.id,width:120,height:96})),
  ...circuit.junctions.map(j=>({id:`junction-${j.id}`,type:'junction',position:{x:j.x-8,y:j.y-8},data:{},selected:selection?.id===j.id,width:16,height:16}))
 ]);},[circuit,selection,setNodes]);
 const edges:Edge[]=useMemo(()=>circuit.wires.flatMap(wire=>{
  try{return [{id:wire.id,type:'wire',source:endpointNode(wire.from),target:endpointNode(wire.to),sourceHandle:wire.from.pin||'j',targetHandle:wire.to.pin||'j',data:{points:[endpointPosition(circuit,wire.from),...wire.points,endpointPosition(circuit,wire.to)]},selected:selection?.id===wire.id}];}catch{return [];}
 }),[circuit,selection]);
 function connect(c:Connection){if(!c.source||!c.target)return;edit(p=>{p.circuit.wires.push({id:uid('wire'),from:asEndpoint(c.source,c.sourceHandle),to:asEndpoint(c.target,c.targetHandle),points:[]});},true);}
 return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onConnect={connect} connectionMode={ConnectionMode.Loose} fitView fitViewOptions={{padding:.22,minZoom:.5,maxZoom:1}} minZoom={.25} maxZoom={2} defaultEdgeOptions={{type:'wire'}} deleteKeyCode={null} nodesConnectable snapToGrid snapGrid={[10,10]} proOptions={{hideAttribution:true}} onNodeClick={(_,node)=>onSelect({kind:node.type==='junction'?'junction':'component',id:node.type==='junction'?node.id.slice(9):node.id})} onEdgeClick={(_,edge)=>onSelect({kind:'wire',id:edge.id})} onPaneClick={()=>onSelect(null)} onNodeDragStop={(_,node)=>edit(p=>{if(node.type==='junction'){const j=p.circuit.junctions.find(j=>`junction-${j.id}`===node.id);if(j){j.x=Math.max(16,Math.min(1264,node.position.x+8));j.y=Math.max(16,Math.min(620,node.position.y+8));}}else{const c=p.circuit.components.find(c=>c.id===node.id);if(c){c.x=Math.max(60,Math.min(1220,node.position.x+center.x));c.y=Math.max(60,Math.min(580,node.position.y+center.y));}}},true)} onEdgeDoubleClick={(event,edge)=>{const p=screenToFlowPosition({x:event.clientX,y:event.clientY});edit(draft=>{draft.circuit.wires.find(w=>w.id===edge.id)?.points.push({x:Math.round(p.x/10)*10,y:Math.round(p.y/10)*10});},true);}}>
  <Background color="#dce3db" gap={20} size={1.3}/><Controls showInteractive={false}/><div className="canvas-note"><MousePointer2 size={13}/> 拖动元件 · 端点连线 · 双击导线加折点</div>
 </ReactFlow>;
}
export function CircuitEditor(props:{circuit:Circuit;edit:Edit;selection:Selection;onSelect:(s:Selection)=>void}) {return <ReactFlowProvider><EditorInner {...props}/></ReactFlowProvider>;}
export function Toolbox({edit,onSelect}:{edit:Edit;onSelect:(s:Selection)=>void}) {
 const [open,setOpen]=useState(false);
 function add(type:ComponentType){const id=uid(type);edit(p=>{p.circuit.components.push({id,type,label:`${({battery:'E',switch:'S',resistor:'R',rheostat:'R',lamp:'L',ammeter:'A',voltmeter:'V'}[type])}${p.circuit.components.filter(c=>c.type===type).length+1}`,value:'',x:500+(p.circuit.components.length%5)*30,y:180+(p.circuit.components.length%4)*40,rotation:0,...(type==='switch'?{closed:false}:{})});},true);onSelect({kind:'component',id});setOpen(false);}
 return <div className="toolbox"><button className={`tool-button ${open?'active':''}`} onClick={()=>setOpen(!open)}><CirclePlus size={16}/> 添加元件</button><button className="tool-button" onClick={()=>{const id=uid('j');edit(p=>{p.circuit.junctions.push({id,x:640,y:360});},true);onSelect({kind:'junction',id});}}><Dot size={21}/> 接点</button>{open&&<div className="component-menu">{(Object.keys(componentNames) as ComponentType[]).map(type=><button key={type} onClick={()=>add(type)}><Symbol type={type} size={45}/><span>{componentNames[type]}</span></button>)}</div>}</div>;
}
export function Inspector({project,selection,edit,onSelect}:{project:Project;selection:Selection;edit:Edit;onSelect:(s:Selection)=>void}) {
 if(!selection)return <div className="inspector-empty"><MousePointer2 size={18}/><span>选择元件、接点或导线<br/>编辑参数与连接位置</span></div>;
 const c=project.circuit.components.find(c=>c.id===selection.id);
 const w=project.circuit.wires.find(w=>w.id===selection.id);
 const j=project.circuit.junctions.find(j=>j.id===selection.id);
 const update=(key:string,value:unknown)=>edit(p=>{const target=selection.kind==='component'?p.circuit.components.find(c=>c.id===selection.id):p.circuit.junctions.find(j=>j.id===selection.id);if(target)Object.assign(target,{[key]:value});},true);
 function remove(){edit(p=>{p.circuit.components=p.circuit.components.filter(c=>c.id!==selection!.id);p.circuit.junctions=p.circuit.junctions.filter(j=>j.id!==selection!.id);p.circuit.wires=p.circuit.wires.filter(w=>w.id!==selection!.id&&w.from.componentId!==selection!.id&&w.to.componentId!==selection!.id&&w.from.junctionId!==selection!.id&&w.to.junctionId!==selection!.id);},true);onSelect(null);}
 return <div className="inspector"><div className="section-head"><span>{c?componentNames[c.type]:w?'导线 / 折点':'连接点'}属性</span><button className="icon-button danger" title="删除所选对象" onClick={remove}><Trash2 size={15}/></button></div>
 {c&&<><div className="field-grid"><label>名称<input aria-label="元件名称" value={c.label} onChange={e=>update('label',e.target.value)}/></label><label>参数<input aria-label="元件参数" placeholder="如 10 Ω" value={c.value} onChange={e=>update('value',e.target.value)}/></label></div><div className="field-grid"><label>X 坐标<input type="number" value={c.x} onChange={e=>update('x',Number(e.target.value))}/></label><label>Y 坐标<input type="number" value={c.y} onChange={e=>update('y',Number(e.target.value))}/></label></div><div className="inline-actions"><button className="subtle-button" onClick={()=>update('rotation',(c.rotation+90)%360)}><RotateCw size={14}/> 旋转 90°</button>{c.type==='switch'&&<label className="check-label"><input type="checkbox" checked={!!c.closed} onChange={e=>update('closed',e.target.checked)}/> 初始闭合</label>}</div></>}
 {j&&<div className="field-grid"><label>X 坐标<input type="number" value={j.x} onChange={e=>update('x',Number(e.target.value))}/></label><label>Y 坐标<input type="number" value={j.y} onChange={e=>update('y',Number(e.target.value))}/></label></div>}
 {w&&<><p className="tiny muted">折点按列表顺序连接。交叉线不会自动形成接点。</p>{w.points.map((point,index)=><div className="bend-row" key={index}><span>{index+1}</span>{(['x','y'] as const).map(axis=><input key={axis} aria-label={`折点${index+1}${axis}`} type="number" value={point[axis]} onChange={e=>edit(p=>{const wire=p.circuit.wires.find(w=>w.id===selection.id);if(wire)wire.points[index][axis]=Number(e.target.value);},true)}/>)}<button className="icon-button" title="删除折点" onClick={()=>edit(p=>{p.circuit.wires.find(w=>w.id===selection.id)?.points.splice(index,1);},true)}><Trash2 size={13}/></button></div>)}<button className="subtle-button" onClick={()=>edit(p=>{const wire=p.circuit.wires.find(w=>w.id===selection.id);if(wire){const a=endpointPosition(p.circuit,wire.from),b=endpointPosition(p.circuit,wire.to);wire.points.push({x:Math.round((a.x+b.x)/2),y:Math.round((a.y+b.y)/2)});}},true)}><CirclePlus size={14}/> 添加折点</button></>}
 </div>;
}
