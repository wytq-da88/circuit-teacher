export async function api<T>(path:string, options?:RequestInit):Promise<T> {
  let response:Response;
  try { response = await fetch(`/api${path}`, { ...options, headers:{ 'Content-Type':'application/json', ...options?.headers } }); }
  catch(error) {
    if(error instanceof Error&&error.name==='AbortError')throw new Error('请求已取消，当前页面内容仍保留。');
    throw new Error('无法连接本机服务。请双击项目目录里的 start.cmd 启动，再重试；当前页面内容仍保留。');
  }
  let data:unknown;
  try { data=await response.json(); } catch { throw new Error('本机服务返回了无法读取的响应，请检查服务是否仍在运行。'); }
  if(!response.ok) throw new Error((data as {error?:string}).error || `请求未完成（${response.status}）`);
  return data as T;
}
export const body=(value:unknown)=>JSON.stringify(value);
export const uid=(prefix:string)=>`${prefix}_${crypto.randomUUID().slice(0,8)}`;
export const clone=<T,>(value:T):T=>structuredClone(value);
export const formatTime=(milliseconds:number)=>`${Math.floor(milliseconds/60000).toString().padStart(2,'0')}:${Math.floor(milliseconds%60000/1000).toString().padStart(2,'0')}`;
