import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import runtime from './runtime-tools.cjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
Object.assign(process.env,runtime.runtimeEnvironment(root));
const local=new URL(process.env.CIRCUIT_TEACHER_URL||'http://127.0.0.1:4317');
if(local.protocol!=='http:'||!['127.0.0.1','localhost'].includes(local.hostname)||local.username||local.password||local.search||local.hash||local.pathname!=='/')throw new Error('Circuit Teacher URL must be a local HTTP origin.');

async function api(route,body){
  let response;
  try{response=await fetch(`${local.origin}/api${route}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}
  catch{throw new Error('无法连接本机工坊，请先双击项目目录里的 start.cmd。');}
  let result;try{result=await response.json();}catch{throw new Error('本机工坊响应格式不正确，请检查服务。');}
  if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'工坊未能处理请求。');
  return result;
}
const server=new McpServer({name:'circuit-teacher',version:'0.1.1'},{instructions:'本地电路课件工坊。只在用户要求时处理待办；读取任务内的输出格式，用当前模型生成 JSON 草稿，调用 circuit_submit_result 回传。网页用户确认后才应用。照片任务需要当前模型能理解图片。不要执行模型生成的脚本，不要读取其他应用凭据，不要声称进行了物理仿真。'});
const taskId=z.string().uuid();
const safe=handler=>async args=>{try{return await handler(args);}catch(error){return {isError:true,content:[{type:'text',text:error instanceof Error?error.message:'任务未完成，请重试。'}]};}};

server.registerTool('circuit_list_tasks',{
  title:'查看电路工坊待办',description:'列出用户在电路课件工坊主动提交的待办。只处理用户要求的任务。',inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:false},
},safe(async()=>{
  const {tasks}=await api('/workbuddy/tasks');
  return {content:[{type:'text',text:JSON.stringify({tasks:tasks.filter(task=>task.status==='pending'),next:'调用 circuit_get_task 读取指定任务，生成符合其约定的 JSON 并回传。'})}]};
}));
server.registerTool('circuit_get_task',{
  title:'读取电路工坊任务和照片',description:'取得指定任务的电路、讲解与输出格式。照片作为 MCP image 内容交给当前模型，不猜测无法看清的线路或数值。',inputSchema:{taskId},annotations:{readOnlyHint:true,openWorldHint:false},
},safe(async({taskId})=>{
  const {task,messages}=await api(`/workbuddy/tasks/${taskId}/input`);
  const instructions=[];const images=[];
  for(const message of messages){
    if(typeof message.content==='string')instructions.push({role:message.role,text:message.content});
    else for(const part of message.content){
      if(part.type==='text')instructions.push({role:message.role,text:part.text});
      if(part.type==='image_url'){
        const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(part.image_url.url);
        if(!match)throw new Error('照片格式无效，请在工坊重新上传。');
        images.push({type:'image',mimeType:match[1],data:match[2]});
      }
    }
  }
  return {content:[{type:'text',text:JSON.stringify({task,instructions,reply:'生成数据后调用 circuit_submit_result；content 参数是 JSON 对象，无需写文件。请等待工坊中的人工确认。'})},...images]};
}));
server.registerTool('circuit_submit_result',{
  title:'回传待确认电路草稿',description:'回传当前模型生成的结构化草稿。服务器校验元件、连接和时间轴；无效草稿会拒绝，用户可在网页预览后确认。不会直接覆盖现有工程。',inputSchema:{taskId,content:z.record(z.string(),z.unknown())},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},
},safe(async({taskId,content})=>{
  const {task}=await api(`/workbuddy/tasks/${taskId}/result`,{content});
  return {content:[{type:'text',text:JSON.stringify({taskId:task.id,status:task.status,summary:task.proposal.summary,message:'草稿已回传，请回到电路课件工坊预览并确认。模型用量在当前客户端的套餐与用量中查看。'})}]};
}));
let heartbeat;
server.server.oninitialized=()=>{
  const connect=()=>api('/workbuddy/connect',{}).catch(()=>undefined);
  void connect();heartbeat=setInterval(()=>void connect(),15000);heartbeat.unref();
};
server.server.onclose=()=>clearInterval(heartbeat);
await server.connect(new StdioServerTransport());
