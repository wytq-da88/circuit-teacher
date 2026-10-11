const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { resolveExecutable, runtimeEnvironment } = require('./runtime-tools.cjs');

const root = path.resolve(__dirname, '..');
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
  const cli = path.join(root, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
  if (!fs.existsSync(cli)) throw new Error('Run npm ci before installing the video browser.');
  if (process.platform === 'linux' && process.arch === 'arm64') {
    throw new Error('Chrome Headless Shell is unavailable for Linux ARM64. Install Chromium with your system package manager and set CIRCUIT_VIDEO_BROWSER_PATH.');
  }
  const env = runtimeEnvironment(root);
  delete env.HYPERFRAMES_BROWSER_PATH;
  delete env.PRODUCER_HEADLESS_SHELL_PATH;
  delete env.HYPERFRAMES_NO_AUTO_INSTALL;
  console.log('Installing the official HyperFrames browser in the project .cache/runtime directory.');
  const result = spawnSync(process.execPath, [cli, 'browser', 'ensure'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Browser setup failed (exit ${result.status}). Check network access and retry this command.`);
  for (const kind of ['videoBrowser', 'ffmpeg', 'ffprobe']) {
    const executable = resolveExecutable(kind, { root });
    if (!executable) throw new Error(`Missing ${kind}. Put FFmpeg and FFprobe in .tools/ffmpeg/bin, add them to PATH, or set CIRCUIT_FFMPEG_PATH / CIRCUIT_FFPROBE_PATH, then retry.`);
    const check = spawnSync(executable, [kind === 'videoBrowser' ? '--version' : '-version'], { cwd: root, env, encoding: 'utf8', timeout: 10000, windowsHide: true });
    if (check.error || check.status !== 0 || !check.stdout?.trim()) throw new Error(`${kind} did not pass its version check: ${executable}`);
    console.log(`${kind}: ${check.stdout.split(/\r?\n/)[0]}`);
  }
  console.log('Video dependencies are ready. Restart the app if it was already running.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
