import {afterEach,expect,it,vi} from 'vitest';
import {callProvider,connectivityMessages} from '../server/provider';
afterEach(()=>vi.unstubAllGlobals());
it('uses the documented non-thinking DeepSeek request without optional temperature restrictions',async()=>{
  let request:any;
  vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{
    request=JSON.parse(options.body as string);
    return new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'}}]}));
  }));
  await callProvider({baseUrl:'https://api.deepseek.com',model:'deepseek-v4-pro',apiKey:'test-key',timeoutMs:2000},connectivityMessages,async()=>{});
  expect(request.thinking).toEqual({type:'disabled'});expect(request).not.toHaveProperty('temperature');
  expect(request.model).toBe('deepseek-v4-pro');
});

it.each(['\n\n```json\n{"ok":true}\n```\n','```\r\n{"ok":true}\r\n```','\uFEFF {"ok":true}'])('accepts a complete JSON object in a single optional Markdown fence (%j)',async(rawContent)=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:rawContent}}]}))));
 const response=await callProvider({baseUrl:'http://127.0.0.1:4000/v1',model:'compatible',apiKey:'test-key',timeoutMs:2000,jsonMode:false},connectivityMessages,async()=>{});
 expect(response.content).toEqual({ok:true});
});

it.each(['Here is the result:\n```json\n{"ok":true}\n```','```json\n{"ok":true}\n```\nRun this script','```javascript\n{"ok":true}\n```','```json\n{"ok":true}\n```\n```json\n{"ok":false}\n```'])('rejects prose, script fences and multiple objects without extracting executable text (%j)',async(rawContent)=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:rawContent}}]}))));
 await expect(callProvider({baseUrl:'http://127.0.0.1:4000/v1',model:'compatible',apiKey:'test-key',timeoutMs:2000,jsonMode:false},connectivityMessages,async()=>{})).rejects.toThrow('严格 JSON');
});
