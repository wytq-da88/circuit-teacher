export type RuntimeTool = 'browser' | 'videoBrowser' | 'ffmpeg' | 'ffprobe';
export function resolveExecutable(kind: RuntimeTool, options: { root: string; env?: NodeJS.ProcessEnv; platform?: string }): string | undefined;
export function runtimeEnvironment(root: string, source?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
