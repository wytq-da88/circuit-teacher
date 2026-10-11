import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Activity,ArrowRight,BookOpen,Check,CheckCircle2,ChevronDown,ChevronRight,Download,FolderOpen,History,Info,Loader2,Maximize2,Pause,Play,Redo2,RotateCcw,Save,Settings2,ShieldCheck,Sparkles,Undo2,X,Zap} from 'lucide-react';
import type {ChangeMode,Project,ProjectSummary,Proposal,ProviderSettings} from '../shared/types';
import {applyProposal,getLessonIssues,touchProject,validateCircuit,validateProject} from '../shared/model';
import {createExample} from '../shared/examples';
import {renderScene} from '../shared/scene';
import {api,body,clone,formatTime} from './api';
import {CircuitEditor,Inspector,Toolbox,type Edit,type Selection} from './CircuitEditor';
import {ExportDialog,Modal,ProjectsDialog,SettingsDialog} from './Dialogs';
import {LessonTimeline,StepInspector} from './LessonPanel';
import {PhotoPanel} from './PhotoPanel';

const initialSettings:ProviderSettings={baseUrl:'https://api.openai.com/v1',model:'',hasKey:false,timeoutMs:90000};
const presets=[{kind:'series' as const,title:'串联电路',desc:'观察电流的唯一通路',icon:'01'},{kind:'parallel' as const,title:'并联电路',desc:'发现支路之间的关系',icon:'02'},{kind:'switch' as const,title:'开关控制',desc:'从断开到闭合的瞬间',icon:'03'}];
type Notice={message:string;kind:'error'|'success'|'info'};
type Dialog='settings'|'projects'|'export'|'help'|null;

