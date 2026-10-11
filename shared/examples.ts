import type { Circuit, CircuitComponent, Endpoint, LessonStep, Project, Wire } from './types';
export type ExampleKind='series'|'parallel'|'switch';
export const exampleCards=[
 {id:'series',kind:'series',title:'串联电路',description:'一条通路，观察两个灯泡与开关的关系',tag:'入门 · 3 步',color:'#c67742'},
 {id:'parallel',kind:'parallel',title:'并联电路',description:'两条支路，理解电流的分流与汇合',tag:'进阶 · 3 步',color:'#408978'},
 {id:'switch',kind:'switch',title:'开关控制',description:'断开与闭合，对比灯泡的两种状态',tag:'实验 · 3 步',color:'#6686b5'},
] as const;
export function createExample(kind:ExampleKind='series'):Project{
 const now=new Date().toISOString();
 const c=(id:string,type:CircuitComponent['type'],label:string,x:number,y:number,closed?:boolean):CircuitComponent=>({id,type,label,value:type==='battery'?'3 V':'',x,y,rotation:0,...(closed===undefined?{}:{closed})});
 const ep=(componentId:string,pin:'a'|'b'):Endpoint=>({componentId,pin});
 const wire=(id:string,from:Endpoint,to:Endpoint,points:{x:number;y:number}[]=[]):Wire=>({id,from,to,points});
 let circuit:Circuit;
 if(kind==='parallel'){
  circuit={components:[c('battery1','battery','电源 E',580,160),c('switch1','switch','总开关 S',870,160,true),c('lamp1','lamp','灯泡 L₁',640,330),c('lamp2','lamp','灯泡 L₂',640,470)],junctions:[{id:'j-left',x:300,y:330},{id:'j-right',x:1030,y:330}],wires:[
   wire('w1',ep('battery1','a'),{junctionId:'j-left'},[{x:300,y:160}]),wire('w2',{junctionId:'j-left'},ep('lamp1','a')),wire('w3',ep('lamp1','b'),{junctionId:'j-right'}),
   wire('w4',{junctionId:'j-left'},ep('lamp2','a'),[{x:300,y:470}]),wire('w5',ep('lamp2','b'),{junctionId:'j-right'},[{x:1030,y:470}]),wire('w6',{junctionId:'j-right'},ep('switch1','b'),[{x:1030,y:160}]),wire('w7',ep('switch1','a'),ep('battery1','b'))]};
 }else{
  const lamps=kind==='series'?[c('lamp1','lamp','灯泡 L₁',460,425),c('lamp2','lamp','灯泡 L₂',800,425)]:[c('lamp1','lamp','灯泡 L',640,425)];
  circuit={components:[c('battery1','battery','电源 E',430,205),c('switch1','switch','开关 S',810,205,kind!=='switch'),...lamps],junctions:[],wires:[
   wire('w1',ep('battery1','a'),ep('lamp1','a'),[{x:260,y:205},{x:260,y:425}]),
   ...(kind==='series'?[wire('w2',ep('lamp1','b'),ep('lamp2','a')),wire('w3',ep('lamp2','b'),ep('switch1','b'),[{x:1020,y:425},{x:1020,y:205}])]:[wire('w2',ep('lamp1','b'),ep('switch1','b'),[{x:1020,y:425},{x:1020,y:205}])]),
   wire('w-last',ep('switch1','a'),ep('battery1','b'))]};
 }
 const allWires=circuit.wires.map(w=>w.id),allLamps=circuit.components.filter(c=>c.type==='lamp').map(c=>c.id);
 const steps:LessonStep[]=kind==='switch'?[
  {id:'step1',title:'观察断路',durationMs:3500,caption:'开关断开时，电路没有形成闭合通路，灯泡不亮。',actions:[{type:'highlight',targetIds:['switch1']},{type:'switch',targetIds:['switch1'],enabled:false},{type:'flow',targetIds:allWires}]},
  {id:'step2',title:'闭合开关',durationMs:4500,caption:'闭合开关，形成通路。箭头示意传统电流方向。',actions:[{type:'switch',targetIds:['switch1'],enabled:true},{type:'flow',targetIds:allWires},{type:'lamp',targetIds:allLamps,enabled:true}]},
  {id:'step3',title:'再次断开',durationMs:3000,caption:'再断开开关，通路中断，灯泡熄灭。',actions:[{type:'switch',targetIds:['switch1'],enabled:false},{type:'flow',targetIds:allWires},{type:'lamp',targetIds:allLamps,enabled:false}]},
 ]:[
  {id:'step1',title:'认识电路',durationMs:3500,caption:kind==='parallel'?'两个灯泡分别接在不同支路上，这是一张并联电路图。':'电源、开关和两个灯泡依次连接，组成串联电路。',actions:[{type:'highlight',targetIds:['battery1','switch1',...allLamps]}]},
  {id:'step2',title:'追踪通路',durationMs:5000,caption:kind==='parallel'?'电流方向从电源正极出发，在连接处分流，经各支路汇合。':'闭合开关后，传统电流方向从正极经两个灯泡回到负极。',actions:[{type:'flow',targetIds:allWires},{type:'lamp',targetIds:allLamps,enabled:true}]},
  {id:'step3',title:'观察与思考',durationMs:3500,caption:kind==='parallel'?'两条支路共用电源。动画只表示通路，不表示电流大小。':'整个电路只有一条通路。动画仅作教学示意，不计算实际亮度。',actions:[{type:'flow',targetIds:allWires},{type:'highlight',targetIds:allLamps},{type:'lamp',targetIds:allLamps,enabled:true}]},
 ];
 return {schemaVersion:1,id:crypto.randomUUID(),title:exampleCards.find(e=>e.kind===kind)!.title+' · 教学示例',revision:0,createdAt:now,updatedAt:now,circuit,lesson:{steps},uncertainties:[],review:{confirmed:true,reviewedAt:now},metrics:{workMs:0,editCount:0}};
}
