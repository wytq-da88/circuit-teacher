const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
const rows=[];
for(const [location,p] of Object.entries(lock.packages||{})){
 if(!location.startsWith('node_modules/'))continue;
 const name=location.split('node_modules/').pop();
 rows.push({name,version:p.version,license:p.license||'See package license',developmentOnly:!!p.dev,resolved:p.resolved||''});
}
rows.sort((a,b)=>a.name.localeCompare(b.name));
fs.writeFileSync(path.join(root,'docs','dependency-licenses.json'),JSON.stringify({generatedAt:new Date().toISOString(),packages:rows},null,2));
const pk=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
let md='# 第三方依赖与代码来源\n\n实际安装版本以 package-lock.json 为准。完整清单见 dependency-licenses.json。\n\n|直接依赖|版本|许可证|\n|---|---|---|\n';
for(const name of Object.keys(pk.dependencies)){const p=lock.packages['node_modules/'+name];if(p)md+=`|${name}|${p.version}|${p.license||'See package license'}|\n`;}
md+='\n电气符号实际改编自 Sketch2Schematic AI，源代码、MIT 许可证和提交号保存在 licenses/sketch2schematic。circuitsnap 与 Flux 仅作为产品/接口调研参考，没有复制其程序。\n\nHyperFrames 为 Apache-2.0；本项目通过独立本机进程调用 FFmpeg，实际使用既有的 FFmpeg essentials 构建，重分发二进制时应一并保留其相应许可和源码获取说明。React Flow 只使用 MIT 主库，没有复制付费 Pro 示例。\n';
fs.writeFileSync(path.join(root,'docs','第三方依赖.md'),md);
console.log(`Recorded ${rows.length} installed packages.`);
