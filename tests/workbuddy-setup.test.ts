import {afterEach,expect,it} from 'vitest';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const folders:string[]=[];
afterEach(()=>folders.splice(0).forEach(folder=>rmSync(folder,{recursive:true,force:true})));

it('generates a connector for the actual relocated project without copying saved credentials',()=>{
  const base=path.resolve('.cache','workbuddy-setup-tests');mkdirSync(base,{recursive:true});
  const root=mkdtempSync(path.join(base,'项目 with spaces '));folders.push(root);
  mkdirSync(path.join(root,'scripts'));mkdirSync(path.join(root,'data'));
  mkdirSync(path.join(root,'integrations','workbuddy'),{recursive:true});
  copyFileSync(path.resolve('scripts','setup-workbuddy.cjs'),path.join(root,'scripts','setup-workbuddy.cjs'));
  writeFileSync(path.join(root,'integrations','workbuddy','connector-meta.json'),JSON.stringify({name:'Circuit Teacher',source:'circuit-teacher',type:'mcp',version:'0.1.1'}));
  writeFileSync(path.join(root,'integrations','workbuddy','icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(path.join(root,'data','settings.json'),JSON.stringify({apiKey:'private-key-must-not-copy'}));
  const output=execFileSync(process.execPath,[path.join(root,'scripts','setup-workbuddy.cjs')],{encoding:'utf8',cwd:root});
  const bundle=path.join(root,'.cache','workbuddy','circuit-teacher-connector');
  expect(existsSync(path.join(bundle,'connector-meta.json'))).toBe(true);
  expect(existsSync(path.join(bundle,'icon.svg'))).toBe(true);
  const json=readFileSync(path.join(bundle,'mcp.json'),'utf8');
  const config=JSON.parse(json).mcpServers['circuit-teacher'];
  expect(config.command).toBe(process.execPath);
  expect(config.args).toEqual([path.join(root,'scripts','workbuddy-mcp.mjs')]);
  expect(readFileSync(path.join(root,'.cache','workbuddy','mcp.json'),'utf8')).toBe(json);
  expect(json+output).not.toContain('private-key-must-not-copy');
});
