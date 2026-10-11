import { afterEach, describe, expect, it } from 'vitest';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {connect} from 'node:net';
import { createApp } from '../server/app';
import type { Project } from '../shared/types';

const TEST_ROOT = path.resolve('.cache/server-tests');
const running: Server[] = [];
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function fixture(): Project {
  return { schemaVersion: 1, id: '50000000-0000-4000-8000-000000000001', title: '测试电路', revision: 0,
    createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
    source: { name: '电路.png', dataUrl: PHOTO },
    circuit: { components: [{ id:'battery1', type:'battery', label:'电源', value:'3V', x:200, y:200, rotation:0 }], junctions:[], wires:[] },
    lesson: { steps: [{ id:'step1', title:'观察', caption:'观察电源', durationMs:1000, actions:[{type:'highlight',targetIds:['battery1']}] }] },
    uncertainties: [], review: {confirmed:true}, metrics: {workMs:100, editCount:2} };
}
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  running.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('没有服务器地址');
  return `http://127.0.0.1:${address.port}`;
}
async function start(dataDir?: string) {
  await mkdir(TEST_ROOT, {recursive:true});
  dataDir ??= await mkdtemp(path.join(TEST_ROOT, 'case-'));
  const app = await createApp({dataDir});
  const url = await listen(createServer(app));
  const request = async (route: string, body?: unknown, method = body === undefined ? 'GET':'POST', headers: Record<string,string> = {}) => {
    const response = await fetch(url+route, {method, headers: {'Content-Type':'application/json', ...headers}, body:body === undefined ? undefined:JSON.stringify(body)});
    return {status:response.status, body:await response.json() as any};
  };
  return {url, dataDir, request};
}
async function provider(options: {status?:number; content?:unknown; rawContent?:string; delay?:number; extraBytes?:number; error?:unknown} = {}) {
  const calls: {headers: typeof import('node:http').IncomingMessage.prototype.headers; body:any; url:string}[] = [];
  const url = await listen(createServer(async (req,res) => {
    let body=''; for await (const chunk of req) body+=chunk.toString();
    calls.push({headers:req.headers,body:JSON.parse(body),url:req.url??''});
    if(options.delay) await new Promise(resolve=>setTimeout(resolve,options.delay));
    res.writeHead(options.status??200, {'content-type':'application/json'});
    res.end(JSON.stringify(options.status ? {error:options.error??{message:'sk-secret-upstream private diagnostic'}} : {
      model:'local-vision', choices:[{message:{content:options.rawContent ?? JSON.stringify(options.content??{ok:true})}}],
      usage:{prompt_tokens:20,completion_tokens:8,total_tokens:28}, padding: 'x'.repeat(options.extraBytes ?? 0)
    }));
  }));
  return {url,calls};
}
async function configure(api: Awaited<ReturnType<typeof start>>, url:string, extras = {}) {
  return api.request('/api/settings', {baseUrl:`${url}/v1`,model:'local-vision',apiKey:'sk-secret-test',timeoutMs:2000,...extras}, 'PUT');
}
afterEach(async()=>{ await Promise.all(running.splice(0).map(server=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}))); });

