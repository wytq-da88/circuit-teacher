import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import type { Project } from '../shared/types';
import { buildCompositionHtml, buildOfflineHtml, renderScene } from '../shared/scene';

export function exportFixture():Project {
  return {schemaVersion:1,id:'export-fixture',title:'开关闭合实验',revision:1,createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z',review:{confirmed:true},uncertainties:[],metrics:{workMs:0,editCount:0},
    circuit:{components:[{id:'b',type:'battery',label:'电源',value:'3 V',x:250,y:220,rotation:0},{id:'s',type:'switch',label:'开关',value:'',x:550,y:220,rotation:0,closed:false},{id:'l',type:'lamp',label:'灯泡',value:'',x:550,y:440,rotation:0}],junctions:[],wires:[{id:'w1',from:{componentId:'b',pin:'a'},to:{componentId:'l',pin:'a'},points:[{x:150,y:220},{x:150,y:440}]},{id:'w2',from:{componentId:'l',pin:'b'},to:{componentId:'s',pin:'b'},points:[{x:750,y:440},{x:750,y:220}]},{id:'w3',from:{componentId:'s',pin:'a'},to:{componentId:'b',pin:'b'},points:[]}]},
    lesson:{steps:[{id:'step1',title:'断开',durationMs:1000,caption:'开关断开',actions:[]},{id:'step2',title:'闭合',durationMs:1000,caption:'电流从正极流出',actions:[{type:'switch',targetIds:['s'],enabled:true},{type:'flow',targetIds:['w1','w2','w3'],enabled:true},{type:'lamp',targetIds:['l'],enabled:true}]},{id:'step3',title:'继续',durationMs:1000,caption:'状态累积',actions:[{type:'flow',targetIds:['w1','w2','w3'],enabled:true}]}]}};
}

describe('统一电路导出场景',()=>{
  it('视频声明事件驱动场景，hf-seek 更新字幕和开关状态',()=>{
    const p=exportFixture(),html=buildCompositionHtml(p);
    expect(/data-composition-id="circuit-lesson"[^>]*data-no-timeline/.test(html)).toBe(true);
    const handlers:Record<string,(event:{detail:{time:number}})=>void>={};
    const frame={innerHTML:''};
    const context=vm.createContext({window:{addEventListener:(name:string,handler:typeof handlers[string])=>{handlers[name]=handler;}},document:{getElementById:()=>frame}});
    for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if(!match[0].includes('type="application/json"'))vm.runInContext(match[1],context);
    }
    handlers['hf-seek']({detail:{time:1.2}});
    expect(frame.innerHTML).toBe(renderScene(p,1200));
    handlers['hf-seek']({detail:{time:0}});
    expect(frame.innerHTML).toBe(renderScene(p,0));
  });
  it('SVG 保留复用符号的完整许可且不改变可见画面',()=>{
    const metadata=renderScene(exportFixture(),0).match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
    expect(metadata).toContain('Copyright (c) 2026 Vitaliy Hnatyk');
    expect(metadata).toContain('Permission is hereby granted, free of charge');
    expect(metadata).toContain('SOFTWARE.');
  });
  it('导线使用与元件一致的引脚位置',()=>{
    const svg=renderScene(exportFixture(),0);
    expect(svg).toContain('points="200,220 150,220 150,440 500,440"');
    expect(svg).toContain('translate(250 220) rotate(0)');
  });
  it('按步骤累积开关状态且断路后不显示电流和亮灯',()=>{
    const p=exportFixture();
    expect(renderScene(p,0)).not.toContain('data-current=');
    expect(renderScene(p,1000)).toContain('data-current="w1"');
    expect(renderScene(p,2000)).toContain('data-current="w1"');
    const opened=renderScene(p,2000,{s:false});
    expect(opened).not.toContain('data-current=');
    expect(opened).not.toContain('data-lit="true"');
  });
  it('确定性seek可倒放且字幕与时间一致',()=>{
    const p=exportFixture();
    const first=renderScene(p,1200);
    renderScene(p,2700);
    expect(renderScene(p,1200)).toBe(first);
    expect(renderScene(p,1000)).toContain('电流从正极流出');
    expect(renderScene(p,999)).toContain('开关断开');
  });
  it('方向箭头沿已连通导线转向，反向演示转动 180 度',()=>{
    const p=exportFixture();
    const turns=[...renderScene(p,1000).matchAll(/data-flow-arrow="w1"[^>]*rotate\(([\d.-]+)\)/g)].map(match=>Number(match[1]));
    expect(turns).toContain(180);expect(turns).toContain(90);expect(turns).toContain(0);
    p.circuit.wires[0].points=[];
    const forward=renderScene(p,1000).match(/data-flow-arrow="w1"[^>]*rotate\(([\d.-]+)\)/)?.[1];
    expect(forward).toBeDefined();
    const action=p.lesson.steps[1].actions.find(action=>action.type==='flow')!;action.reverse=true;
    const reverse=renderScene(p,1000).match(/data-flow-arrow="w1"[^>]*rotate\(([\d.-]+)\)/)?.[1];
    expect(reverse).toBeDefined();
    expect(renderScene(p,0)).not.toContain('data-flow-arrow=');
    expect(Number(reverse)-Number(forward)).toBe(180);
  });
  it('中文和恶意文本只作为文本，不能逃逸SVG或script',()=>{
    const p=exportFixture();p.title='</script><img src=x onerror=alert(1)>';p.circuit.components[0].label='<script>alert(2)</script>';
    expect(renderScene(p,0)).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    for(const html of [buildOfflineHtml(p),buildCompositionHtml(p)]) {
      expect(html).not.toContain('</script><img');
      expect(html).not.toMatch(/<script\s+src=/);
    }
  });
  it('离线和HyperFrames注入同一runtime且工程JSON往返完整',()=>{
    const p=exportFixture();
    for(const html of [buildOfflineHtml(p),buildCompositionHtml(p)]) {
      const data=html.match(/<script id="project-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
      expect(JSON.parse(data!)).toEqual(p);
      const script=html.match(/<script id="scene-runtime">([\s\S]*?)<\/script>/)?.[1];
      const context=vm.createContext({});vm.runInContext(script!,context);
      expect(vm.runInContext('sceneRuntime.renderScene(project,1200)',context)).toBe(renderScene(p,1200));
    }
  });
});
