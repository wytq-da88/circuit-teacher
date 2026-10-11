import { createExample } from '../shared/examples';
import { createExportJob, getExportJob, getExportFile } from '../server/exporter';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { resolveExecutable, runtimeEnvironment } from '../scripts/runtime-tools.cjs';
import { renderScene } from '../shared/scene';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const project=createExample('switch');project.title='开关控制·导出验收';
if(process.argv.includes('--short'))project.lesson.steps.forEach(step=>{step.durationMs=1000;});
const formats=process.argv.includes('--video-only')?['mp4'] as const:['json','svg','html','png','pdf','mp4'] as const;
const results=[];
const evidence=path.join(root,'logs','export-verification');await mkdir(evidence,{recursive:true});
for(const format of formats) {
  const created=await createExportJob(project,format,4500);
  let job=getExportJob(created.id)!;
  console.log(format,created.id);
  while(job.status==='running'||job.status==='queued'){await new Promise(r=>setTimeout(r,500));job=getExportJob(created.id)!;}
  assert.equal(job.status,'completed',JSON.stringify(job));results.push(job);console.log(JSON.stringify(job));
  if(format==='json')assert.deepEqual(JSON.parse(await readFile(getExportFile(job.id)!,'utf8')),project);
  if(format==='html') {
    const profile=path.join(root,'.cache','offline-verify');await mkdir(profile,{recursive:true});
    const executablePath=resolveExecutable('browser',{root});assert.ok(executablePath,'Install Chrome/Edge or run npm run setup:video');
    const browser=await puppeteer.launch({executablePath,headless:true,userDataDir:profile,env:runtimeEnvironment(root),args:['--disable-background-networking','--no-first-run']});
    try {
      const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));await page.setOfflineMode(true);
      await page.goto(pathToFileURL(job.path!).href);await page.waitForSelector('#play');
      assert.equal(await page.$$eval('[data-lit="true"]',nodes=>nodes.length),0);
      await page.click('#next');assert.equal(await page.$eval('[data-component="lamp1"]',node=>node.getAttribute('data-lit')),'true');
      await page.click('#switches button');assert.equal(await page.$eval('[data-component="lamp1"]',node=>node.getAttribute('data-lit')),'false');
      assert.equal(await page.$$eval('[data-current]',nodes=>nodes.length),0);
      await page.click('#reset');assert.equal(await page.$eval('[data-component="lamp1"]',node=>node.getAttribute('data-lit')),'true');
      await page.click('#play');await new Promise(r=>setTimeout(r,150));await page.click('#play');const t1=await page.$eval('#seek',node=>(node as HTMLInputElement).value);await new Promise(r=>setTimeout(r,100));assert.equal(await page.$eval('#seek',node=>(node as HTMLInputElement).value),t1);
      await page.screenshot({path:path.join(evidence,'export-offline.png'),fullPage:true});assert.deepEqual(errors,[]);
    }finally{await browser.close();}
  }
  if(format==='mp4') {
    const ffprobe=resolveExecutable('ffprobe',{root});assert.ok(ffprobe);
    const probe=await promisify(execFile)(ffprobe,['-v','error','-show_streams','-show_format','-of','json',job.path!],{env:runtimeEnvironment(root),windowsHide:true});
    const metadata=JSON.parse(probe.stdout),video=metadata.streams.find((stream:{codec_type:string})=>stream.codec_type==='video');
    assert.ok(video,'MP4 must contain a video stream');assert.equal(video.width,1920);assert.equal(video.height,1080);
    const expected=project.lesson.steps.reduce((total,step)=>total+step.durationMs,0)/1000;
    assert.ok(Math.abs(Number(metadata.format.duration)-expected)<0.2,`Expected ${expected}s video, got ${metadata.format.duration}s`);
    await writeFile(path.join(evidence,'video-metadata.json'),JSON.stringify(metadata,null,2),'utf8');
    const ffmpeg=resolveExecutable('ffmpeg',{root}),executablePath=resolveExecutable('videoBrowser',{root});
    assert.ok(ffmpeg);assert.ok(executablePath);
    const browser=await puppeteer.launch({executablePath,headless:true,userDataDir:path.join(evidence,'frame-profile'),env:runtimeEnvironment(root),args:['--disable-gpu','--no-first-run','--disable-background-networking']});
    const frameChecks=[];
    try {
      const page=await browser.newPage();await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
      await page.setRequestInterception(true);page.on('request',request=>void request.abort());
      const totalFrames=Math.round(expected*30);
      for(const frame of [0,Math.floor(totalFrames/2),totalFrames-1]) {
        const actual=path.join(evidence,`video-frame-${frame}.png`),reference=path.join(evidence,`scene-frame-${frame}.png`);
        await promisify(execFile)(ffmpeg,['-loglevel','error','-y','-i',job.path!,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1',actual],{env:runtimeEnvironment(root),windowsHide:true});
        await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1920px;height:1080px}svg{display:block;width:1920px;height:1080px}</style>${renderScene(project,frame/30*1000)}`,{waitUntil:'load'});
        await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:reference as `${string}.png`});
        const comparison=await promisify(execFile)(ffmpeg,['-i',actual,'-i',reference,'-lavfi','ssim','-f','null','-'],{env:runtimeEnvironment(root),windowsHide:true});
        const score=Number(comparison.stderr.match(/All:([\d.]+)/)?.[1]);
        assert.ok(score>=0.99,`Video frame ${frame} differs from the player scene (SSIM ${score})`);
        frameChecks.push({frame,timeMs:frame/30*1000,ssim:score,actual,reference});
      }
    } finally {await browser.close();}
    await writeFile(path.join(evidence,'video-frame-verification.json'),JSON.stringify(frameChecks,null,2),'utf8');
  }
}
await writeFile(path.join(evidence,process.argv.includes('--video-only')?'export-video-verification.json':'export-verification.json'),JSON.stringify({at:new Date().toISOString(),results},null,2),'utf8');
