const fs = require('node:fs');
const path = require('node:path');

function envValue(env, name) {
  const key = Object.keys(env).find(key => key.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}

function usable(file, platform) {
  try {
    if (!fs.statSync(file).isFile()) return false;
    if (platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

function findBelow(directory, names, platform, depth = 4) {
  if (depth < 0) return undefined;
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return undefined; }
  // Newest managed version first; only search the project-owned tools/cache tree.
  entries.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  for (const entry of entries) {
    if (entry.isFile() && names.includes(entry.name.toLowerCase())) {
      const file = path.join(directory, entry.name);
      if (usable(file, platform)) return file;
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const file = findBelow(path.join(directory, entry.name), names, platform, depth - 1);
      if (file) return file;
    }
  }
}

function resolveExecutable(kind, { root, env = process.env, platform = process.platform }) {
  const keys = { browser: 'CIRCUIT_BROWSER_PATH', videoBrowser: 'CIRCUIT_VIDEO_BROWSER_PATH', ffmpeg: 'CIRCUIT_FFMPEG_PATH', ffprobe: 'CIRCUIT_FFPROBE_PATH' };
  const key = keys[kind];
  if (!key) throw new Error(`Unknown tool: ${kind}`);
  const configured = envValue(env, key)?.trim();
  if (configured) {
    const file = path.resolve(root, configured);
    if (!usable(file, platform)) throw new Error(`${key} points to a missing or non-executable file: ${file}`);
    return file;
  }
  const exe = platform === 'win32' ? '.exe' : '';
  const first = candidates => candidates.find(file => usable(file, platform));
  const onPath = names => {
    const directories = (envValue(env, 'PATH') || '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
    return first(directories.flatMap(dir => names.map(name => path.join(dir.replace(/^"|"$/g, ''), name + exe))));
  };
  if (kind === 'ffmpeg' || kind === 'ffprobe') {
    if (kind === 'ffprobe' && envValue(env, 'CIRCUIT_FFMPEG_PATH')) {
      const sibling = path.join(path.dirname(path.resolve(root, envValue(env, 'CIRCUIT_FFMPEG_PATH'))), 'ffprobe' + exe);
      if (usable(sibling, platform)) return sibling;
    }
    return first(['.tools/ffmpeg/bin', '.tools/ffmpeg', '.tools/bin'].map(dir => path.join(root, dir, kind + exe))) || onPath([kind]);
  }
  const shellName = 'chrome-headless-shell' + exe;
  const localBrowser = findBelow(path.join(root, '.tools', 'browser'), [shellName, 'chrome' + exe, 'chromium' + exe], platform)
    || first([path.join(root, '.tools', 'chrome-headless-shell', shellName), path.join(root, '.tools', 'chrome', 'chrome' + exe)]);
  if (localBrowser) return localBrowser;
  const managedBrowser = () => findBelow(path.join(root, '.cache/runtime/home/.cache/hyperframes/chrome'), [shellName], platform);
  if (kind === 'videoBrowser') {
    const managed = managedBrowser();
    if (managed) return managed;
  }
  // Windows GUI Chrome/Edge do not reliably print --version, which HyperFrames needs.
  const fromPath = onPath(kind === 'browser' ? ['chrome', 'chromium', 'google-chrome', 'chromium-browser', 'msedge', 'chrome-headless-shell'] : platform === 'win32' ? ['chrome-headless-shell'] : ['chrome-headless-shell', 'chrome', 'chromium', 'google-chrome', 'chromium-browser']);
  if (fromPath) return fromPath;
  const system = [];
  if (platform === 'win32') {
    const bases = ['ProgramFiles(x86)', 'ProgramFiles', 'ProgramW6432', 'LOCALAPPDATA'].map(key => envValue(env, key)).filter(Boolean);
    if (kind === 'browser') system.push(...bases.map(base => path.join(base, 'Microsoft/Edge/Application/msedge.exe')));
    if (kind === 'browser') system.push(...bases.map(base => path.join(base, 'Google/Chrome/Application/chrome.exe')));
  } else if (platform === 'darwin') {
    system.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  }
  return first(system) || (kind === 'browser' ? managedBrowser() : undefined);
}

function runtimeEnvironment(root, source = process.env) {
  const base = path.join(root, '.cache', 'runtime');
  const home = path.join(base, 'home');
  const temp = path.join(base, 'tmp');
  const env = { ...source, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    TEMP: temp, TMP: temp, TMPDIR: temp, XDG_CACHE_HOME: path.join(base, 'xdg-cache'), XDG_CONFIG_HOME: path.join(base, 'xdg-config'),
    npm_config_cache: path.join(root, '.cache', 'npm'), PUPPETEER_CACHE_DIR: path.join(base, 'puppeteer'), HYPERFRAMES_FONT_CACHE_DIR: path.join(base, 'fonts'),
    HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_NO_AUTO_INSTALL: '1' };
  for (const directory of [home, temp, env.APPDATA, env.LOCALAPPDATA, env.XDG_CACHE_HOME, env.XDG_CONFIG_HOME, env.PUPPETEER_CACHE_DIR, env.HYPERFRAMES_FONT_CACHE_DIR]) fs.mkdirSync(directory, { recursive: true });
  return env;
}

module.exports = { resolveExecutable, runtimeEnvironment };