describe('local project API',()=>{
  it('accepts provider roots and complete endpoints without duplicating the completion path',async()=>{
    const api=await start();
    for(const [baseUrl,expected] of [
      ['https://api.openai.com','https://api.openai.com/v1'],
      ['https://api.openai.com/v1/chat/completions/','https://api.openai.com/v1'],
      ['https://api.deepseek.com/chat/completions','https://api.deepseek.com'],
      ['https://apihub.agnes-ai.com','https://apihub.agnes-ai.com/v1'],
    ]) {
      const result=await configure(api,baseUrl,{baseUrl});
      expect(result.status).toBe(200);expect(result.body.settings.baseUrl).toBe(expected);
    }
  });
  it('does not reuse a saved key for a different provider origin',async()=>{
    const api=await start();await configure(api,'https://api.openai.com');
    const changed=await api.request('/api/settings',{baseUrl:'https://api.deepseek.com',model:'deepseek-v4-pro',timeoutMs:60000},'PUT');
    expect(changed.body.settings.hasKey).toBe(false);
    expect(changed.body.settings.model).toBe('deepseek-v4-pro');
  });
  it('persists WorkBuddy mode and the JSON compatibility choice without requiring a key',async()=>{
    const api=await start();
    const saved=await api.request('/api/settings',{baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini',timeoutMs:300000,mode:'workbuddy',jsonMode:false},'PUT');
    expect(saved.status).toBe(200);
    expect(saved.body.settings).toMatchObject({mode:'workbuddy',jsonMode:false,timeoutMs:300000,hasKey:false});
    const restarted=await start(api.dataDir);
    expect((await restarted.request('/api/settings')).body.settings.mode).toBe('workbuddy');
  });
  it('persists versioned saves across restart and restores without overwriting history',async()=>{
    const api=await start(); const project=fixture();
    expect((await api.request(`/api/projects/${project.id}`,{project},'PUT')).status).toBe(200);
    const edit={...project,title:'串联电路',revision:2};
    expect((await api.request(`/api/projects/${project.id}`,{project:edit},'PUT')).body.project.title).toBe('串联电路');
    const again=await start(api.dataDir);
    expect((await again.request('/api/projects')).body.projects).toEqual([expect.objectContaining({title:'串联电路',revision:2})]);
    expect((await again.request(`/api/projects/${project.id}/revisions`)).body.revisions.map((r:any)=>r.revision)).toEqual([2,0]);
    const restored=await again.request(`/api/projects/${project.id}/restore`,{revision:0});
    expect(restored.body.project).toMatchObject({title:'测试电路',revision:3});
    expect((await again.request(`/api/projects/${project.id}/revisions`)).body.revisions.map((r:any)=>r.revision)).toEqual([3,2,0]);
  });
  it('accepts identical retry but rejects equal or stale revision replacements',async()=>{
    const api=await start(); const project=fixture();
    await api.request(`/api/projects/${project.id}`,{project},'PUT');
    expect((await api.request(`/api/projects/${project.id}`,{project},'PUT')).status).toBe(200);
    expect((await api.request(`/api/projects/${project.id}`,{project:{...project,title:'覆盖'}},'PUT')).status).toBe(409);
    await api.request(`/api/projects/${project.id}`,{project:{...project,revision:3}},'PUT');
    expect((await api.request(`/api/projects/${project.id}`,{project},'PUT')).status).toBe(409);
    expect((await api.request(`/api/projects/${project.id}`)).body.project.revision).toBe(3);
  });
  it('rejects foreign Host, cross-site writes and unsafe identifiers',async()=>{
    const api=await start();
    expect((await api.request('/api/settings',{},'PUT',{Origin:'https://attacker.example'})).status).toBe(403);
    // Node's fetch strips a caller-supplied Host, so use the actual HTTP wire API.
    const hostileHost = await new Promise<number>((resolve,reject) => {
      const request = httpRequest(api.url+'/api/health',{headers:{Host:'attacker.example:4317'}},response=>{response.resume();resolve(response.statusCode??0);});
      request.on('error',reject);request.end();
    });
    expect(hostileHost).toBe(403);
    expect((await api.request('/api/health',undefined,'GET',{Origin:api.url})).status).toBe(200);
    expect((await api.request('/api/health',undefined,'GET',{Origin:api.url.replace('127.0.0.1','localhost')})).status).toBe(403);
    expect((await api.request('/api/projects/not-a-uuid')).status).toBe(400);
    expect((await api.request('/api/projects/..%2Fsettings')).status).toBe(400);
  });
  it('serializes competing saves and ignores an interrupted temporary revision on restart',async()=>{
    const api=await start();const project=fixture();
    const competing=await Promise.all([
      api.request(`/api/projects/${project.id}`,{project},'PUT'),
      api.request(`/api/projects/${project.id}`,{project:{...project,title:'竞争修改'}},'PUT'),
    ]);
    expect(competing.map(r=>r.status).sort()).toEqual([200,409]);
    const saved=(await api.request(`/api/projects/${project.id}`)).body.project;
    const projectDirectory=path.join(api.dataDir,'projects',project.id);
    const names=await readdir(projectDirectory);
    expect(names).toEqual(['0.json']);
    expect(JSON.parse(await readFile(path.join(projectDirectory,'0.json'),'utf8'))).toEqual(saved);
    const {writeFile}=await import('node:fs/promises');
    await writeFile(path.join(projectDirectory,'99.json.interrupted.tmp'),'{broken','utf8');
    const restarted=await start(api.dataDir);
    expect((await restarted.request(`/api/projects/${project.id}`)).body.project).toEqual(saved);
    expect((await restarted.request(`/api/projects/${project.id}/revisions`)).body.revisions.map((r:any)=>r.revision)).toEqual([0]);
  });
  it('exports JSON asynchronously, reports its actual workspace path and serves the completed file',async()=>{
    const api=await start();const project=fixture();
    project.title='.下载路径验证';
    const started=await api.request('/api/exports',{project,format:'json',timeMs:0});
    expect(started.status).toBe(200);
    let job=started.body.job;
    for(let attempt=0;attempt<50&&!['completed','failed'].includes(job.status);attempt++){
      await new Promise(resolve=>setTimeout(resolve,25));
      job=(await api.request(`/api/exports/${job.id}`)).body.job;
    }
    expect(job.status).toBe('completed');expect(job.progress).toBe(100);
    expect(job.filename).toBe('.下载路径验证.json');
    expect(path.relative(path.resolve('exports'),job.path)).not.toMatch(/^\.\./);
    expect(path.isAbsolute(job.path)).toBe(true);
    expect(JSON.parse(await readFile(job.path,'utf8'))).toEqual(project);
    const downloaded=await fetch(api.url+job.downloadUrl);
    expect(downloaded.status).toBe(200);expect(await downloaded.json()).toEqual(project);
  });
  it('returns JSON for malformed requests and invalid settings without leaking credentials',async()=>{
    const api=await start();
    const raw=await fetch(api.url+'/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{"apiKey":"sk-secret-test",bad'});
    expect(raw.status).toBe(400); expect(await raw.json()).toEqual({error:expect.any(String)});
    expect((await configure(api,'file:///secret')).status).toBe(400);
    expect((await api.request('/api/settings/test',{})).status).toBe(400);
    const saved=await configure(api,'http://127.0.0.1:8000');
    expect(saved.body.settings.hasKey).toBe(true); expect(JSON.stringify(saved.body)).not.toContain('sk-secret');
    const restarted=await start(api.dataDir);
    expect(JSON.stringify((await restarted.request('/api/settings')).body)).not.toContain('sk-secret');
    await configure(api,'http://127.0.0.1:8000',{apiKey:''});
    expect((await api.request('/api/settings')).body.settings.hasKey).toBe(false);
  });
});

describe('real OpenAI-compatible HTTP boundary',()=>{
  it('routes a model request through an explicitly configured HTTP CONNECT proxy',async()=>{
    const mock=await provider();const tunnelServer=createServer();let connections=0;
    tunnelServer.on('connect',(req,socket,head)=>{
      connections++;const [host,port]=req.url!.split(':');const upstream=connect(Number(port),host,()=>{
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
      });
      socket.on('close',()=>upstream.destroy());upstream.on('close',()=>socket.destroy());upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
    });
    const proxyUrl=await listen(tunnelServer);const api=await start();
    await configure(api,mock.url,{proxyMode:'custom',proxyUrl});
    expect((await api.request('/api/settings/test',{})).body.ok).toBe(true);
    expect(connections).toBe(1);expect(mock.calls[0].headers.authorization).toBe('Bearer sk-secret-test');
  });
  it.each([
    {status:401,error:{message:'sk-secret-upstream',code:'invalid_api_key'},hint:'密钥'},
    {status:402,error:{message:'sk-secret-upstream'},hint:'余额'},
    {status:404,error:{message:'sk-secret-upstream',code:'model_not_found'},hint:'模型'},
    {status:429,error:{message:'sk-secret-upstream',code:'insufficient_quota'},hint:'额度'},
    {status:400,error:{message:'response_format is not supported sk-secret-upstream'},hint:'JSON 模式'},
  ])('explains upstream failures without exposing diagnostics ($status)',async({status,error,hint})=>{
    const mock=await provider({status,error});const api=await start();await configure(api,mock.url);
    const result=await api.request('/api/settings/test',{});
    expect(result.status).toBe(502);expect(result.body.error).toContain(hint);
    expect(result.body.error).toContain(String(status));expect(result.body.error).not.toContain('sk-secret');
  });
  it('can call a compatible API that does not support response_format',async()=>{
    const mock=await provider();const api=await start();await configure(api,mock.url,{jsonMode:false});
    expect((await api.request('/api/settings/test',{})).body.ok).toBe(true);
    expect(mock.calls[0].body).not.toHaveProperty('response_format');
    expect(mock.calls[0].body).not.toHaveProperty('temperature');
  });
  it('sends visual content and schema instructions, records usage, and clears stale lessons on recognition',async()=>{
    const project=fixture();
    const mock=await provider({content:{supported:true,circuit:{components:[{...project.circuit.components[0],id:'recognized',label:'识别电源'}],junctions:[],wires:[]},uncertainties:[{id:'u1',message:'请确认电压',targetIds:['recognized'],resolved:false}],summary:'识别完成'}});
    const api=await start(); await configure(api,mock.url);
    await api.request(`/api/projects/${project.id}`,{project},'PUT');
    const result=await api.request('/api/recognize',{project});
    expect(result.status).toBe(200); expect(result.body.proposal.project.circuit.components[0].id).toBe('recognized');
    expect(result.body.proposal.project.lesson.steps).toEqual([]); expect(result.body.proposal.project.review.confirmed).toBe(false);
    expect(result.body.proposal.project.uncertainties[0].message).toBe('请确认电压');
    expect(result.body.proposal.usage.totalTokens).toBe(28);
    expect(mock.calls[0].url).toBe('/v1/chat/completions');
    expect(mock.calls[0].headers.authorization).toBe('Bearer sk-secret-test');
    expect(mock.calls[0].body.messages[1].content).toContainEqual({type:'image_url',image_url:{url:PHOTO}});
    expect(mock.calls[0].body.messages[0].content).toContain('30');
    expect(mock.calls[0].body.response_format).toEqual({type:'json_object'});
    expect(mock.calls[0].body).not.toHaveProperty('temperature');
    expect((await api.request(`/api/projects/${project.id}`)).body.project.circuit.components[0].id).toBe('battery1');
    const usage=await api.request('/api/usage'); expect(usage.body.usage[0]).toMatchObject({model:'local-vision',totalTokens:28});
    expect(JSON.stringify(usage.body)).not.toContain('sk-secret'); expect(JSON.stringify(usage.body)).not.toContain(PHOTO);
  });
  it('lesson proposals preserve circuit, source and metadata despite unrelated model fields',async()=>{
    const project=fixture();
    const mock=await provider({content:{lesson:{steps:[{id:'s-new',title:'说明',caption:'电源提供电压',durationMs:2000,actions:[{type:'highlight',targetIds:['battery1']}]}]},circuit:{components:[],junctions:[],wires:[]},title:'盗改标题',summary:'调整步骤'}});
    const api=await start();await configure(api,mock.url);
    const response=await api.request('/api/propose',{project,prompt:'详细解释电源',mode:'lesson'});
    expect(response.status).toBe(200); const proposed=response.body.proposal.project;
    expect(proposed.circuit).toEqual(project.circuit);expect(proposed.title).toBe('测试电路');expect(proposed.source).toEqual(project.source);expect(proposed.metrics).toEqual(project.metrics);
    expect(proposed.lesson.steps[0].id).toBe('s-new');
  });
  it('rejects industrial recognition without changing the saved project',async()=>{
    const project=fixture();
    const mock=await provider({content:{supported:false,reason:'工业线束',circuit:project.circuit,uncertainties:[]}});
    const api=await start();await configure(api,mock.url);
    await api.request(`/api/projects/${project.id}`,{project},'PUT');
    const response=await api.request('/api/recognize',{project});
    expect(response.status).toBe(422);expect(response.body.error).toContain('基础直流');
    expect((await api.request(`/api/projects/${project.id}`)).body.project).toEqual(project);
  });
  it.each([
    {status:401}, {rawContent:'not-json'}, {content:{circuit:{components:[{id:'broken',type:'battery',x:-50}],junctions:[],wires:[]}}},
  ])('API errors and invalid model structures cannot overwrite saved work (%j)',async(options)=>{
    const mock=await provider(options); const api=await start(); const project=fixture(); await configure(api,mock.url);
    await api.request(`/api/projects/${project.id}`,{project},'PUT');
    const response=await api.request('/api/recognize',{project});
    expect(response.status).toBeGreaterThanOrEqual(400);expect(response.body.error).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('sk-secret');
    expect((await api.request(`/api/projects/${project.id}`)).body.project).toEqual(project);
  });
  it('rejects unsupported or corrupt photo bytes before sending data upstream',async()=>{
    const mock=await provider();const api=await start();await configure(api,mock.url);
    for(const dataUrl of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=','data:image/png;base64,dGhpcyBpcyBub3QgYSBwaG90bw==']) {
      const response=await api.request('/api/recognize',{project:{...fixture(),source:{name:'bad',dataUrl}}});
      expect(response.status).toBe(400);
    }
    expect(mock.calls).toHaveLength(0);
  });
  it('uses real connectivity call and records its tokens; timeout returns a safe error',async()=>{
    const mock=await provider();const api=await start();await configure(api,mock.url);
    expect((await api.request('/api/settings/test',{})).body.ok).toBe(true);
    expect((await api.request('/api/usage')).body.usage[0].totalTokens).toBe(28);
    const slow=await provider({delay:1400});await configure(api,slow.url,{timeoutMs:1000});
    const result=await api.request('/api/settings/test',{});
    expect(result.status).toBe(504);expect(result.body.error).toMatch(/超时/);
  });
  it('bounds upstream response size and preserves token accounting for invalid model JSON',async()=>{
    const oversized=await provider({extraBytes:2*1024*1024});const api=await start();await configure(api,oversized.url);
    const response=await api.request('/api/settings/test',{});
    expect(response.status).toBe(502);expect(response.body.error).toContain('2MB');
    const invalid=await provider({rawContent:'<script>private diagnostic</script>'});await configure(api,invalid.url);
    expect((await api.request('/api/settings/test',{})).status).toBe(502);
    expect((await api.request('/api/usage')).body.usage).toHaveLength(1);
  });
});
