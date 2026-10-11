import {afterEach,expect,it,vi} from 'vitest';
import {api} from '../src/api';

afterEach(()=>vi.unstubAllGlobals());
it('explains a stopped local service instead of showing Failed to fetch',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(api('/settings',{method:'PUT',body:'{}'})).rejects.toThrow(/本机服务.*start\.cmd/);
});
it('preserves actionable provider errors returned by the local service',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'API 密钥无效（HTTP 401）'}),{status:502})));
  await expect(api('/settings/test')).rejects.toThrow('API 密钥无效（HTTP 401）');
});
