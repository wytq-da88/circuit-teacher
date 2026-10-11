import type { Project, ProviderSettings, Usage } from '../shared/types';
import { ApiError, isRecord } from './errors';
import {apiProvider,normalizeApiBaseUrl} from '../shared/provider-config';
import {providerDispatcher} from './network';
import type {Dispatcher} from 'undici';

const MAX_RESPONSE = 2 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
export type ChatMessage = { role: 'system' | 'user'; content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] };

export function validatePhoto(source: Project['source']): string {
  if (!source || typeof source.dataUrl !== 'string') throw new ApiError(400, '请先选择电路照片');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source.dataUrl);
  if (!match) throw new ApiError(400, '照片仅支持 PNG、JPG 或 WebP');
  if (match[2].length > Math.ceil(MAX_IMAGE / 3) * 4) throw new ApiError(413, '照片不能超过 10MB');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_IMAGE) throw new ApiError(413, '照片不能超过 10MB');
  if (bytes.toString('base64') !== match[2]) throw new ApiError(400, '照片编码无效');
  const valid = match[1] === 'png' ? bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR'
    : match[1] === 'jpeg' ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.length >= 16 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  if (!valid) throw new ApiError(400, '照片内容与格式不一致，请重新导出图片');
  return source.dataUrl;
}

const SCHEMA = `你是中文初中直流电路教学助手。只返回一个严格 JSON 对象，不要 Markdown、代码围栏、HTML 或脚本。
画布为1280×720，x/y为元件中心。元件总数最多30；电路用于教学示意，不宣称进行物理数值仿真。
Circuit={components:[{id:string,type:"battery"|"switch"|"resistor"|"rheostat"|"lamp"|"ammeter"|"voltmeter",label:string,value:string,x:number,y:number,rotation:0|90|180|270,closed?:boolean}],junctions:[{id:string,x:number,y:number}],wires:[{id:string,from:Endpoint,to:Endpoint,points:[{x:number,y:number}]}]}。
Endpoint必须恰好为{componentId:string,pin:"a"|"b"}或{junctionId:string}；只有rheostat还有w引脚；连接交叉处不自动连接，要使用junction。
Lesson={steps:[{id:string,title:string,durationMs:整数(500到120000),caption:string,actions:[{type:"highlight"|"flow"|"switch"|"lamp"|"label",targetIds:string[],enabled?:boolean,text?:string,reverse?:boolean}]}]}。flow的targetIds列出需要演示的闭合通路导线ID；switch只能目标开关，lamp只能目标灯泡；电流从电源a端正极流出到b端负极。每步不超过120000毫秒，整课不超过600000毫秒。
不要修改用户提供的工程元数据、来源照片、版本、标题或统计。所有文本均为普通文本，不能包含脚本。保持所有ID唯一，引用必须存在。`;

export function recognitionMessages(project: Project): ChatMessage[] {
  const photo = validatePhoto(project.source);
  return [ { role: 'system', content: SCHEMA + '\n从图片重建元件和连线，回复{circuit:Circuit,uncertainties:[{id:string,message:string,targetIds:string[],resolved:false}],summary:string}。不确定的数值或连接必须写入uncertainties，不能假装已经确认。' },
    { role: 'user', content: [{ type: 'text', text: '识别这张电路照片，排成清晰可编辑的电路图。只返回指定JSON。' }, { type: 'image_url', image_url: { url: photo } }] } ];
}

export function proposalMessages(project: Project, prompt: string, mode: 'circuit' | 'lesson'): ChatMessage[] {
  return [{ role: 'system', content: SCHEMA + (mode === 'circuit'
    ? '\n只修改电路结构，回复{circuit:Circuit,summary:string}。'
    : '\n只编写课件演示步骤，不能增删元件或改变电路，回复{lesson:Lesson,summary:string}。') },
  { role: 'user', content: JSON.stringify({ request: prompt, circuit: project.circuit, lesson: project.lesson }) }];
}

