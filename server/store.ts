import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { touchProject, validateProject } from '../shared/model';
import type { Project, ProjectSummary, ProviderSettings, RevisionSummary, Usage } from '../shared/types';
import { ApiError, isRecord } from './errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const locks = new Map<string, Promise<unknown>>();
const DEFAULT_SETTINGS: ProviderSettings = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', timeoutMs: 60000 };

export function requireProjectId(id: string): string {
  if (!UUID.test(id)) throw new ApiError(400, '工程编号无效');
  return id.toLowerCase();
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const preceding = locks.get(key) ?? Promise.resolve();
  const current = preceding.catch(() => undefined).then(operation);
  locks.set(key, current);
  try { return await current; }
  finally { if (locks.get(key) === current) locks.delete(key); }
}

async function readJson(filename: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new ApiError(500, '本地数据无法读取，请保留数据目录并检查文件');
  }
}

async function atomicJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, filename);
  } finally { await unlink(temporary).catch(() => undefined); }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function publicSettings(settings: ProviderSettings): ProviderSettings {
  return { baseUrl: settings.baseUrl, model: settings.model, timeoutMs: settings.timeoutMs, hasKey: Boolean(settings.apiKey) };
}

function validateSettings(input: unknown, previous: ProviderSettings): ProviderSettings {
  if (!isRecord(input) || typeof input.baseUrl !== 'string' || typeof input.model !== 'string') {
    throw new ApiError(400, '请填写 API 地址与模型名称');
  }
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || baseUrl.length > 2048) throw new Error();
  } catch { throw new ApiError(400, 'API 地址必须是有效的 HTTP 或 HTTPS 地址，且不含账号、查询参数或片段'); }
  const model = input.model.trim();
  if (!model || model.length > 160 || /[\r\n]/.test(model)) throw new ApiError(400, '模型名称无效');
  const timeoutMs = input.timeoutMs ?? previous.timeoutMs;
  if (!Number.isInteger(timeoutMs) || Number(timeoutMs) < 1000 || Number(timeoutMs) > 180000) throw new ApiError(400, '超时需为 1000–180000 毫秒');
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n]/.test(input.apiKey))) throw new ApiError(400, 'API 密钥格式无效');
  const apiKey = input.apiKey === undefined ? previous.apiKey : (input.apiKey as string).trim() || undefined;
  return { baseUrl, model, timeoutMs: Number(timeoutMs), ...(apiKey ? { apiKey } : {}) };
}

export class LocalStore {
  readonly dataDir: string;
  constructor(dataDir: string) { this.dataDir = path.resolve(dataDir); }
  async init(): Promise<void> { await mkdir(path.join(this.dataDir, 'projects'), { recursive: true }); }
  private projectDir(id: string) { return path.join(this.dataDir, 'projects', requireProjectId(id)); }
  private async numbers(id: string): Promise<number[]> {
    try {
      return (await readdir(this.projectDir(id))).filter(name => /^(0|[1-9]\d*)\.json$/.test(name))
        .map(name => Number(name.slice(0, -5))).filter(Number.isSafeInteger).sort((a, b) => b - a);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  async getProject(id: string, revision?: number): Promise<Project> {
    const dir = this.projectDir(id);
    const selected = revision ?? (await this.numbers(id))[0];
    if (!Number.isSafeInteger(selected) || selected < 0) throw new ApiError(404, '工程或历史版本不存在');
    const value = await readJson(path.join(dir, `${selected}.json`));
    if (value === undefined) throw new ApiError(404, '工程或历史版本不存在');
    try { return validateProject(value); }
    catch { throw new ApiError(500, '本地工程文件校验失败，请保留原始数据'); }
  }
  async listProjects(): Promise<ProjectSummary[]> {
    const dirs = await readdir(path.join(this.dataDir, 'projects'), { withFileTypes: true });
    const summaries: ProjectSummary[] = [];
    for (const dir of dirs.filter(dir => dir.isDirectory() && UUID.test(dir.name))) {
      if (!(await this.numbers(dir.name)).length) continue;
      const project = await this.getProject(dir.name);
      summaries.push({ id: project.id, title: project.title, updatedAt: project.updatedAt, revision: project.revision });
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async revisions(id: string): Promise<RevisionSummary[]> {
    const numbers = await this.numbers(id);
    if (!numbers.length) throw new ApiError(404, '工程不存在');
    return Promise.all(numbers.map(async revision => {
      const project = await this.getProject(id, revision);
      return { revision, savedAt: project.updatedAt, title: project.title };
    }));
  }
  private async saveUnlocked(project: Project): Promise<Project> {
    const existing = await this.numbers(project.id);
    if (existing.length) {
      const latest = await this.getProject(project.id, existing[0]);
      if (project.revision < latest.revision) throw new ApiError(409, '该工程已有更新版本，请重新载入后再保存');
      if (project.revision === latest.revision) {
        if (canonical(project) === canonical(latest)) return latest;
        throw new ApiError(409, '此版本已保存其他内容，请重新载入后再编辑');
      }
    }
    await atomicJson(path.join(this.projectDir(project.id), `${project.revision}.json`), project);
    return project;
  }
  async saveProject(id: string, input: unknown): Promise<Project> {
    const canonicalId = requireProjectId(id);
    const project = validateProject(input);
    if (requireProjectId(project.id) !== canonicalId) throw new ApiError(400, '工程编号与请求地址不一致');
    return serialized(this.projectDir(id), () => this.saveUnlocked(project));
  }
  async restoreProject(id: string, revision: unknown): Promise<Project> {
    if (!Number.isSafeInteger(revision) || Number(revision) < 0) throw new ApiError(400, '请选择有效的历史版本');
    return serialized(this.projectDir(id), async () => {
      const latest = await this.getProject(id);
      const historical = await this.getProject(id, Number(revision));
      const restored = validateProject(touchProject({ ...historical, revision: latest.revision }));
      return this.saveUnlocked(restored);
    });
  }
  async getSettings(): Promise<ProviderSettings> {
    const value = await readJson(path.join(this.dataDir, 'settings.json'));
    if (value === undefined) return { ...DEFAULT_SETTINGS };
    return validateSettings(value, DEFAULT_SETTINGS);
  }
  async saveSettings(input: unknown): Promise<ProviderSettings> {
    return serialized(path.join(this.dataDir, 'settings.json'), async () => {
      const settings = validateSettings(input, await this.getSettings());
      await atomicJson(path.join(this.dataDir, 'settings.json'), settings);
      return settings;
    });
  }
  async usage(): Promise<Usage[]> {
    const value = await readJson(path.join(this.dataDir, 'usage.json'));
    return Array.isArray(value) ? value as Usage[] : [];
  }
  async recordUsage(usage: Usage): Promise<void> {
    const filename = path.join(this.dataDir, 'usage.json');
    await serialized(filename, async () => { await atomicJson(filename, [usage, ...await this.usage()].slice(0, 2000)); });
  }
}
