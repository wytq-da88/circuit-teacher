import {useEffect,useState} from 'react';
import {Copy,ExternalLink,Loader2,RefreshCw,X} from 'lucide-react';
import type {WorkBuddyTask} from '../shared/types';
import {api} from './api';
import {Modal} from './Dialogs';

export function WorkBuddyPanel({task,onReady,onClear,onError}:{task:WorkBuddyTask;onReady:(task:WorkBuddyTask)=>void;onClear:()=>void;onError:(message:string)=>void}){
  const [pollError,setPollError]=useState('');const [retry,setRetry]=useState(0);const [copied,setCopied]=useState(false);
  const command=`使用 circuit-teacher 连接器处理电路课件工坊任务 ${task.id}。先调用 circuit_get_task，按任务中的格式生成 JSON 草稿，再调用 circuit_submit_result 回传。照片中看不清的数值或连接要标记待确认；由我回到工坊确认应用。`;
  useEffect(()=>{
    let alive=true;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{
      const result=await api<{task:WorkBuddyTask}>(`/workbuddy/tasks/${task.id}`);if(!alive)return;setPollError('');
      if(result.task.status==='completed'){onReady(result.task);return;}
      if(result.task.status==='cancelled'){onClear();return;}
      timer=setTimeout(()=>void poll(),1600);
    }catch(error){if(alive)setPollError((error as Error).message);}};
    timer=setTimeout(()=>void poll(),200);return()=>{alive=false;clearTimeout(timer);};
  },[task.id,retry]);
  async function copy(){try{await navigator.clipboard.writeText(command);setCopied(true);}catch{onError('无法自动复制，请选中任务指令手动复制。');}}
  async function cancel(){try{await api(`/workbuddy/tasks/${task.id}/cancel`,{method:'POST',body:'{}'});onClear();}catch(error){onError((error as Error).message);}}
  return <section className="workbuddy-pending" aria-label="WorkBuddy 待办"><div className="section-head"><strong><Loader2 className="spin" size={15}/>等待 WorkBuddy 回传草稿</strong><button className="text-button" onClick={()=>void cancel()}><X size={13}/>取消任务</button></div><p>把下面的指令发给已启用插件的 WorkBuddy。模型在那里处理，草稿会自动出现在这里供你确认。</p><textarea aria-label="WorkBuddy 任务指令" readOnly value={command} rows={2}/><div className="workbuddy-actions"><button className="button outline" onClick={()=>void copy()}><Copy size={14}/>{copied?'已复制任务指令':'复制到 WorkBuddy'}</button><a href="https://www.workbuddy.cn/" target="_blank" rel="noreferrer"><ExternalLink size={12}/>WorkBuddy 官网</a></div>{pollError&&<div className="inline-notice failed">{pollError}<button className="text-button" onClick={()=>setRetry(value=>value+1)}><RefreshCw size={12}/>重试接收</button></div>}</section>;
}

export function WorkBuddyInbox({projectId,onSelect,onClose,onError}:{projectId:string;onSelect:(task:WorkBuddyTask)=>void;onClose:()=>void;onError:(message:string)=>void}){
  const [tasks,setTasks]=useState<WorkBuddyTask[]>([]);const [loaded,setLoaded]=useState(false);
  useEffect(()=>{let alive=true;void api<{tasks:WorkBuddyTask[]}>('/workbuddy/tasks').then(r=>{if(alive){setTasks(r.tasks.filter(task=>task.projectId===projectId));setLoaded(true);}}).catch(e=>{if(alive){onError(e.message);setLoaded(true);}});return()=>{alive=false;};},[projectId]);
  return <Modal title="WorkBuddy 待办与草稿" subtitle="当前课件的任务保存在本机，关闭网页后也能继续接收。" onClose={onClose}>
    <div className="workbuddy-task-list">{!loaded?<p>正在读取任务…</p>:tasks.length===0?<p>还没有 WorkBuddy 任务。先在设置中选择 WorkBuddy，再点击识别或生成建议。</p>:tasks.map(task=><div className="project-row" key={task.id}><div><strong>{task.kind==='recognize'?'识别照片':task.mode==='lesson'?'编排演示':'修改电路'} · 版本 {task.baseRevision}</strong><small>{new Date(task.createdAt).toLocaleString('zh-CN')} · {task.status==='pending'?'待处理':task.status==='completed'?'草稿已回传':'已取消'}</small></div>{task.status!=='cancelled'&&<button className="subtle-button" onClick={()=>{onSelect(task);onClose();}}>{task.status==='completed'?'预览草稿':'继续等待'}</button>}</div>)}</div>
  </Modal>;
}
