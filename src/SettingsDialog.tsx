import {useEffect,useState} from 'react';
import {CheckCircle2,Copy,Loader2,RefreshCw,Settings2} from 'lucide-react';
import type {ProviderSettings} from '../shared/types';
import {apiProvider} from '../shared/provider-config';
import {api,body} from './api';
import {Modal} from './Dialogs';

type Provider='openai'|'deepseek'|'agnes'|'custom'|'workbuddy';
const presets={
  openai:{baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini',timeoutMs:90000,jsonMode:true},
  deepseek:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',timeoutMs:120000,jsonMode:true},
  agnes:{baseUrl:'https://apihub.agnes-ai.com/v1',model:'agnes-2.5-flash',timeoutMs:120000,jsonMode:false},
};
function sameOrigin(a:string,b:string){try{return new URL(a).origin===new URL(b).origin;}catch{return false;}}

export function SettingsDialog({settings,onSaved,onClose,onError}:{settings:ProviderSettings;onSaved:(s:ProviderSettings)=>void;onClose:()=>void;onError:(s:string)=>void}) {
  const [form,setForm]=useState({...settings,apiKey:'',jsonMode:settings.jsonMode??true,proxyMode:settings.proxyMode??'system',proxyUrl:settings.proxyUrl??''});
  const [provider,setProvider]=useState<Provider>(settings.mode==='workbuddy'?'workbuddy':apiProvider(settings.baseUrl));
  const [keyTouched,setKeyTouched]=useState(false);
  const [busy,setBusy]=useState('');const [result,setResult]=useState('');const [resultKind,setResultKind]=useState<'success'|'error'|'info'>('info');
  const [localStatus,setLocalStatus]=useState<'checking'|'online'|'offline'>('checking');
  const [systemProxy,setSystemProxy]=useState('');const [configuration,setConfiguration]=useState('');
  const workbuddy=provider==='workbuddy';
  const retainedKey=settings.hasKey&&sameOrigin(settings.baseUrl,form.baseUrl);
  useEffect(()=>{let alive=true;void api('/health').then(()=>{if(alive)setLocalStatus('online');}).catch(()=>{if(alive)setLocalStatus('offline');});
    void api<{proxyUrl:string}>('/settings/system-proxy').then(r=>{if(alive)setSystemProxy(r.proxyUrl);}).catch(()=>{});
    return()=>{alive=false;};
  },[]);
  useEffect(()=>{if(!workbuddy)return;let alive=true;void api<{configuration:unknown}>('/workbuddy/setup').then(r=>{if(alive)setConfiguration(JSON.stringify(r.configuration,null,2));}).catch(e=>{if(alive){setResult(e.message);setResultKind('error');}});return()=>{alive=false;};},[workbuddy]);

  function choose(next:Provider){
    setProvider(next);setResult('');
    if(next==='workbuddy'){setForm(previous=>({...previous,mode:'workbuddy'}));return;}
    const preset=next==='custom'?undefined:presets[next];
    const changed=!!preset&&!sameOrigin(form.baseUrl,preset.baseUrl);
    if(changed)setKeyTouched(false);
    setForm(previous=>({...previous,...preset,mode:'api',...(changed?{apiKey:''}:{})}));
  }
  async function checkLocal(){setLocalStatus('checking');try{await api('/health');setLocalStatus('online');setResult('本机服务已连接，可以保存配置。');setResultKind('success');}catch(e){setLocalStatus('offline');setResult((e as Error).message);setResultKind('error');}}
  async function save(test=false){
    setBusy(test?'test':'save');setResult('');
    try{
      const payload=workbuddy?{baseUrl:settings.baseUrl,model:settings.model||'gpt-4.1-mini',timeoutMs:settings.timeoutMs,mode:'workbuddy',jsonMode:settings.jsonMode??true,proxyMode:settings.proxyMode??'system',proxyUrl:settings.proxyUrl??''}
        :{baseUrl:form.baseUrl,model:form.model,timeoutMs:form.timeoutMs,mode:'api',jsonMode:form.jsonMode,proxyMode:form.proxyMode,proxyUrl:form.proxyUrl,...(keyTouched?{apiKey:form.apiKey}:{})};
      const {settings:next}=await api<{settings:ProviderSettings}>('/settings',{method:'PUT',body:body(payload)});
      onSaved(next);setLocalStatus('online');setKeyTouched(false);setForm({...next,apiKey:'',jsonMode:next.jsonMode??true,proxyMode:next.proxyMode??'system',proxyUrl:next.proxyUrl??''});
      if(test){const response=await api<{ok:boolean;message:string}>('/settings/test',{method:'POST',body:'{}'});setResult(response.message);}
      else setResult(workbuddy?'已切换到 WorkBuddy。启用下方 MCP 配置后，在 WorkBuddy 中处理工坊待办。':'配置已保存到本机。');
      setResultKind('success');
    }catch(e){const message=(e as Error).message;onError(message);setResult(message);setResultKind('error');}
    finally{setBusy('');}
  }
  async function copy(){try{await navigator.clipboard.writeText(configuration);setResult('MCP 配置已复制，请在 WorkBuddy 的自定义连接器中添加并启用。');setResultKind('success');}catch{setResult('无法自动复制，请选中下面的配置文本手动复制。');setResultKind('info');}}
  return <Modal title="AI 服务设置" subtitle="选择模型来源。手工编辑与本地导出无需 API 密钥。" onClose={onClose}>
    <div className={`local-service-state ${localStatus}`}><span>{localStatus==='online'?<CheckCircle2 size={15}/>:<RefreshCw size={15}/>} {localStatus==='online'?'本机服务已连接':localStatus==='checking'?'正在检查本机服务…':'本机服务未连接，请先运行 start.cmd'}</span><button className="text-button" disabled={localStatus==='checking'} onClick={()=>void checkLocal()}>重新检查</button></div>
    <fieldset className="settings-fields" disabled={!!busy}>
    <div className="form-stack"><label>模型来源<select value={provider} onChange={e=>choose(e.target.value as Provider)}><option value="agnes">Agnes AI（支持免费 Key）</option><option value="openai">OpenAI 官方</option><option value="deepseek">DeepSeek 官方</option><option value="custom">其他 OpenAI 兼容 API</option><option value="workbuddy">WorkBuddy 本地插件</option></select></label></div>
    {workbuddy?<>
      <div className="settings-note"><Settings2 size={19}/><span>使用 WorkBuddy 中的模型处理工坊任务<br/><small>无需在工坊填写 WorkBuddy 密钥。调用发生在 WorkBuddy 中，额度和图片支持取决于你在那里选择的模型与账号。</small></span></div>
      <ol className="setup-steps"><li>把下方配置添加到 WorkBuddy 的自定义 MCP 连接器，并启用。</li><li>在工坊点击识别或生成建议，复制生成的任务指令。</li><li>把指令发给 WorkBuddy；草稿回传后，在工坊预览并确认。</li></ol>
      <label className="config-label">本机 MCP 配置<textarea aria-label="WorkBuddy MCP 配置" rows={8} readOnly value={configuration||'正在读取配置…'}/></label>
      <button className="button outline" disabled={!configuration} onClick={()=>void copy()}><Copy size={14}/>复制插件配置</button>
      <p className="tiny muted">在 WorkBuddy 中选择支持图片输入的模型后，再进行照片识别。模型用量在 WorkBuddy 的套餐与用量中查看。</p>
    </>:<>
      <div className="settings-note"><Settings2 size={19}/><span>支持 Chat Completions 兼容接口<br/><small>图片识别需要模型支持视觉输入；文字连接测试成功不代表图片能力已验证。</small></span></div>
      {provider==='agnes'&&<div className="provider-help">Agnes 官方提供免费 Key 类型，实际限额以控制台为准。<a href="https://platform.agnes-ai.com/settings/apiKeys" target="_blank" rel="noreferrer">打开 API Key 页面 ↗</a></div>}
      {provider==='deepseek'&&<p className="tiny muted">照片识别按官方文档推荐使用 deepseek-flash。可手动填写 deepseek-v4-pro 进行文字改图或改演示。</p>}
      <div className="form-stack"><label>API 地址<input placeholder="https://apihub.agnes-ai.com/v1" value={form.baseUrl} onChange={e=>setForm({...form,baseUrl:e.target.value})}/><small>填写接口根地址；完整的 /chat/completions 地址也会自动整理。</small></label>
        <label>模型名称<input placeholder="填写服务商提供的模型 ID" value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/></label>
        <label>API 密钥<span className="label-note">{retainedKey?'已保存 · 留空保留现有密钥':'需要填写当前服务商的密钥'}</span><input type="password" autoComplete="new-password" value={form.apiKey} placeholder="粘贴 API Key" onChange={e=>{setKeyTouched(true);setForm({...form,apiKey:e.target.value});}}/></label>
        <div className="field-grid"><label>超时（秒）<input type="number" min={1} max={300} value={form.timeoutMs/1000} onChange={e=>setForm({...form,timeoutMs:Number(e.target.value)*1000})}/></label><label>网络连接<select value={form.proxyMode} onChange={e=>setForm({...form,proxyMode:e.target.value as ProviderSettings['proxyMode']??'system'})}><option value="system">使用系统代理（自动）</option><option value="direct">直接连接</option><option value="custom">手动设置 HTTP 代理</option></select></label></div>
        {form.proxyMode==='custom'&&<label>HTTP 代理地址<input placeholder="http://127.0.0.1:7890" value={form.proxyUrl} onChange={e=>setForm({...form,proxyUrl:e.target.value})}/></label>}
        {form.proxyMode==='system'&&<small className="muted">{systemProxy?`检测到系统代理：${systemProxy}`:'未检测到可直接使用的 HTTP 代理，将直接连接。'}</small>}
        <label className="checkbox-field"><input type="checkbox" checked={form.jsonMode} onChange={e=>setForm({...form,jsonMode:e.target.checked})}/><span>启用 API JSON 模式<small>兼容 API 不支持时可关闭；工坊仍会校验模型返回的数据。</small></span></label>
      </div><p className="tiny muted">密钥仅保存到本机服务配置，不写入工程、成品或日志。切换服务商后需要填写对应密钥。</p>
    </>}
    </fieldset>
    {result&&<div className={`inline-notice ${resultKind==='error'?'failed':''}`} role="status">{result}</div>}
    <footer>{!workbuddy&&settings.hasKey&&<button className="text-button danger" disabled={!!busy} onClick={()=>{setForm({...form,apiKey:''});setKeyTouched(true);setResult('已标记清除密钥，点击保存后生效。');setResultKind('info');}}>清除密钥</button>}<button className="button outline" disabled={!!busy} onClick={()=>void save(true)}>{busy==='test'&&<Loader2 className="spin" size={15}/>}保存并测试连接</button><button className="button" disabled={!!busy} onClick={()=>void save()}>{busy==='save'&&<Loader2 className="spin" size={15}/>}保存配置</button></footer>
  </Modal>;
}
