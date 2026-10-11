import express, { type ErrorRequestHandler } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject } from '../shared/model';
import type { ExportFormat, ExportJob, Project } from '../shared/types';
import { ApiError } from './errors';
import { callProvider, connectivityMessages, proposalMessages, recognitionMessages } from './provider';
import { LocalStore, publicSettings } from './store';
import {WorkBuddyQueue} from './workbuddy';
import {validateModelProposal} from './proposal-validation';
import {systemProxy} from './network';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
interface AppOptions { dataDir?: string }

function inputProject(input: unknown): Project {
  try { return validateProject(input); }
  catch { throw new ApiError(400, '工程数据校验失败，请检查元件、连线和课件字段'); }
}
function safeJob(job: ExportJob) {
  return { ...job };
}
export async function createApp(options: AppOptions = {}) {
  const app = express();
  const store = new LocalStore(options.dataDir ?? path.join(PROJECT_ROOT, 'data'));
  await store.init();
  const workbuddy=new WorkBuddyQueue(store.dataDir);await workbuddy.init();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.headers.host;
    // Bind security to the accepted socket, never proxy headers supplied by the caller.
    const allowedHosts = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`];
    if (!host || !allowedHosts.includes(host.toLowerCase())) return next(new ApiError(403, '仅允许从本机地址访问'));
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== `http://${host}`) return next(new ApiError(403, '拒绝跨站请求'));
    if (req.headers['sec-fetch-site'] === 'cross-site') return next(new ApiError(403, '拒绝跨站请求'));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16mb', strict: true }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'circuit-teacher' }));
  app.get('/api/projects', async (_req, res) => res.json({ projects: await store.listProjects() }));
  app.get('/api/projects/:id', async (req, res) => res.json({ project: await store.getProject(req.params.id) }));
  app.put('/api/projects/:id', async (req, res) => {
    const project = inputProject(req.body?.project);
    res.json({ project: await store.saveProject(req.params.id, project) });
  });
  app.get('/api/projects/:id/revisions', async (req, res) => res.json({ revisions: await store.revisions(req.params.id) }));
  app.post('/api/projects/:id/restore', async (req, res) => res.json({ project: await store.restoreProject(req.params.id, req.body?.revision) }));
  app.get('/api/settings', async (_req, res) => res.json({ settings: publicSettings(await store.getSettings()) }));
  app.get('/api/settings/system-proxy',async(_req,res)=>res.json({proxyUrl:await systemProxy()??''}));
  app.put('/api/settings', async (req, res) => res.json({ settings: publicSettings(await store.saveSettings(req.body)) }));
  app.get('/api/usage', async (_req, res) => res.json({ usage: await store.usage() }));
  app.post('/api/settings/test', async (_req, res) => {
    const settings=await store.getSettings();
    if(settings.mode==='workbuddy'){
      if(!workbuddy.status().connected)throw new ApiError(409,'WorkBuddy 插件尚未连接，请在 WorkBuddy 中启用工坊的 MCP 配置后重试');
      res.json({ok:true,message:'WorkBuddy 本地插件已连接；模型与图片能力请在 WorkBuddy 中完成实际任务验证'});return;
    }
    const result = await callProvider(settings, connectivityMessages, usage => store.recordUsage(usage));
    if (result.content.ok !== true) throw new ApiError(502, '模型返回内容不符合连接测试格式');
    res.json({ ok: true, message: '模型连接正常，已收到有效 JSON 响应' });
  });
  app.post('/api/recognize', async (req, res) => {
    const project = inputProject(req.body?.project);
    const messages = recognitionMessages(project);
    const settings=await store.getSettings();
    if(settings.mode==='workbuddy'){res.status(202).json({task:await workbuddy.create(project,'recognize')});return;}
    const { content, usage } = await callProvider(settings, messages, value => store.recordUsage(value));
    res.json({proposal:validateModelProposal(project,'recognize',undefined,content,usage)});
  });
  app.post('/api/propose', async (req, res) => {
    const project = inputProject(req.body?.project);
    const { mode, prompt } = req.body ?? {};
    if (mode !== 'circuit' && mode !== 'lesson') throw new ApiError(400, '请选择电路或演示修改模式');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new ApiError(400, '请填写 1–8000 字的修改要求');
    const settings=await store.getSettings();
    if(settings.mode==='workbuddy'){res.status(202).json({task:await workbuddy.create(project,'propose',mode,prompt.trim())});return;}
    const { content, usage } = await callProvider(settings, proposalMessages(project, prompt.trim(), mode), value => store.recordUsage(value));
    res.json({proposal:validateModelProposal(project,'propose',mode,content,usage)});
  });
  app.get('/api/workbuddy/setup',(_req,res)=>res.json({configuration:{mcpServers:{'circuit-teacher':{type:'stdio',command:process.execPath,args:[path.join(PROJECT_ROOT,'scripts','workbuddy-mcp.mjs')]}}}}));
  app.get('/api/workbuddy/status',(_req,res)=>res.json(workbuddy.status()));
  app.post('/api/workbuddy/connect',(_req,res)=>res.json(workbuddy.connect()));
  app.get('/api/workbuddy/tasks',async(_req,res)=>res.json({tasks:await workbuddy.list()}));
  app.get('/api/workbuddy/tasks/:id',async(req,res)=>res.json({task:await workbuddy.get(req.params.id)}));
  app.get('/api/workbuddy/tasks/:id/input',async(req,res)=>res.json(await workbuddy.input(req.params.id)));
  app.post('/api/workbuddy/tasks/:id/result',async(req,res)=>res.json({task:await workbuddy.complete(req.params.id,req.body?.content)}));
  app.post('/api/workbuddy/tasks/:id/cancel',async(req,res)=>res.json({task:await workbuddy.cancel(req.params.id)}));
  app.post('/api/exports', async (req, res) => {
    const project = inputProject(req.body?.project);
    const { format, timeMs = 0 } = req.body ?? {};
    if (!['png', 'svg', 'pdf', 'html', 'mp4', 'json'].includes(format)) throw new ApiError(400, '导出格式无效');
    if (typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs < 0 || timeMs > 600000) throw new ApiError(400, '导出时间无效');
    const exporter = await import('./exporter');
    try { res.json({ job: safeJob(await exporter.createExportJob(project, format as ExportFormat, timeMs)) }); }
    catch { throw new ApiError(400, '导出未能启动，请检查电路、校对与课件步骤'); }
  });
  app.get('/api/exports/:id', async (req, res) => {
    const { getExportJob } = await import('./exporter');
    const job = getExportJob(req.params.id);
    if (!job) throw new ApiError(404, '导出任务不存在');
    res.json({ job: safeJob(job) });
  });
  app.get('/api/exports/:id/file', async (req, res, next) => {
    const { getExportJob, getExportFile } = await import('./exporter');
    const job = getExportJob(req.params.id);
    const filename = getExportFile(req.params.id);
    if (!job || job.status !== 'completed' || !filename) throw new ApiError(404, '导出文件尚未就绪');
    const directory=path.join(PROJECT_ROOT,'exports'),relative=path.relative(directory,filename);
    if (!relative || relative==='..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new ApiError(403,'导出文件路径无效');
    // Only this completed job's file is served, including user titles beginning with a dot.
    res.download(relative, job.filename ?? path.basename(filename), {root:directory,dotfiles:'allow'}, error => { if (error) next(new ApiError(500, '下载文件失败，请重新导出')); });
  });
  app.use('/api', (_req, _res, next) => next(new ApiError(404, '接口不存在')));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof ApiError) { res.status(error.status).json({ error: error.message }); return; }
    if (error?.type === 'entity.too.large') { res.status(413).json({ error: '请求超过 16MB 限制' }); return; }
    if (error instanceof SyntaxError || error instanceof URIError) { res.status(400).json({ error: '请求内容不是有效 JSON 或地址格式无效' }); return; }
    res.status(500).json({ error: '本机服务处理失败，请检查数据目录权限后重试' });
  };
  app.use(errorHandler);
  return app;
}
