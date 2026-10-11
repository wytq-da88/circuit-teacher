export function normalizeApiBaseUrl(input:string):string {
  const value=input.trim().replace(/\/+$/,'');
  const parsed=new URL(value);
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash||value.length>2048)throw new Error('API 地址格式无效');
  let pathname=parsed.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/i,'');
  if(['api.openai.com','apihub.agnes-ai.com'].includes(parsed.hostname)&&!pathname)pathname='/v1';
  parsed.pathname=pathname;
  return parsed.toString().replace(/\/+$/,'');
}

export function apiProvider(baseUrl:string):'openai'|'deepseek'|'agnes'|'custom' {
  try {const host=new URL(baseUrl).hostname;return host==='api.openai.com'?'openai':host==='api.deepseek.com'?'deepseek':host==='apihub.agnes-ai.com'?'agnes':'custom';}
  catch{return 'custom';}
}

export function normalizeProxyUrl(input:string):string {
  const parsed=new URL(input.trim());
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'||input.length>2048)throw new Error('代理地址格式无效');
  return parsed.origin;
}
