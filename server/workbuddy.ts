import {randomUUID} from 'node:crypto';
import {mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import type {ChangeMode,Project,WorkBuddyTask} from '../shared/types';
import {validateProject} from '../shared/model';
import {ApiError,isRecord} from './errors';
import {atomicJson,readJson,serialized} from './store';
import {proposalMessages,recognitionMessages} from './provider';
import {validateModelProposal} from './proposal-validation';

interface TaskRecord extends WorkBuddyTask {project:Project;prompt?:string}
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class WorkBuddyQueue {
  readonly directory:string;
  private lastSeen=0;
  constructor(dataDir:string){this.directory=path.join(dataDir,'workbuddy','tasks');}
  async init(){await mkdir(this.directory,{recursive:true});}
  private filename(id:string){if(!ID.test(id))throw new ApiError(400,'WorkBuddy 任务编号无效');return path.join(this.directory,`${id.toLowerCase()}.json`);}
  private async read(id:string):Promise<TaskRecord>{
    const input=await readJson(this.filename(id));
    if(input===undefined)throw new ApiError(404,'WorkBuddy 任务不存在');
    if(!isRecord(input)||input.id!==id.toLowerCase())throw new ApiError(500,'WorkBuddy 任务文件无法读取，请保留数据目录');
    const task=input as unknown as TaskRecord;task.project=validateProject(task.project);return task;
  }
  private publicTask(task:TaskRecord,includeProposal=true):WorkBuddyTask {
    const {project:_project,prompt:_prompt,proposal,...summary}=task;
    return includeProposal&&proposal?{...summary,proposal}:summary;
  }
  async list():Promise<WorkBuddyTask[]>{
    const names=(await readdir(this.directory)).filter(name=>ID.test(name.replace(/\.json$/,''))&&name.endsWith('.json'));
    const tasks:WorkBuddyTask[]=[];
    // Archived records may contain two copies of a photo. Keep only summaries between reads.
    for(const name of names)tasks.push(this.publicTask(await this.read(name.slice(0,-5)),false));
    return tasks.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  async create(project:Project,kind:'recognize'|'propose',mode?:ChangeMode,prompt?:string):Promise<WorkBuddyTask>{
    return serialized(this.directory,async()=>{
      if((await this.list()).filter(task=>task.status==='pending').length>=20)throw new ApiError(409,'已有 20 个 WorkBuddy 待办，请先完成或取消已有任务');
      const now=new Date().toISOString();
      const task:TaskRecord={id:randomUUID(),kind,mode,project:structuredClone(project),prompt,projectId:project.id,projectTitle:project.title,baseRevision:project.revision,createdAt:now,updatedAt:now,status:'pending'};
      await atomicJson(this.filename(task.id),task);return this.publicTask(task);
    });
  }
  async get(id:string){return this.publicTask(await this.read(id));}
  async input(id:string){
    const task=await this.read(id);if(task.status!=='pending')throw new ApiError(409,'任务已完成或取消，无需再次处理');
    const messages=task.kind==='recognize'?recognitionMessages(task.project):proposalMessages(task.project,task.prompt??'',task.mode!);
    return {task:this.publicTask(task,false),messages};
  }
  async complete(id:string,content:unknown):Promise<WorkBuddyTask>{
    return serialized(this.filename(id),async()=>{
      const task=await this.read(id);if(task.status!=='pending')throw new ApiError(409,'任务已完成或取消，不能覆盖已有结果');
      if(!isRecord(content)||Buffer.byteLength(JSON.stringify(content),'utf8')>2*1024*1024)throw new ApiError(400,'请提交不超过 2MB 的 JSON 草稿');
      const proposal=validateModelProposal(task.project,task.kind,task.mode,content);
      const next:TaskRecord={...task,status:'completed',proposal,updatedAt:new Date().toISOString()};
      await atomicJson(this.filename(id),next);return this.publicTask(next);
    });
  }
  async cancel(id:string):Promise<WorkBuddyTask>{
    return serialized(this.filename(id),async()=>{
      const task=await this.read(id);if(task.status!=='pending')throw new ApiError(409,'任务已结束，不能取消');
      const next:TaskRecord={...task,status:'cancelled',updatedAt:new Date().toISOString()};await atomicJson(this.filename(id),next);return this.publicTask(next);
    });
  }
  connect(){this.lastSeen=Date.now();return this.status();}
  status(){return {connected:this.lastSeen>0&&Date.now()-this.lastSeen<45000,lastSeenAt:this.lastSeen?new Date(this.lastSeen).toISOString():undefined};}
}
