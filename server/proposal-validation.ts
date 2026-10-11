import {getLessonIssues,makeProposal,validateProject} from '../shared/model';
import type {ChangeMode,Circuit,Lesson,Project,Proposal,Usage} from '../shared/types';
import {ApiError,isRecord} from './errors';

export function validateModelProposal(project:Project,kind:'recognize'|'propose',mode:ChangeMode|undefined,content:unknown,usage?:Usage):Proposal {
  try {
    if(!isRecord(content))throw new Error();
    const summary=typeof content.summary==='string'&&content.summary.length<=2000?content.summary:kind==='recognize'?'识别照片中的电路':'根据要求调整内容';
    let proposal:Proposal;
    if(kind==='recognize'){
      if(content.supported===false)throw new ApiError(422,'当前图片超出第一版支持的基础直流教学电路范围，或图片类型无法确认。工业线束、连接器、电机和控制器图需要专用元件与端子定义，请改用基础电路照片。原工程已保留。');
      if(content.supported!==true)throw new ApiError(502,'模型未确认图片类型，请重试识别。第一版仅支持30个以内的基础直流教学电路，原工程已保留。');
      if(!isRecord(content.circuit)||!Array.isArray(content.uncertainties))throw new Error();
      proposal=makeProposal(project,content.circuit as unknown as Circuit,'circuit',summary);
      proposal.project.lesson={steps:[]};proposal.project.review={confirmed:false};
      proposal.project.uncertainties=content.uncertainties.map((item:unknown)=>{
        if(!isRecord(item))throw new Error();
        return {id:item.id,message:item.message,targetIds:item.targetIds,resolved:false};
      }) as Project['uncertainties'];
      proposal.changes.push('清空原课件步骤，待完成识别校对后重新编排');
    }else{
      if(!mode||!isRecord(content[mode]))throw new Error();
      proposal=makeProposal(project,content[mode] as unknown as Circuit|Lesson,mode,summary);
    }
    proposal.project=validateProject(proposal.project);
    if(kind==='propose'&&mode==='lesson'){
      const issues=getLessonIssues(proposal.project);
      if(issues.length)throw new ApiError(502,'模型提案包含无效演示动作：'+issues.slice(0,3).join('；'));
    }
    if(usage)proposal.usage=usage;
    return proposal;
  }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(502,kind==='recognize'?'识别结果未通过电路校验，请重试或手工绘制':'模型提案未通过校验，请调整要求后重试');}
}
