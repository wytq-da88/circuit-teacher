import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fixtures: string[] = [];
const fixture = () => {
  const base = path.resolve('.cache', 'runtime-tests');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'moved project '));
  fixtures.push(root);
  return root;
};
const binary = (root: string, relative: string) => {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, 'test executable');
  chmodSync(file, 0o755);
  return file;
};
afterEach(() => fixtures.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

describe('portable runtime discovery', () => {
  it('uses an explicit override before the project bundle and PATH', () => {
    const { resolveExecutable } = require('../scripts/runtime-tools.cjs');
    const root = fixture();
    const configured = binary(root, 'custom tools/ffmpeg.exe');
    binary(root, '.tools/ffmpeg/bin/ffmpeg.exe');
    const fromPath = binary(root, 'path tools/ffmpeg.exe');
    expect(resolveExecutable('ffmpeg', { root, platform: 'win32', env: { CIRCUIT_FFMPEG_PATH: configured, Path: path.dirname(fromPath) } })).toBe(configured);
  });

  it('finds bundled tools after moving the project and finds ffprobe beside a configured ffmpeg', () => {
    const { resolveExecutable } = require('../scripts/runtime-tools.cjs');
    const root = fixture();
    const ffmpeg = binary(root, '.tools/ffmpeg/bin/ffmpeg.exe');
    const ffprobe = binary(root, '.tools/ffmpeg/bin/ffprobe.exe');
    expect(resolveExecutable('ffmpeg', { root, platform: 'win32', env: {} })).toBe(ffmpeg);
    expect(resolveExecutable('ffprobe', { root, platform: 'win32', env: { CIRCUIT_FFMPEG_PATH: ffmpeg } })).toBe(ffprobe);
  });

  it('uses PATH without a shell and does not select directories as executables', () => {
    const { resolveExecutable } = require('../scripts/runtime-tools.cjs');
    const root = fixture();
    mkdirSync(path.join(root, '.tools/bin/ffmpeg.exe'), { recursive: true });
    const fromPath = binary(root, 'external/ffmpeg.exe');
    expect(resolveExecutable('ffmpeg', { root, platform: 'win32', env: { Path: path.dirname(fromPath) } })).toBe(fromPath);
    expect(resolveExecutable('ffprobe', { root, platform: 'linux', env: {} })).toBeUndefined();
  });

  it('reports a broken explicit override instead of silently exporting with another tool', () => {
    const { resolveExecutable } = require('../scripts/runtime-tools.cjs');
    const root = fixture();
    binary(root, '.tools/ffmpeg/bin/ffmpeg.exe');
    expect(() => resolveExecutable('ffmpeg', { root, platform: 'win32', env: { CIRCUIT_FFMPEG_PATH: 'missing.exe' } })).toThrow('CIRCUIT_FFMPEG_PATH');
  });

  it('keeps Edge available for documents while selecting the local headless shell for video', () => {
    const { resolveExecutable } = require('../scripts/runtime-tools.cjs');
    const root = fixture();
    const edge = binary(root, 'programs/Microsoft/Edge/Application/msedge.exe');
    const shell = binary(root, '.cache/runtime/home/.cache/hyperframes/chrome/chrome-headless-shell/win64-152.0.7977.30/chrome-headless-shell-win64/chrome-headless-shell.exe');
    const env = { 'ProgramFiles(x86)': path.join(root, 'programs') };
    expect(resolveExecutable('browser', { root, platform: 'win32', env })).toBe(edge);
    expect(resolveExecutable('videoBrowser', { root, platform: 'win32', env })).toBe(shell);
  });

  it('does not silently reuse the Windows Edge document browser for MP4', () => {
    const { resolveExecutable } = require('../scripts/runtime-tools.cjs');
    const root = fixture();
    const edge = binary(root, 'custom/msedge.exe');
    const env = { CIRCUIT_BROWSER_PATH: edge };
    expect(resolveExecutable('browser', { root, platform: 'win32', env })).toBe(edge);
    expect(resolveExecutable('videoBrowser', { root, platform: 'win32', env })).toBeUndefined();
  });

  it('isolates runtime writes inside the project and preserves the caller environment', () => {
    const { runtimeEnvironment } = require('../scripts/runtime-tools.cjs');
    const root = fixture();
    const original = { Path: 'external-path', HOME: 'original-home' };
    const env = runtimeEnvironment(root, original);
    expect(env.HOME).toBe(path.join(root, '.cache/runtime/home'));
    expect(env.USERPROFILE).toBe(env.HOME);
    expect(env.TEMP).toBe(path.join(root, '.cache/runtime/tmp'));
    expect(env.TMPDIR).toBe(env.TEMP);
    expect(original).toEqual({ Path: 'external-path', HOME: 'original-home' });
  });

  it('requires a version-reporting browser for Windows video even when GUI Chrome is installed', () => {
    const { resolveExecutable } = require('../scripts/runtime-tools.cjs');
    const root = fixture();
    const chrome = binary(root, 'programs/Google/Chrome/Application/chrome.exe');
    const env = { ProgramFiles:path.join(root,'programs'), Path:path.dirname(chrome) };
    expect(resolveExecutable('browser',{root,platform:'win32',env})).toBe(chrome);
    expect(resolveExecutable('videoBrowser',{root,platform:'win32',env})).toBeUndefined();
  });
});
