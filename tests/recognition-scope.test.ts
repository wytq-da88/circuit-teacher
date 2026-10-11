import {expect,it} from 'vitest';
import {createExample} from '../shared/examples';
import {validateModelProposal} from '../server/proposal-validation';
import {recognitionMessages} from '../server/provider';
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

it('rejects an unsupported drawing even when the model invents a structurally valid circuit',()=>{
 const project=createExample();const before=structuredClone(project);
 expect(()=>validateModelProposal(project,'recognize',undefined,{supported:false,reason:'工业线束与连接器',circuit:project.circuit,uncertainties:[],summary:'工业线束'})).toThrow(/图片超出.*基础直流/);
 expect(project).toEqual(before);
});

it('requires an explicit scope decision before accepting a recognition draft',()=>{
 const project=createExample();
 expect(()=>validateModelProposal(project,'recognize',undefined,{circuit:project.circuit,uncertainties:[],summary:'未判断范围'})).toThrow(/未确认图片类型/);
 expect(()=>validateModelProposal(project,'recognize',undefined,{supported:true,circuit:project.circuit,uncertainties:[],summary:'基础电路'})).not.toThrow();
});

it('gives image recognition an unsupported response contract without replacing connectors with resistors',()=>{
 const project=createExample();project.source={name:'电路.png',dataUrl:photo};
 const system=recognitionMessages(project)[0].content;
 expect(system).toContain('supported:false');expect(system).toContain('工业线束');
 expect(system).toContain('不得用电阻');
});