export default function App(){
 const [project,setProject]=useState<Project>(()=>createExample('series'));
 const projectRef=useRef(project);
 const [loaded,setLoaded]=useState(false);
 const [settings,setSettings]=useState<ProviderSettings>(initialSettings);
 const [dialog,setDialog]=useState<Dialog>(null);
 const [notice,setNotice]=useState<Notice|null>(null);
 const [selection,setSelection]=useState<Selection>(null);
 const [selectedStep,setSelectedStep]=useState('');
 const [view,setView]=useState<'edit'|'preview'>('edit');
 const [rightTab,setRightTab]=useState<'assistant'|'properties'|'step'>('assistant');
 const [mode,setMode]=useState<ChangeMode>('lesson');
 const [prompt,setPrompt]=useState('');
 const [aiBusy,setAiBusy]=useState<'recognize'|'propose'|null>(null);
 const [proposal,setProposal]=useState<Proposal|null>(null);
 const [proposalSource,setProposalSource]=useState<'recognize'|'propose'>('propose');
 const [timeMs,setTimeMs]=useState(0);
 const [playing,setPlaying]=useState(false);
 const [fullscreen,setFullscreen]=useState(false);
 const [saveStatus,setSaveStatus]=useState<'saving'|'saved'|'dirty'|'error'>('dirty');
 const [historyCount,setHistoryCount]=useState({past:0,future:0});
 const past=useRef<Project[]>([]),future=useRef<Project[]>([]);
 const saveQueue=useRef<Promise<void>>(Promise.resolve());
 const savedKey=useRef('');
 const lastEdit=useRef(Date.now());
 const error=useCallback((message:string)=>setNotice({message,kind:'error'}),[]);
 const announce=useCallback((message:string)=>setNotice({message,kind:'success'}),[]);

 const replace=useCallback((next:Project,clearHistory=false)=>{
  projectRef.current=next;setProject(next);setSaveStatus(savedKey.current===`${next.id}:${next.revision}`?'saved':'dirty');
  if(clearHistory){past.current=[];future.current=[];setHistoryCount({past:0,future:0});setSelection(null);setSelectedStep(next.lesson.steps[0]?.id||'');setTimeMs(0);setPlaying(false);setProposal(null);}
 },[]);
 const edit:Edit=useCallback((fn,circuitChanged=false)=>{
  const previous=projectRef.current;let next=clone(previous);fn(next);
  if(JSON.stringify(next)===JSON.stringify(previous))return;
  if(circuitChanged)next.review={confirmed:false};
  next.metrics.workMs+=Math.min(60000,Math.max(0,Date.now()-lastEdit.current));lastEdit.current=Date.now();
  next=touchProject(next);past.current=[...past.current.slice(-59),clone(previous)];future.current=[];
  setHistoryCount({past:past.current.length,future:0});replace(next);
 },[replace]);
 const save=useCallback((snapshot:Project)=>{
  const task=saveQueue.current.catch(()=>{}).then(async()=>{
   const key=`${snapshot.id}:${snapshot.revision}`;if(savedKey.current===key)return;
   if(projectRef.current.id===snapshot.id)setSaveStatus('saving');
   try{
    await api<{project:Project}>(`/projects/${snapshot.id}`,{method:'PUT',body:body({project:snapshot})});
    savedKey.current=key;
    if(projectRef.current.id===snapshot.id)setSaveStatus(projectRef.current.revision===snapshot.revision?'saved':'dirty');
   }catch(cause){if(projectRef.current.id===snapshot.id)setSaveStatus('error');throw cause;}
  });saveQueue.current=task;return task;
 },[]);
 useEffect(()=>{
  let alive=true;
  async function load(){
   const results=await Promise.allSettled([api<{settings:ProviderSettings}>('/settings'),api<{projects:ProjectSummary[]}>('/projects')]);
   if(!alive)return;
   if(results[0].status==='fulfilled')setSettings(results[0].value.settings);else error(results[0].reason.message);
   if(results[1].status==='fulfilled'&&results[1].value.projects.length){
    try{const {project:stored}=await api<{project:Project}>(`/projects/${results[1].value.projects[0].id}`);const checked=validateProject(stored);if(alive){savedKey.current=`${checked.id}:${checked.revision}`;replace(checked,true);}}
    catch(cause){if(alive)error((cause as Error).message);}
   }else if(results[1].status==='rejected')error(results[1].reason.message);
   if(alive){setLoaded(true);setSelectedStep(projectRef.current.lesson.steps[0]?.id||'');}
  }
  void load();return()=>{alive=false;};
 },[error,replace]);
 useEffect(()=>{if(!loaded||savedKey.current===`${project.id}:${project.revision}`)return;const timer=setTimeout(()=>{void save(clone(project)).catch(cause=>error(`自动保存未完成：${cause.message}。编辑内容仍保留在当前页面，可点击保存重试。`));},900);return()=>clearTimeout(timer);},[project,loaded,save,error]);
 useEffect(()=>{const beforeUnload=(event:BeforeUnloadEvent)=>{if(savedKey.current!==`${projectRef.current.id}:${projectRef.current.revision}`){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload);},[]);
 const undo=useCallback((redo=false)=>{
  const source=redo?future:past,target=redo?past:future;const candidate=source.current.pop();if(!candidate)return;
  target.current.push(clone(projectRef.current));const next=clone(candidate);next.revision=projectRef.current.revision;next.metrics.editCount=projectRef.current.metrics.editCount;
  replace(touchProject(next));setSelection(null);setHistoryCount({past:past.current.length,future:future.current.length});
 },[replace]);
 useEffect(()=>{const key=(event:KeyboardEvent)=>{const typing=event.target instanceof HTMLElement&&!!event.target.closest('input,textarea,select,[contenteditable="true"]');if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void save(clone(projectRef.current)).catch(cause=>error(cause.message));}if(!typing&&!dialog&&!proposal&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);}if(event.key==='Escape'){setFullscreen(false);setPlaying(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[save,error,undo,dialog,proposal]);
 const total=project.lesson.steps.reduce((n,step)=>n+step.durationMs,0);
 useEffect(()=>{setTimeMs(t=>Math.min(t,total));if(!total)setPlaying(false);},[total]);
 useEffect(()=>{if(!playing)return;let frame=0;let previous=performance.now();const tick=(now:number)=>{const delta=now-previous;previous=now;setTimeMs(t=>{const next=Math.min(total,t+delta);return next;});frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing,total]);
 useEffect(()=>{if(playing&&timeMs>=total)setPlaying(false);},[playing,timeMs,total]);
 const lessonIssues=useMemo(()=>getLessonIssues(project),[project]);
 const circuitIssues=useMemo(()=>validateCircuit(project.circuit),[project.circuit]);
 const preview=useMemo(()=>{try{return {svg:renderScene(project,timeMs),error:''};}catch(cause){return {svg:'',error:(cause as Error).message};}},[project,timeMs]);
 function selectObject(next:Selection){setSelection(next);if(next)setRightTab('properties');}
 function selectStep(id:string,start?:number){setSelectedStep(id);setRightTab('step');setView('preview');setPlaying(false);if(start!==undefined)setTimeMs(start);}
 function play(){setView('preview');if(timeMs>=total)setTimeMs(0);setPlaying(p=>!p);}
 async function askAI(kind:'recognize'|'propose'){
  if(!settings.hasKey){setDialog('settings');setNotice({message:'先配置支持视觉输入的 AI 服务，即可识别图片或生成变更建议。',kind:'info'});return;}
  if(kind==='propose'&&!prompt.trim())return;
  const snapshot=clone(projectRef.current);setAiBusy(kind);
  try{const result=await api<{proposal:Proposal}>(kind==='recognize'?'/recognize':'/propose',{method:'POST',body:body(kind==='recognize'?{project:snapshot}:{project:snapshot,prompt,mode})});
   if(projectRef.current.id!==snapshot.id){error('AI 已返回，但当前工程已切换，请在原工程重新发起。');return;}
   setProposal(result.proposal);setProposalSource(kind);
  }catch(cause){error((cause as Error).message);}finally{setAiBusy(null);}
 }
 function confirmProposal(){if(!proposal)return;try{const next=applyProposal(projectRef.current,proposal);past.current.push(clone(projectRef.current));past.current=past.current.slice(-60);future.current=[];setHistoryCount({past:past.current.length,future:0});replace(next);setProposal(null);setSelection(null);if(proposalSource==='propose')setPrompt('');setSelectedStep(next.lesson.steps[0]?.id||'');setTimeMs(0);announce('变更已应用，可随时撤销。');}catch(cause){error((cause as Error).message);}}
 async function openProject(id:string){await save(clone(projectRef.current));const result=await api<{project:Project}>(`/projects/${id}`);const checked=validateProject(result.project);savedKey.current=`${checked.id}:${checked.revision}`;replace(checked,true);}
 async function newProject(kind:'series'|'parallel'|'switch'|'blank'){await save(clone(projectRef.current));let next=createExample(kind==='blank'?'series':kind);if(kind==='blank')next={...next,title:'未命名电路课件',circuit:{components:[],junctions:[],wires:[]},lesson:{steps:[]},uncertainties:[],review:{confirmed:false}};await save(next);replace(next,true);setView('edit');announce(kind==='blank'?'空白工程已创建。':'示例已复制为你的新工程，可直接编辑。');}
 async function saveAs(title:string){await save(clone(projectRef.current));const next={...clone(projectRef.current),id:crypto.randomUUID(),title:title.trim(),revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await save(next);replace(next,true);announce('副本已保存。');}
 async function restore(revision:number){await save(clone(projectRef.current));const result=await api<{project:Project}>(`/projects/${projectRef.current.id}/restore`,{method:'POST',body:body({revision})});const checked=validateProject(result.project);savedKey.current=`${checked.id}:${checked.revision}`;replace(checked,true);announce(`已从版本 ${revision} 恢复为新的版本。`);}
 async function importProject(input:unknown){const checked=validateProject(input);await save(clone(projectRef.current));const next={...checked,id:crypto.randomUUID(),revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await save(next);replace(next,true);announce('工程已作为新副本导入，原工程未覆盖。');}
 const currentStep=(()=>{let start=0;for(const step of project.lesson.steps){start+=step.durationMs;if(timeMs<start)return step;}return project.lesson.steps.at(-1);})();
 const previewNode=<>{preview.svg?<div className="scene-svg" dangerouslySetInnerHTML={{__html:preview.svg}}/>:<div className="empty-state"><Info size={25}/><p>{preview.error||'添加元件，开始你的第一堂课'}</p></div>}</>;

 return <div className="app-shell">
  <header className="app-header"><a href="/" className="brand" aria-label="电路课件工坊首页"><div className="brand-mark"><Zap size={22} strokeWidth={1.8}/><i/></div><div><strong>电路课件工坊<span>CIRCUIT STUDIO</span></strong></div></a><div className="header-divider"/><div className="project-identity"><input aria-label="工程名称" value={project.title} maxLength={100} onChange={e=>edit(p=>{p.title=e.target.value;})}/><span className={`save-indicator ${saveStatus}`}><i/>{saveStatus==='saved'?'已保存到本机':saveStatus==='saving'?'正在保存…':saveStatus==='error'?'保存失败 · 点击重试':'有待保存的修改'}<span className="revision-label">版本 {project.revision}</span></span></div><nav className="header-actions"><button className="tool-button" disabled={!loaded} onClick={()=>void save(clone(projectRef.current)).then(()=>announce('工程已保存。')).catch(cause=>error(cause.message))} title="保存工程 Ctrl+S"><Save size={16}/><span>保存</span></button><button className="tool-button" disabled={!loaded} onClick={()=>setDialog('projects')}><FolderOpen size={16}/><span>我的课件</span></button><button className="icon-button" title="AI 服务设置" onClick={()=>setDialog('settings')}><Settings2 size={19}/></button><button className="button export-button" disabled={!loaded} onClick={()=>{setPlaying(false);setDialog('export');}}><Download size={16}/> 导出课件<ChevronDown size={13}/></button></nav></header>
  <div className="studio-heading"><div><span className="eyebrow">从一张电路图，到一堂看得见的课</span><h1>让电路，动起来<span>。</span></h1></div><div className="workflow-breadcrumb"><span><span>01</span> 导入与校对</span><ChevronRight size={13}/><span className="active"><span>02</span> 编辑与演示</span><ChevronRight size={13}/><span><span>03</span> 导出与分享</span></div><button className="text-button guide-link" onClick={()=>setDialog('help')}><BookOpen size={15}/> 使用指南</button></div>
  {notice&&<div className={`notice-banner ${notice.kind}`} role={notice.kind==='error'?'alert':'status'}>{notice.kind==='error'?<Info size={17}/>:notice.kind==='success'?<CheckCircle2 size={17}/>:<Info size={17}/>}<span>{notice.message}</span><button className="icon-button" title="关闭提示" onClick={()=>setNotice(null)}><X size={15}/></button></div>}
  {!loaded?<div className="loading-studio"><Loader2 className="spin" size={28}/><p>正在打开本机工作台…</p></div>:<>
  <main className="studio-grid"><aside className="left-panel panel"><PhotoPanel project={project} edit={edit} onRecognize={()=>void askAI('recognize')} busy={aiBusy==='recognize'} onError={error}/><div className="divider"/><div className="section-head"><span>用一个示例开始</span><span className="micro-label">QUICK START</span></div><div className="example-list">{presets.map(p=><button key={p.kind} onClick={()=>void newProject(p.kind).catch(cause=>error(cause.message))}><span className="example-number">{p.icon}</span><span><strong>{p.title}</strong><small>{p.desc}</small></span><ArrowRight size={14}/></button>)}</div><div className="local-note"><ShieldCheck size={14}/><span>工程存储在本机<br/>由你掌握每一次修改</span></div></aside>
  <section className="center-panel panel"><div className="canvas-toolbar"><div className="canvas-section-title"><span className="step-dot">02</span><strong>电路画布</strong><span className="count-pill">{project.circuit.components.length} 元件</span></div><div className="canvas-view-tabs"><button className={view==='edit'?'active':''} onClick={()=>{setView('edit');setPlaying(false);}}>编辑电路</button><button className={view==='preview'?'active':''} onClick={()=>setView('preview')}>演示预览</button></div></div><div className="canvas-tools"><Toolbox edit={edit} onSelect={selectObject}/><div className="inline-actions"><button className="icon-button" title="撤销 Ctrl+Z" disabled={!historyCount.past} onClick={()=>undo()}><Undo2 size={17}/></button><button className="icon-button" title="重做 Ctrl+Shift+Z" disabled={!historyCount.future} onClick={()=>undo(true)}><Redo2 size={17}/></button><span className="mini-divider"/><span className={`review-state ${project.review.confirmed?'done':''}`}><span/>{project.review.confirmed?'校对完成':'待人工校对'}</span></div></div>
  <div className={`canvas-area ${view==='preview'?'preview-mode':''}`}>{view==='edit'?<CircuitEditor circuit={project.circuit} edit={edit} selection={selection} onSelect={selectObject}/>:previewNode}{view==='preview'&&<button className="preview-expand icon-button" title="放大演示" onClick={()=>setFullscreen(true)}><Maximize2 size={16}/></button>}{project.circuit.components.length===0&&view==='edit'&&<div className="canvas-empty-note"><Zap size={25}/><strong>你的电路，从这里开始</strong><span>添加元件并拖动端点连接，或上传照片识别</span></div>}</div>
  <div className="player-bar"><button className={`play-button ${playing?'playing':''}`} disabled={!total} title={playing?'暂停演示':'播放演示'} onClick={play}>{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><button className="icon-button" title="从头开始" onClick={()=>{setPlaying(false);setTimeMs(0);}}><RotateCcw size={15}/></button><span className="player-time">{formatTime(timeMs)} <span>/ {formatTime(total)}</span></span><input aria-label="演示播放进度" className="player-seek" type="range" min={0} max={Math.max(1,total)} step={50} value={timeMs} disabled={!total} onChange={e=>{setTimeMs(Number(e.target.value));setView('preview');}}/><span className="player-caption">{currentStep?.title||'尚未添加教学步骤'}</span></div>
  <div className="canvas-footer"><span><Activity size={12}/> 基础直流 · 教学示意</span><span>1280 × 720 <i/> 16 : 9</span></div>
  </section>
  <aside className="right-panel panel"><div className="side-tabs"><button className={rightTab==='assistant'?'active':''} onClick={()=>setRightTab('assistant')}><Sparkles size={14}/> AI 助教</button><button className={rightTab==='properties'?'active':''} onClick={()=>setRightTab('properties')}>属性</button><button className={rightTab==='step'?'active':''} onClick={()=>setRightTab('step')}>步骤</button></div><div className="right-content">{rightTab==='assistant'?<><div className="assistant-intro"><div className="assistant-icon"><Sparkles size={21}/></div><h2>把想法说出来</h2><p>描述你想调整的电路，或想讲清楚的知识点。</p></div><div className="mode-toggle"><button className={mode==='circuit'?'active':''} onClick={()=>setMode('circuit')}>修改电路结构</button><button className={mode==='lesson'?'active':''} onClick={()=>setMode('lesson')}>编排教学演示</button></div><label className="prompt-label" htmlFor="ai-prompt">{mode==='circuit'?'你希望怎样修改？':'这一堂课，想如何展开？'}</label><div className="prompt-box"><textarea id="ai-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} rows={6} placeholder={mode==='circuit'?'例如：在灯泡两端并联一个电压表，并标注接线位置。':'例如：分三步演示开关闭合后的电流路径，高亮灯泡，配上适合初中生的讲解字幕。'}/><span>先预览变更，确认后才会应用</span></div><button className="button full" disabled={!!aiBusy||!prompt.trim()} onClick={()=>void askAI('propose')}>{aiBusy==='propose'?<Loader2 size={15} className="spin"/>:<Sparkles size={15}/>} {aiBusy==='propose'?'正在构思教学方案…':'生成变更建议'}<ArrowRight size={14}/></button><div className="prompt-suggestions"><span className="tiny muted">试试这样描述</span>{(mode==='lesson'?['分步展示电流流向，添加简明字幕','高亮每个支路，讲解并联电路特点','演示开关断开与闭合时灯泡的变化']:['整理元件位置，让导线横平竖直','为元件添加清晰的中文说明','检查并修正电路中的连接问题']).map(text=><button key={text} onClick={()=>setPrompt(text)}>{text}<ArrowUpRightSmall/></button>)}</div><div className="ai-connection"><span className={settings.hasKey?'connected':''}/><span>{settings.hasKey?`已配置 · ${settings.model||'视觉模型'}`:'尚未连接 AI 服务'}</span><button className="text-button" onClick={()=>setDialog('settings')}>{settings.hasKey?'设置':'去配置'}<ChevronRight size={12}/></button></div></>:rightTab==='properties'?<Inspector project={project} selection={selection} edit={edit} onSelect={setSelection}/>:<StepInspector project={project} stepId={selectedStep} edit={edit} onStepSelect={id=>selectStep(id)}/>}</div><div className="right-panel-foot"><CheckCircle2 size={13}/><span>结构修改与教学演示分别管理</span></div></aside></main>
  {(circuitIssues.length>0||lessonIssues.length>0)&&<details className="issues-drawer"><summary><Info size={15}/>{circuitIssues.length+lessonIssues.length} 项需要检查<span>修改结构后，请检查步骤引用与电流路径</span><ChevronDown size={14}/></summary><ul>{[...circuitIssues,...lessonIssues].map((issue,i)=><li key={i}>{issue}</li>)}</ul></details>}
  <LessonTimeline project={project} edit={edit} selectedStep={selectedStep} onSelect={selectStep} timeMs={timeMs}/>
  <footer className="workspace-footer"><span><span className="status-dot"/> 本机工作台 <i/> 为每一堂好课而做</span><span>人工编辑 {project.metrics.editCount} 次 <i/> Ctrl + S 保存 · Ctrl + Z 撤销</span></footer>
  </>}
  {dialog==='settings'&&<SettingsDialog settings={settings} onSaved={setSettings} onClose={()=>setDialog(null)} onError={error}/>}
  {dialog==='projects'&&<ProjectsDialog current={project} onClose={()=>setDialog(null)} onOpen={openProject} onNew={newProject} onSaveAs={saveAs} onRestore={restore} onImport={importProject} onError={error}/>}
  {dialog==='export'&&<ExportDialog project={project} timeMs={timeMs} onClose={()=>setDialog(null)} onError={error}/>}
  {dialog==='help'&&<Modal title="把电路变成一堂课" subtitle="从原图到成品，三个步骤就能开始。" onClose={()=>setDialog(null)}><div className="guide-steps"><div><span>01</span><section><h3>建立电路，完成校对</h3><p>上传照片并配置视觉模型进行识别，或直接从示例开始。拖动元件圆形端点连接导线；交叉线不会自动连接，需要添加接点。</p></section></div><div><span>02</span><section><h3>编排每一步教学演示</h3><p>在时间轴添加步骤，设置时长、字幕和动作。电流路径请选择连续且形成闭合回路的导线。AI 修改先生成待确认建议，应用前可逐项预览。</p></section></div><div><span>03</span><section><h3>预览、导出，带进课堂</h3><p>播放预览检查节奏；完成人工校对后，导出互动 HTML、视频、图片或讲义。工程 JSON 可随时备份，导入后继续编辑。</p></section></div></div><div className="inline-notice">导出成品和工程数据保存在本机 D 盘项目目录。教学演示表现预设动作，不进行物理电路数值仿真。</div><footer><button className="button" onClick={()=>setDialog(null)}>开始制作<ArrowRight size={15}/></button></footer></Modal>}
  {proposal&&<ProposalDialog proposal={proposal} stale={proposal.baseRevision!==project.revision} onClose={()=>setProposal(null)} onConfirm={confirmProposal}/>}
  {fullscreen&&<div className="fullscreen-player"><header><strong>{project.title}</strong><span>演示预览</span><button className="icon-button" title="退出放大预览" onClick={()=>setFullscreen(false)}><X size={22}/></button></header><div className="fullscreen-scene">{previewNode}</div><div className="fullscreen-controls"><button className="button" disabled={!total} onClick={play}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'暂停':'播放'}</button><input type="range" aria-label="放大预览进度" min={0} max={Math.max(total,1)} value={timeMs} step={50} onChange={e=>setTimeMs(Number(e.target.value))}/><span>{formatTime(timeMs)} / {formatTime(total)}</span></div></div>}
 </div>;
}
function ArrowUpRightSmall(){return <ArrowRight size={12} className="suggestion-arrow"/>;}
function ProposalDialog({proposal,stale,onClose,onConfirm}:{proposal:Proposal;stale:boolean;onClose:()=>void;onConfirm:()=>void}){
 const preview=useMemo(()=>{try{return renderScene(proposal.project,0);}catch{return '';}},[proposal]);
 return <Modal title="先看看这次的修改" subtitle="确认前，当前工程保持原样。确认后仍可以撤销。" onClose={onClose} wide><div className="proposal-summary"><Sparkles size={20}/><p>{proposal.summary}</p></div><div className="proposal-content"><div className="proposal-preview">{preview?<div className="scene-svg" dangerouslySetInnerHTML={{__html:preview}}/>:<span>无法显示候选预览，请检查变更内容。</span>}</div><div className="proposal-changes"><h3>变更清单</h3><ul>{proposal.changes.map((change,index)=><li key={index}><Check size={13}/><span>{change}</span></li>)}</ul></div></div>{proposal.project.uncertainties.some(u=>!u.resolved)&&<p className="warning-text tiny">识别结果包含待校对项。应用后，请在左侧逐项检查并确认。</p>}{proposal.usage&&<p className="tiny muted">模型 {proposal.usage.model} · 输入 {proposal.usage.promptTokens} / 输出 {proposal.usage.completionTokens} tokens</p>}{stale&&<div className="inline-notice">工程在生成建议期间已发生修改。这份建议已过期，请关闭后重新生成，避免覆盖你的编辑。</div>}<footer><button className="button outline" onClick={onClose}>保留原工程</button><button className="button" disabled={stale} onClick={onConfirm}><Check size={15}/> 确认应用变更</button></footer></Modal>;
}
