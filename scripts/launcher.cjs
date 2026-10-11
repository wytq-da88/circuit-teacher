const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {resolveExecutable,runtimeEnvironment}=require('./runtime-tools.cjs');
const root=path.resolve(__dirname,'..');
const url='http://127.0.0.1:4317';
const cache=path.join(root,'.cache');
for(const dir of ['logs','exports','data','.cache/tmp','.cache/browser','.cache/puppeteer'])fs.mkdirSync(path.join(root,dir),{recursive:true});
const env=runtimeEnvironment(root);
// Resolve against the real host environment before isolating the child profile.
for(const [kind,key] of [['browser','CIRCUIT_BROWSER_PATH'],['videoBrowser','CIRCUIT_VIDEO_BROWSER_PATH'],['ffmpeg','CIRCUIT_FFMPEG_PATH'],['ffprobe','CIRCUIT_FFPROBE_PATH']]){
 const executable=resolveExecutable(kind,{root});if(executable)env[key]=executable;
}
async function health(){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1500)});return r.ok?(await r.json()).app:null;}catch{return null;}}
async function main(){
 if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or newer is required.');
 const current=await health();
 if(current&&current!=='circuit-teacher')throw new Error('Port 4317 is used by another application.');
 if(current!=='circuit-teacher'){
  const cli=path.join(root,'node_modules','tsx','dist','cli.mjs');
  if(!fs.existsSync(cli))throw new Error('Dependencies missing. Run npm.cmd install in '+root);
  const out=fs.openSync(path.join(root,'logs','server.log'),'a');
  const err=fs.openSync(path.join(root,'logs','server-error.log'),'a');
  const production=fs.existsSync(path.join(root,'dist','index.html'));
  const child=spawn(process.execPath,[cli,path.join(root,'server','index.ts'),...(production?['--production']:[])],{cwd:root,env,detached:true,windowsHide:true,stdio:['ignore',out,err]});
  child.unref();fs.closeSync(out);fs.closeSync(err);
  fs.writeFileSync(path.join(root,'logs','server-pid.json'),JSON.stringify({pid:child.pid,url,startedAt:new Date().toISOString()},null,2));
  let ready=false;for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,500));if(await health()==='circuit-teacher'){ready=true;break;}}
  if(!ready)throw new Error('Server failed to start. See '+path.join(root,'logs','server-error.log'));
 }
 console.log('Circuit Teacher is running: '+url);
 if(!process.argv.includes('--no-browser')){
  const browserPath=resolveExecutable('browser',{root});
  if(browserPath&&!path.basename(browserPath).startsWith('chrome-headless-shell')){
   const prefsDir=path.join(cache,'browser','Default');fs.mkdirSync(prefsDir,{recursive:true});
   const prefs=path.join(prefsDir,'Preferences');
   if(!fs.existsSync(prefs))fs.writeFileSync(prefs,JSON.stringify({download:{default_directory:path.join(root,'exports'),prompt_for_download:false}}));
   const browser=spawn(browserPath,['--user-data-dir='+path.join(cache,'browser'),'--no-first-run','--no-default-browser-check','--app='+url],{env,detached:true,windowsHide:false,stdio:'ignore'});browser.unref();
  }else console.log('Open the local URL in your browser.');
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
