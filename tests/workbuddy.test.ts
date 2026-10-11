import {afterEach,expect,it} from 'vitest';
import {createServer,type Server} from 'node:http';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {createApp} from '../server/app';
import {createExample} from '../shared/examples';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const running:Server[]=[];
async function start(dataDir?:string) {
  const root=path.resolve('.cache/workbuddy-tests');await mkdir(root,{recursive:true});
  dataDir??=await mkdtemp(path.join(root,'case-'));
  const server=createServer(await createApp({dataDir}));running.push(server);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('没有端口');
  const url=`http://127.0.0.1:${address.port}`;
  const request=async(route:string,body?:unknown,method=body===undefined?'GET':'POST')=>{
    const response=await fetch(`${url}/api${route}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json() as any};
  };
  await request('/settings',{baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini',timeoutMs:60000,mode:'workbuddy'},'PUT');
  return {request,dataDir,url};
}
afterEach(async()=>{await Promise.all(running.splice(0).map(server=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})));});

it('queues a lesson task without an API key and returns a validated preview without changing saved wiring',async()=>{
  const api=await start();const project=createExample('series');
  await api.request(`/projects/${project.id}`,{project},'PUT');
  const queued=await api.request('/propose',{project,prompt:'先介绍电源',mode:'lesson'});
  expect(queued.status).toBe(202);expect(queued.body.task.status).toBe('pending');
  const id=queued.body.task.id;
  const input=await api.request(`/workbuddy/tasks/${id}/input`);
  expect(input.status).toBe(200);expect(JSON.stringify(input.body)).toContain('先介绍电源');
  expect(input.body).not.toHaveProperty('settings');expect(JSON.stringify(input.body)).not.toContain('apiKey');
  const returned=await api.request(`/workbuddy/tasks/${id}/result`,{content:{lesson:{steps:[]},circuit:{components:[],wires:[],junctions:[]},summary:'调整演示'}});
  expect(returned.status).toBe(200);
  const ready=await api.request(`/workbuddy/tasks/${id}`);
  expect(ready.body.task.status).toBe('completed');
  expect(ready.body.task.proposal.project.circuit).toEqual(project.circuit);
  expect(ready.body.task.proposal.baseRevision).toBe(project.revision);
  expect((await api.request(`/projects/${project.id}`)).body.project).toEqual(project);
});
it('persists pending tasks across server restart and rejects invalid results while allowing a corrected retry',async()=>{
  const api=await start();const project=createExample('series');
  const queued=await api.request('/propose',{project,prompt:'整理线路',mode:'circuit'});
  expect(queued.status).toBe(202);const id=queued.body.task.id;
  const restarted=await start(api.dataDir);
  expect((await restarted.request('/workbuddy/tasks')).body.tasks[0].id).toBe(id);
  expect((await restarted.request(`/workbuddy/tasks/${id.toUpperCase()}`)).status).toBe(200);
  const invalid=await restarted.request(`/workbuddy/tasks/${id}/result`,{content:{circuit:{components:[{id:'bad',type:'battery',x:-10}]}}});
  expect(invalid.status).toBeGreaterThanOrEqual(400);
  expect((await restarted.request(`/workbuddy/tasks/${id}`)).body.task.status).toBe('pending');
  expect((await restarted.request(`/workbuddy/tasks/${id}/result`,{content:{circuit:project.circuit,summary:'校正完成'}})).status).toBe(200);
});
it.each(['missing','wrong-type'])('rejects invalid lesson targets (%s), keeps the task retryable and preserves the saved project',async(reason)=>{
  const api=await start();const project=createExample('series');
  await api.request(`/projects/${project.id}`,{project},'PUT');
  const queued=await api.request('/propose',{project,prompt:'先高亮电源',mode:'lesson'});const id=queued.body.task.id;
  const battery=project.circuit.components.find(component=>component.type==='battery')!;
  const actions=reason==='missing'?[{type:'highlight',targetIds:['no-such-component']}]:[{type:'lamp',targetIds:[battery.id]}];
  const invalid=await api.request(`/workbuddy/tasks/${id}/result`,{content:{lesson:{steps:[{id:'intro',title:'电源',caption:'介绍电源',durationMs:2000,actions}]}}});
  expect(invalid.status).toBe(502);
  expect((await api.request(`/workbuddy/tasks/${id}`)).body.task.status).toBe('pending');
  expect((await api.request(`/projects/${project.id}`)).body.project).toEqual(project);
  expect((await api.request(`/workbuddy/tasks/${id}/result`,{content:{lesson:project.lesson}})).status).toBe(200);
});
it('still previews circuit changes when existing lesson references need repair',async()=>{
  const api=await start();const project=createExample('series');
  const queued=await api.request('/propose',{project,prompt:'清空线路',mode:'circuit'});
  const returned=await api.request(`/workbuddy/tasks/${queued.body.task.id}/result`,{content:{circuit:{components:[],wires:[],junctions:[]}}});
  expect(returned.status).toBe(200);expect(returned.body.task.proposal.project.lesson).toEqual(project.lesson);
});
it('returns the uploaded image to the MCP task and keeps uncertain recognition unconfirmed',async()=>{
  const api=await start();const project=createExample('series');
  project.source={name:'电路.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='};
  const queued=await api.request('/recognize',{project});expect(queued.status).toBe(202);
  const id=queued.body.task.id;
  const input=await api.request(`/workbuddy/tasks/${id}/input`);
  expect(JSON.stringify(input.body.messages)).toContain(project.source.dataUrl);
  await api.request(`/workbuddy/tasks/${id}/result`,{content:{circuit:project.circuit,uncertainties:[{id:'u1',message:'请确认数值',targetIds:[project.circuit.components[0].id],resolved:true}]}});
  const ready=await api.request(`/workbuddy/tasks/${id}`);
  expect(ready.body.task.proposal.project.review.confirmed).toBe(false);
  expect(ready.body.task.proposal.project.uncertainties[0].resolved).toBe(false);
  expect(ready.body.task.proposal.project.lesson.steps).toEqual([]);
});
it('cancels a queued task and cannot apply a late model reply',async()=>{
  const api=await start();const project=createExample('series');
  const queued=await api.request('/propose',{project,prompt:'讲解串联',mode:'lesson'});expect(queued.status).toBe(202);
  const id=queued.body.task.id;
  expect((await api.request(`/workbuddy/tasks/${id}/cancel`,{})).body.task.status).toBe('cancelled');
  expect((await api.request(`/workbuddy/tasks/${id}/result`,{content:{lesson:{steps:[]}}})).status).toBe(409);
});
it('tests MCP availability separately from model credentials or vision capability',async()=>{
  const api=await start();
  const offline=await api.request('/settings/test',{});expect(offline.body.error).toContain('WorkBuddy');
  expect((await api.request('/workbuddy/connect',{})).status).toBe(200);
  const online=await api.request('/settings/test',{});
  expect(online.body.ok).toBe(true);expect(online.body.message).toContain('插件');
  expect(online.body.message).not.toContain('模型连接正常');
});
it('exposes queued photos through real MCP stdio and accepts a structured draft back into the same preview flow',async()=>{
  const api=await start();const project=createExample('series');
  project.source={name:'test.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='};
  const queued=await api.request('/recognize',{project});expect(queued.status).toBe(202);
  const client=new Client({name:'circuit-test',version:'1.0'},{capabilities:{}});
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
  const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('scripts/workbuddy-mcp.mjs')],cwd:path.resolve('.'),env:{...env,CIRCUIT_TEACHER_URL:api.url},stderr:'pipe'});
  try{
    await expect(client.connect(transport)).resolves.toBeUndefined();
    expect((await client.listTools()).tools.map(tool=>tool.name)).toContain('circuit_submit_result');
    const input=await client.callTool({name:'circuit_get_task',arguments:{taskId:queued.body.task.id}});
    expect((input.content as any[]).find(block=>block.type==='image')).toMatchObject({mimeType:'image/png',data:project.source.dataUrl.split(',')[1]});
    const submitted=await client.callTool({name:'circuit_submit_result',arguments:{taskId:queued.body.task.id,content:{circuit:project.circuit,uncertainties:[],summary:'MCP 返回草稿'}}});
    expect(submitted.isError).not.toBe(true);
    expect((await api.request(`/workbuddy/tasks/${queued.body.task.id}`)).body.task.proposal.summary).toBe('MCP 返回草稿');
  }finally{await client.close();await transport.close();}
});
