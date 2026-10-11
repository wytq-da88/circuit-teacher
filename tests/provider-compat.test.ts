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
