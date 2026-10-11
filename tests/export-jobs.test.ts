import { describe, expect, it } from 'vitest';
import { createExportJob, getExportFile, getExportJob } from '../server/exporter';
import { readFile } from 'node:fs/promises';
import { exportFixture } from './export-scene.test';

describe('导出门禁和工程文件',()=>{
  it('未校对工程阻止成品导出但允许保存JSON',async()=>{
    const p=exportFixture();p.review.confirmed=false;
    await expect(createExportJob(p,'svg')).rejects.toThrow(/校对/);
    const job=await createExportJob(p,'json');
    for(let i=0;i<100 && getExportJob(job.id)?.status!=='completed';i++) await new Promise(r=>setTimeout(r,20));
    expect(getExportJob(job.id)?.status).toBe('completed');
    expect(JSON.parse(await readFile(getExportFile(job.id)!,'utf8'))).toEqual(p);
  });
});
