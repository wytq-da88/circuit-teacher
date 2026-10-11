import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ProxyAgent,type Dispatcher} from 'undici';
import {normalizeProxyUrl} from '../shared/provider-config';
import type {ProviderSettings} from '../shared/types';

const exec=promisify(execFile);
let cached:{until:number;url?:string}|undefined;
export async function systemProxy():Promise<string|undefined> {
  if(cached&&cached.until>Date.now())return cached.url;
  let url:string|undefined;
  for(const key of ['HTTPS_PROXY','https_proxy','HTTP_PROXY','http_proxy']){
    if(process.env[key]){try{url=normalizeProxyUrl(process.env[key]!);break;}catch{/* Credential-bearing proxy URLs are not returned to the UI. */}}
  }
  if(!url&&process.platform==='win32'){
    try{
      const key='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
      const options={windowsHide:true,timeout:2000,maxBuffer:8192,encoding:'utf8' as const};
      const enabled=await exec('reg.exe',['query',key,'/v','ProxyEnable'],options);
      if(/ProxyEnable\s+REG_DWORD\s+0x1\s/i.test(enabled.stdout)){
        const value=await exec('reg.exe',['query',key,'/v','ProxyServer'],options);
        const raw=/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i.exec(value.stdout)?.[1].trim();
        const selected=raw?.includes('=')?raw.split(';').find(item=>item.startsWith('https='))?.slice(6)||raw.split(';').find(item=>item.startsWith('http='))?.slice(5):raw;
        if(selected)url=normalizeProxyUrl(/^[a-z]+:\/\//i.test(selected)?selected:`http://${selected}`);
      }
    }catch{/* No configured HTTP proxy: use the direct connection. */}
  }
  cached={until:Date.now()+30000,url};return url;
}
export async function providerDispatcher(settings:ProviderSettings):Promise<Dispatcher|undefined> {
  const mode=settings.proxyMode??'system';
  if(mode==='direct')return undefined;
  if(mode==='custom')return new ProxyAgent(normalizeProxyUrl(settings.proxyUrl??''));
  // Local model servers and test servers should stay on the local network.
  const host=new URL(settings.baseUrl).hostname;
  if(['127.0.0.1','localhost','[::1]'].includes(host))return undefined;
  const proxy=await systemProxy();return proxy?new ProxyAgent(proxy):undefined;
}
