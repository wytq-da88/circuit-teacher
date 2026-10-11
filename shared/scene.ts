import type { Project, Point } from './types';
import { analyzeFlow, endpointPosition, pinPosition } from './model';
import { symbolMarkup, SYMBOL_LICENSE } from './symbols';

// Every dependency is injected and serialized below; preview, offline playback and video
// therefore use exactly the same state reduction, connectivity and geometry.
function createSceneRuntime(symbol:typeof symbolMarkup, endpoint:typeof endpointPosition, flow:typeof analyzeFlow, license:string) {
  function escape(value:unknown):string { return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
  function state(project:Project,timeMs:number,overrides:Record<string,boolean>={}) {
    const steps=project.lesson.steps,total=steps.reduce((n,s)=>n+s.durationMs,0);
    const time=Math.max(0,Math.min(Number.isFinite(timeMs)?timeMs:0,Math.max(0,total-0.001)));
    let start=0,index=0;
    for(let i=0;i<steps.length;i++){index=i;if(time<start+steps[i].durationMs)break;start+=steps[i].durationMs;}
    const switches:Record<string,boolean>=Object.create(null);
    for(const component of project.circuit.components)if(component.type==='switch')switches[component.id]=Boolean(component.closed);
    for(let i=0;i<=index;i++)for(const action of steps[i]?.actions??[])if(action.type==='switch')for(const id of action.targetIds)switches[id]=action.enabled!==false;
    Object.assign(switches,overrides);
    const actions=steps[index]?.actions??[],flowIds=actions.filter(a=>a.type==='flow'&&a.enabled!==false).flatMap(a=>a.targetIds);
    const connected=flow(project.circuit,project.circuit.wires.map(w=>w.id),switches);
    const activeIds=new Set(connected.activeWireIds), currents=flowIds.filter(id=>activeIds.has(id));
    const lit=new Set(actions.filter(a=>a.type==='lamp'&&a.enabled!==false).flatMap(a=>a.targetIds));
    if(currents.length)for(const id of connected.activeComponentIds)lit.add(id);
    for(const action of actions)if(action.type==='lamp'&&action.enabled===false)for(const id of action.targetIds)lit.delete(id);
    return {time,total,index,step:steps[index],switches,actions,currents,lit,connected};
  }
  function atDistance(points:Point[],distance:number):Point & {angle:number} {
    for(let i=1;i<points.length;i++) { const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y); if(distance<=length&&length>0)return {x:a.x+(b.x-a.x)*distance/length,y:a.y+(b.y-a.y)*distance/length,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};distance-=length; }
    const a=points[points.length-2],b=points[points.length-1];
    return {...b,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};
  }
  function lines(text:string,max:number):string[] { const result:string[]=[];for(const line of text.split(/\r?\n/)){const chars=Array.from(line);while(chars.length)result.push(chars.splice(0,max).join(''));if(!line)result.push('');}return result; }
  function renderScene(project:Project,timeMs:number,overrides:Record<string,boolean>={}):string {
    const current=state(project,timeMs,overrides),circuit=project.circuit;
    const highlighted=new Set(current.actions.filter(a=>a.type==='highlight'&&a.enabled!==false).flatMap(a=>a.targetIds));
    const allPoints:Point[]=circuit.junctions.slice();
    for(const c of circuit.components) {const extent=Math.max(72,Math.max(Array.from(c.label).length,Array.from(c.value).length)*9);allPoints.push({x:c.x-extent,y:c.y-70},{x:c.x+extent,y:c.y+90});}
    const paths=circuit.wires.map(w=>({wire:w,points:[endpoint(circuit,w.from),...w.points,endpoint(circuit,w.to)]}));
    for(const p of paths)allPoints.push(...p.points);
    const minX=Math.min(...allPoints.map(p=>p.x),0),maxX=Math.max(...allPoints.map(p=>p.x),1),minY=Math.min(...allPoints.map(p=>p.y),0),maxY=Math.max(...allPoints.map(p=>p.y),1);
    const scale=Math.min(1,1100/Math.max(1,maxX-minX),430/Math.max(1,maxY-minY));
    const tx=640-(minX+maxX)/2*scale,ty=345-(minY+maxY)/2*scale;
    let content='';
    for(const {wire,points} of paths) {
      const coords=points.map(p=>`${p.x},${p.y}`).join(' '),active=current.currents.includes(wire.id);
      content+=`<polyline data-wire="${escape(wire.id)}" points="${coords}" fill="none" stroke="${highlighted.has(wire.id)?'#e68a17':'#526174'}" stroke-width="${highlighted.has(wire.id)?5:3}" stroke-linejoin="round"/>`;
      if(active) {
        const length=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
        const reverse=current.actions.some(a=>a.type==='flow'&&a.reverse&&a.targetIds.includes(wire.id));
        const forward=Boolean(current.connected.directions[wire.id])!==reverse;
        const phase=(current.time*0.07)%32;
        content+=`<g data-current="${escape(wire.id)}" fill="#dc7c13">`;
        for(let d=phase;d<length;d+=32){const p=atDistance(points,forward?d:length-d);content+=`<path data-flow-arrow="${escape(wire.id)}" d="M-5-4L4 0L-5 4Z" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${(p.angle+(forward?0:180)).toFixed(2)})"/>`;}
        content+='</g>';
      }
    }
    for(const j of circuit.junctions)content+=`<circle cx="${j.x}" cy="${j.y}" r="5" fill="#26384e"/>`;
    for(const c of circuit.components) {
      const lit=c.type==='lamp'&&current.lit.has(c.id)&&current.connected.activeComponentIds.includes(c.id);
      const color=highlighted.has(c.id)?'#cc7210':'#21384c';
      content+=`<g data-component="${escape(c.id)}" data-lit="${lit}"${c.type==='switch'?` data-switch="${escape(c.id)}" data-closed="${current.switches[c.id]}"`:''}>`;
      if(highlighted.has(c.id)||lit)content+=`<circle cx="${c.x}" cy="${c.y}" r="42" fill="${lit?'#fff5ca':'#fff0dc'}"/>`;
      content+=`<g transform="translate(${c.x} ${c.y}) rotate(${c.rotation})" color="${color}" stroke="currentColor" stroke-width="3" stroke-linecap="round">${symbol(c.type,current.switches[c.id],lit)}</g>`;
      content+=`<text x="${c.x}" y="${c.y+60}" text-anchor="middle" fill="#21384c" font-size="18" font-weight="600">${escape(c.label)}</text>`;
      if(c.value)content+=`<text x="${c.x}" y="${c.y+83}" text-anchor="middle" fill="#5b6877" font-size="16">${escape(c.value)}</text>`;
      content+='</g>';
    }
    const caption=current.step?.caption??'请添加课件步骤，开始电路教学演示。';
    const captionLines=lines(caption,52),captionFont=Math.max(13,Math.min(23,72/Math.max(1,captionLines.length)));
    const captionY=630+(captionLines.length===1?15:0);
    const annotations=current.actions.filter(a=>a.type==='label'&&a.enabled!==false&&a.text).map(a=>a.text).join(' · ');
    const titleSize=Math.max(14,Math.min(30,1080/Math.max(1,Array.from(project.title).length)));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="${escape(project.title)}" style="font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif"><metadata>${escape(license)}</metadata><rect width="1280" height="720" fill="#f2f5f7"/><rect x="44" y="34" width="5" height="38" rx="2" fill="#158c83"/><text x="66" y="66" font-size="${titleSize}" font-weight="700" fill="#18354c">${escape(project.title)}</text><text x="66" y="99" font-size="16" fill="#576c7d">${escape(current.step?`${current.index+1} / ${project.lesson.steps.length}　${current.step.title}`:'电路结构图')}</text><rect x="44" y="119" width="1192" height="471" rx="18" fill="#ffffff" stroke="#dce5eb"/><g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(6)})">${content}</g>${annotations?`<text x="640" y="572" text-anchor="middle" font-size="16" fill="#17766f">${escape(annotations)}</text>`:''}<text x="640" y="${captionY}" text-anchor="middle" font-size="${captionFont}" fill="#18354c">${captionLines.map((line,i)=>`<tspan x="640" dy="${i===0?0:captionFont+4}">${escape(line)}</tspan>`).join('')}</text><text x="1210" y="703" text-anchor="end" font-size="13" fill="#526677">电路课件工坊 · 教学示意，不代表数值仿真</text></svg>`;
  }
  return {renderScene,state};
}
export const sceneRuntime=createSceneRuntime(symbolMarkup,endpointPosition,analyzeFlow,SYMBOL_LICENSE);
export const renderScene=sceneRuntime.renderScene;
function safeJson(value:unknown):string { return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'); }
function runtimeScript(project:Project):string {
  // __name is emitted by tsx/esbuild for inner functions when keepNames is enabled.
  return `<script id="project-data" type="application/json">${safeJson(project)}</script><script id="scene-runtime">var __name=(fn)=>fn;var pinPosition=${pinPosition.toString()};var endpointPosition=${endpointPosition.toString()};var sceneRuntime=(${createSceneRuntime.toString()})(${symbolMarkup.toString()},endpointPosition,${analyzeFlow.toString()},${safeJson(SYMBOL_LICENSE)});var project=${safeJson(project)};</script>`;
}
function head():string { return '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>电路课件工坊 · 离线课件</title>'; }
const licenseComment=`<!-- Symbol license: ${SYMBOL_LICENSE.replace(/--/g,'—')} -->`;
export function buildOfflineHtml(project:Project):string {
  return `<!doctype html><html lang="zh-CN"><head>${head()}<style>*{box-sizing:border-box}body{margin:0;background:#edf2f5;color:#19364b;font-family:"Microsoft YaHei",sans-serif}main{max-width:1280px;margin:auto}#scene svg{width:100%;height:auto;display:block}nav{display:flex;align-items:center;gap:12px;padding:16px 24px;flex-wrap:wrap}button,select{padding:10px 15px;border:1px solid #b9cbd3;border-radius:8px;background:white;color:#19364b;font:inherit;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #158c83}#seek{flex:1;min-width:160px}#switches{padding:0 24px 20px;display:flex;gap:10px;flex-wrap:wrap}#switches button[aria-pressed=true]{background:#e0f5ed}p{margin:0 24px 20px;font-size:13px;color:#596e7e}</style></head><body><main><div id="scene">${renderScene(project,0)}</div><nav aria-label="播放控制"><button id="prev">上一步</button><button id="play">播放</button><button id="next">下一步</button><label for="seek">进度</label><input id="seek" type="range" min="0" max="${project.lesson.steps.reduce((n,s)=>n+s.durationMs,0)}" step="1" value="0"><output id="time">0:00</output><button id="reset">恢复课件开关</button></nav><div id="switches" aria-label="开关互动"></div><p>点击开关可即时演示通断；上一步、下一步或恢复按钮可恢复课件预设。电流与亮灯为教学示意，不代表数值仿真。</p></main>${licenseComment}${runtimeScript(project)}<script>
(()=>{const scene=document.getElementById('scene'),seek=document.getElementById('seek'),play=document.getElementById('play'),switches=document.getElementById('switches');let time=0,playing=false,last=0,overrides={};const total=Number(seek.max),starts=[];let n=0;for(const s of project.lesson.steps){starts.push(n);n+=s.durationMs;}
function draw(){scene.innerHTML=sceneRuntime.renderScene(project,time,overrides);seek.value=String(time);document.getElementById('time').textContent=(time/1000).toFixed(1)+' / '+(total/1000).toFixed(1)+' 秒';const s=sceneRuntime.state(project,time,overrides);switches.replaceChildren();for(const c of project.circuit.components.filter(c=>c.type==='switch')){const b=document.createElement('button');b.textContent=c.label+'：'+(s.switches[c.id]?'闭合':'断开');b.setAttribute('aria-pressed',String(s.switches[c.id]));b.onclick=()=>{overrides[c.id]=!s.switches[c.id];draw();};switches.append(b);}play.textContent=playing?'暂停':'播放';}
play.onclick=()=>{if(time>=total)time=0;playing=!playing;last=0;draw();};seek.oninput=()=>{time=Number(seek.value);last=0;draw();};document.getElementById('reset').onclick=()=>{overrides={};draw();};document.getElementById('prev').onclick=()=>{const i=sceneRuntime.state(project,time).index;time=starts[Math.max(0,i-1)]??0;overrides={};last=0;draw();};document.getElementById('next').onclick=()=>{const i=sceneRuntime.state(project,time).index;time=starts[Math.min(starts.length-1,i+1)]??0;overrides={};last=0;draw();};scene.onclick=e=>{const g=e.target.closest('[data-switch]');if(g){const s=sceneRuntime.state(project,time,overrides);overrides[g.dataset.switch]=!s.switches[g.dataset.switch];draw();}};function tick(now){if(playing&&last){time=Math.min(total,time+now-last);if(time>=total)playing=false;draw();}last=now;requestAnimationFrame(tick);}draw();requestAnimationFrame(tick);window.offlineLesson={seek:t=>{time=Math.max(0,Math.min(total,t));draw();},getTime:()=>time};})();
</script></body></html>`;
}
export function buildCompositionHtml(project:Project):string {
  // The deterministic hf-seek renderer owns the frames; no GSAP timeline is needed.
  const duration=project.lesson.steps.reduce((n,s)=>n+s.durationMs,0)/1000;
  return `<!doctype html><html lang="zh-CN"><head>${head()}<style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden}#circuit-lesson{position:relative;width:1920px;height:1080px}#frame{position:absolute;inset:0;background:#f2f5f7}#frame svg{display:block;width:1920px;height:1080px}</style></head><body><div id="circuit-lesson" data-composition-id="circuit-lesson" data-no-timeline data-width="1920" data-height="1080" data-duration="${duration}" data-fps="30"><div id="frame" class="clip" data-start="0" data-duration="${duration}" data-track-index="0">${renderScene(project,0)}</div></div>${licenseComment}${runtimeScript(project)}<script>window.addEventListener('hf-seek',event=>{document.getElementById('frame').innerHTML=sceneRuntime.renderScene(project,event.detail.time*1000);});window.renderCircuitAt=time=>{document.getElementById('frame').innerHTML=sceneRuntime.renderScene(project,time*1000);};</script></body></html>`;
}