export async function callProvider(settings: ProviderSettings, messages: ChatMessage[], recordUsage: (usage: Usage) => Promise<void>): Promise<{ content: Record<string, unknown>; usage?: Usage }> {
  if (!settings.apiKey) throw new ApiError(400, '请先在设置中填写 API 密钥');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  let dispatcher:Dispatcher|undefined;
  try {
    dispatcher=await providerDispatcher(settings);
    const request:RequestInit&{dispatcher?:Dispatcher}={
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({ model: settings.model, messages,
        ...(settings.jsonMode!==false?{response_format:{type:'json_object'}}:{}),
        ...(apiProvider(settings.baseUrl)==='deepseek'?{thinking:{type:'disabled'}}:{}),
      }),
      ...(dispatcher?{dispatcher}:{}),
    };
    const response = await fetch(`${normalizeApiBaseUrl(settings.baseUrl)}/chat/completions`,request);
    if (!response.ok) {
      let errorBody:unknown;
      try{errorBody=JSON.parse(await readBoundedResponse(response,32768));}catch{/* Only classify errors; never expose raw diagnostics or keys. */}
      throw providerHttpError(response.status,errorBody);
    }
    let envelope: unknown;
    const responseText=await readBoundedResponse(response,MAX_RESPONSE);
    try { envelope = JSON.parse(responseText); } catch { throw new ApiError(502, '模型服务返回了无效 JSON，请核对是否填写了 API 接口地址'); }
    if (!isRecord(envelope)) throw new ApiError(502, '模型响应结构无效');
    let usage: Usage | undefined;
    if (isRecord(envelope.usage)) {
      const values = [envelope.usage.prompt_tokens, envelope.usage.completion_tokens, envelope.usage.total_tokens];
      if (values.every(value => Number.isSafeInteger(value) && Number(value) >= 0)) {
        usage = { promptTokens: Number(values[0]), completionTokens: Number(values[1]), totalTokens: Number(values[2]), model: settings.model, at: new Date().toISOString() };
        await recordUsage(usage);
      }
    }
    const choices = envelope.choices;
    const first = Array.isArray(choices) ? choices[0] : undefined;
    if(isRecord(first)&&first.finish_reason==='length')throw new ApiError(502,'模型输出因长度限制被截断，请缩小电路或简化修改要求后重试');
    const message = isRecord(first) && isRecord(first.message) ? first.message : undefined;
    if (!message || typeof message.content !== 'string') throw new ApiError(502, '模型未返回结构化文本');
    let content: unknown;
    try { content = JSON.parse(message.content); }
    catch { throw new ApiError(502, '模型输出不是严格 JSON，请重试'); }
    if (!isRecord(content)) throw new ApiError(502, '模型输出必须为 JSON 对象');
    return { content, usage };
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError(504, '模型请求超时，请稍后重试或增加超时时间');
    if (error instanceof ApiError) throw error;
    const cause=isRecord(error)&&isRecord(error.cause)?error.cause:undefined;
    const code=cause?.code;
    const hint=code==='ENOTFOUND'?'无法解析 API 域名，请检查地址或 DNS'
      :code==='ECONNREFUSED'?'API 地址拒绝连接，请检查地址、端口或本机代理是否启动'
      :code==='UND_ERR_CONNECT_TIMEOUT'||code==='ETIMEDOUT'?'连接 API 超时，请检查本机网络及代理设置'
      :typeof code==='string'&&/CERT|TLS/.test(code)?'API 的 HTTPS 证书验证失败，请检查地址和本机证书配置'
      :'无法连接模型服务，请检查 API 地址与网络；这是模型连接问题，本机配置仍已保存';
    throw new ApiError(502,hint);
  } finally { clearTimeout(timer);await dispatcher?.destroy(); }
}

async function readBoundedResponse(response:Response,limit:number):Promise<string> {
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new ApiError(502,'模型响应超过 2MB 限制');}
  const reader=response.body?.getReader();if(!reader)throw new ApiError(502,'模型服务没有返回内容');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>limit){await reader.cancel();throw new ApiError(502,'模型响应超过 2MB 限制');}chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function providerHttpError(status:number,body:unknown):ApiError {
  const error=isRecord(body)&&isRecord(body.error)?body.error:undefined;
  const code=typeof error?.code==='string'?error.code:'';
  const message=typeof error?.message==='string'?error.message:'';
  let hint='模型服务请求失败，请核对地址、模型名称与服务商状态';
  if(status===401)hint='API 密钥无效或已过期，请填写当前服务商的 API Key';
  else if(status===403)hint='账号或当前网络没有调用权限，请检查服务商账户与地区权限';
  else if(status===402)hint='服务商账户余额不足，请在服务商控制台检查余额';
  else if(status===404)hint=code==='model_not_found'||/model/i.test(message)?'模型名称不存在或账号无权使用，请填写控制台提供的模型 ID':'API 接口不存在，请填写接口根地址，或核对 Chat Completions 路径';
  else if(status===429)hint=code==='insufficient_quota'||/quota|balance|credit|余额|额度/i.test(message)?'服务商账户额度不足，请检查 API 额度；客户端会员额度是否适用于 API 以服务商规则为准':'请求频率过高，请稍后重试或检查服务商限额';
  else if(status===400&&/response_format|json.?mode|json_object/i.test(message))hint='模型不支持当前 JSON 模式，请关闭设置中的 JSON 模式后重试';
  else if(status===400&&/image|vision|多模态|图片/i.test(message))hint='当前模型不接受图片，请改用支持视觉输入的模型；DeepSeek 官方照片识别可选 deepseek-flash';
  else if(status===400)hint='模型拒绝了请求参数，请核对模型 ID，以及是否支持 Chat Completions 和 JSON 输出';
  else if(status>=500)hint='模型服务暂时不可用，请稍后重试';
  return new ApiError(502,`${hint}（HTTP ${status}）`);
}

export const connectivityMessages: ChatMessage[] = [ { role: 'system', content: '请只返回严格 JSON 对象。' }, { role: 'user', content: '连接测试，请返回 {"ok":true}。' } ];
