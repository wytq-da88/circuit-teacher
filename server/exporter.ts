import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { validateProject, getExportIssues } from '../shared/model';
import { buildCompositionHtml, buildOfflineHtml, renderScene } from '../shared/scene';
import type { ExportFormat, ExportJob, Project } from '../shared/types';
import { resolveExecutable, runtimeEnvironment } from '../scripts/runtime-tools.cjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const exportsRoot=path.join(root,'exports');
const formats=new Set(['png','svg','pdf','html','mp4','json']);
const jobs=new Map<string,ExportJob>();
let queue:Promise<void>=Promise.resolve();

function fileName(title:string,format:ExportFormat):string {
  const clean=title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,70)||'电路课件';
  return `${/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean)?'课件_'+clean:clean}.${format}`;
}
export function getExportJob(id:string):ExportJob|undefined {const job=jobs.get(id);return job?{...job}:undefined;}
export function getExportFile(id:string):string|undefined {const job=jobs.get(id);return job?.status==='completed'?job.path:undefined;}
export async function createExportJob(input:Project,format:ExportFormat,timeMs=0):Promise<ExportJob> {
  if(!formats.has(format))throw new Error('不支持的导出格式');
  if(!Number.isFinite(timeMs)||timeMs<0)throw new Error('导出时间无效');
  const project=validateProject(input);
  if(format!=='json') {
    const issues=getExportIssues(project);
    if(issues.length)throw new Error(issues.join('；'));
    if((format==='mp4'||format==='html')&&!project.lesson.steps.length)throw new Error('请先添加至少一个课件步骤');
  }
  const id=randomUUID(),job:ExportJob={id,status:'queued',progress:0,format,filename:fileName(project.title,format)};
  jobs.set(id,job);
  // A queue caps browser memory and prevents concurrent video encoders competing.
  queue=queue.catch(()=>undefined).then(()=>runExport(structuredClone(project),job,timeMs));
  return {...job};
}
async function runExport(project:Project,job:ExportJob,timeMs:number):Promise<void> {
  const directory=path.join(exportsRoot,job.id),output=path.join(directory,job.filename!);
  try {
    job.status='running';job.progress=5;
    await mkdir(directory,{recursive:true});
    if(job.format==='json')await writeFile(output,JSON.stringify(project,null,2),'utf8');
    else if(job.format==='svg')await writeFile(output,renderScene(project,timeMs),'utf8');
    else if(job.format==='html')await writeFile(output,buildOfflineHtml(project),'utf8');
    else if(job.format==='mp4')await renderVideo(project,job,directory,output);
    else await renderDocument(project,job,directory,output,timeMs);
    if((await stat(output)).size===0)throw new Error('导出文件为空');
    job.path=output;job.downloadUrl=`/api/exports/${job.id}/file`;job.progress=100;job.status='completed';
  } catch(error) { job.status='failed';job.error=error instanceof Error?error.message:'导出失败，请重试'; }
  await writeFile(path.join(directory,'作业信息.json'),JSON.stringify(job,null,2),'utf8').catch(()=>undefined);
}
async function renderDocument(project:Project,job:ExportJob,directory:string,output:string,timeMs:number):Promise<void> {
  const browserPath=resolveExecutable('browser',{root});
  if(!browserPath)throw new Error('未找到用于 PNG/PDF 导出的 Chrome/Edge 浏览器，请配置 CIRCUIT_BROWSER_PATH，或运行 npm run setup:video 安装浏览器');
  const browser=await puppeteer.launch({executablePath:browserPath,headless:true,userDataDir:path.join(directory,'browser-profile'),env:runtimeEnvironment(root),args:['--disable-gpu','--no-first-run','--disable-background-networking','--disable-extensions'],timeout:45000});
  try {
    const page=await browser.newPage();
    await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
    await page.setRequestInterception(true);page.on('request',request=>void request.abort());
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:1920px 1080px;margin:0}html,body{margin:0;width:1920px;height:1080px}svg{display:block;width:1920px;height:1080px}</style></head><body>${renderScene(project,timeMs)}</body></html>`,{waitUntil:'load'});
    await page.evaluate(()=>document.fonts.ready);job.progress=65;
    if(job.format==='png')await page.screenshot({path:output as `${string}.png`,type:'png',clip:{x:0,y:0,width:1920,height:1080}});
    else await page.pdf({path:output,width:'1920px',height:'1080px',printBackground:true,preferCSSPageSize:true});
  } finally {await browser.close();}
}
async function renderVideo(project:Project,job:ExportJob,directory:string,output:string):Promise<void> {
  const browserPath=resolveExecutable('videoBrowser',{root});
  const ffmpegPath=resolveExecutable('ffmpeg',{root}),ffprobePath=resolveExecutable('ffprobe',{root});
  if(!browserPath)throw new Error('MP4 导出需要兼容的 Chrome Headless Shell。请运行 npm run setup:video，或配置 CIRCUIT_VIDEO_BROWSER_PATH');
  if(!ffmpegPath||!ffprobePath)throw new Error('MP4 导出需要 FFmpeg 和 FFprobe。请放入 .tools/ffmpeg/bin，加入 PATH，或配置 CIRCUIT_FFMPEG_PATH / CIRCUIT_FFPROBE_PATH');
  const env={...runtimeEnvironment(root),HYPERFRAMES_BROWSER_PATH:browserPath,PRODUCER_HEADLESS_SHELL_PATH:browserPath,HYPERFRAMES_FFMPEG_PATH:ffmpegPath,HYPERFRAMES_FFPROBE_PATH:ffprobePath};
  await writeFile(path.join(directory,'index.html'),buildCompositionHtml(project),'utf8');
  job.progress=10;
  const cli=path.join(root,'node_modules','hyperframes','bin','hyperframes.mjs');
  let log='';
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,'render',directory,'--output',output,'--fps','30','--quality','high','--workers','1','--no-browser-gpu','--no-best-effort'],{cwd:directory,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>{child.kill();reject(new Error('视频导出超过 30 分钟，请缩短课件后重试'));},30*60*1000);
    const receive=(chunk:Buffer)=>{const text=chunk.toString('utf8');log=(log+text).slice(-200000);const matches=[...text.matchAll(/(\d{1,3})(?:\.\d+)?%/g)];if(matches.length)job.progress=Math.max(job.progress,Math.min(95,10+Math.round(Number(matches.at(-1)![1])*0.85)));};
    child.stdout.on('data',receive);child.stderr.on('data',receive);
    child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);void writeFile(path.join(directory,'渲染日志.txt'),log,'utf8');if(code===0)resolve();else reject(new Error(`HyperFrames 视频渲染失败（退出码 ${code}），请查看 exports/${job.id}/渲染日志.txt。${log.slice(-1200)}`));});
  });
}
