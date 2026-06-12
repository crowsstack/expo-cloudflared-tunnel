import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PATCH_MARKER = '// @patch:cloudflared';

function isAlreadyPatched(filePath) {
  if (!existsSync(filePath)) return false;
  return readFileSync(filePath, 'utf-8').includes(PATCH_MARKER);
}

function makeNgrokReplacement() {
  return `${PATCH_MARKER}
const { spawn } = require('child_process');
const { createInterface } = require('readline');

class NgrokClientError extends Error {
  constructor(message, body = null) {
    super(message);
    this.body = body;
    this.statusCode = body ? body.statusCode || 500 : 500;
  }
}

let cfProcess = null;
let cfUrl = null;
let cfPromise = null;
let statusCallback = null;

function startCloudflared(port) {
  if (cfPromise) return cfPromise;
  cfPromise = new Promise((resolve, reject) => {
    cfProcess = spawn('cloudflared', ['tunnel', '--url', \`http://localhost:\${port}\`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let resolved = false;
    const rl = createInterface({ input: cfProcess.stderr });
    rl.on('line', (line) => {
      const match = line.match(/https:\\/\\/[\\w-]+\\.trycloudflare\\.com/);
      if (match && !resolved) {
        resolved = true;
        cfUrl = match[0];
        if (statusCallback) statusCallback('connected');
        resolve(cfUrl);
      }
    });
    cfProcess.on('exit', (code) => {
      cfPromise = null;
      if (resolved && statusCallback) statusCallback('closed');
      else if (!resolved) reject(new Error(\`cloudflared exited with code \${code} before tunnel URL was ready\`));
      cfProcess = null;
    });
    cfProcess.on('error', (err) => {
      cfPromise = null;
      if (!resolved) { resolved = true; reject(err); }
    });
  });
  return cfPromise;
}

async function connect(opts) {
  const port = opts.port || opts.addr || 8081;
  statusCallback = opts.onStatusChange || null;
  if (cfPromise) { cfProcess.kill(); cfProcess = null; cfPromise = null; cfUrl = null; }
  return startCloudflared(port);
}
async function disconnect() {}
async function kill() {
  if (cfProcess) { cfProcess.kill(); cfProcess = null; }
  cfPromise = null; cfUrl = null; statusCallback = null;
}
function getUrl() { return cfUrl; }
function getApi() { return null; }
function getVersion() { return '1.0.0'; }
function getActiveProcess() { return cfProcess; }

module.exports = {
  connect, disconnect,
  authtoken: async () => {},
  kill, getUrl, getApi, getVersion, getActiveProcess,
  NgrokClientError
};`;
}

function findNgrokIndexInPnpm(projectRoot) {
  const pnpmDir = resolve(projectRoot, 'node_modules', '.pnpm');
  if (!existsSync(pnpmDir)) return null;
  const entries = readdirSync(pnpmDir);
  const pkgDir = entries.find((e) => e.startsWith('@expo+ngrok@'));
  if (!pkgDir) return null;
  const target = resolve(pnpmDir, pkgDir, 'node_modules', '@expo', 'ngrok', 'index.js');
  return existsSync(target) ? target : null;
}

function findNgrokIndexInNodeModules(projectRoot) {
  const target = resolve(projectRoot, 'node_modules', '@expo', 'ngrok', 'index.js');
  return existsSync(target) ? target : null;
}

function ensureNgrokIndex(projectRoot) {
  let target = findNgrokIndexInPnpm(projectRoot);
  if (target) return { target, source: 'pnpm' };

  target = findNgrokIndexInNodeModules(projectRoot);
  if (target) return { target, source: 'node_modules' };

  const ngrokDir = resolve(projectRoot, 'node_modules', '@expo', 'ngrok');
  const srcDir = resolve(ngrokDir, 'src');
  const indexFile = resolve(ngrokDir, 'index.js');
  const clientFile = resolve(srcDir, 'client.js');

  mkdirSync(srcDir, { recursive: true });
  writeFileSync(clientFile, `${PATCH_MARKER}
class NgrokClientError extends Error {
  constructor(message, body = null) {
    super(message);
    this.body = body;
    this.statusCode = body ? body.statusCode || 500 : 500;
  }
}
module.exports = { NgrokClientError };
`, 'utf-8');

  writeFileSync(indexFile, makeNgrokReplacement(), 'utf-8');
  console.log('Created stub @expo/ngrok at: ' + indexFile);
  return { target: indexFile, source: 'stub' };
}

function patchNgrokIndex(projectRoot) {
  const { target, source } = ensureNgrokIndex(projectRoot);

  if (source !== 'stub' && isAlreadyPatched(target)) {
    return { ok: true, skipped: true, path: target };
  }

  writeFileSync(target, makeNgrokReplacement(), 'utf-8');
  return { ok: true, skipped: false, path: target, source };
}

const ORIGINAL_GET_CONNECTION_PROPS = [
  '    async _getConnectionPropsAsync() {',
  '        const userDefinedSubdomain = _env.env.EXPO_TUNNEL_SUBDOMAIN;',
  '        if (userDefinedSubdomain) {',
  '            const subdomain = typeof userDefinedSubdomain === \'string\' ? userDefinedSubdomain : await this._getProjectSubdomainAsync();',
  '            debug(\'Subdomain:\', subdomain);',
  '            return {',
  '                subdomain',
  '            };',
  '        } else {',
  '            const hostname = await this._getProjectHostnameAsync();',
  '            debug(\'Hostname:\', hostname);',
  '            return {',
  '                hostname',
  '            };',
  '        }',
  '    }',
].join('\n');

const PATCHED_GET_CONNECTION_PROPS = [
  '    async _getConnectionPropsAsync() {',
  '        const userDefinedSubdomain = _env.env.EXPO_TUNNEL_SUBDOMAIN;',
  '        if (userDefinedSubdomain) {',
  '            debug(\'Subdomain:\', userDefinedSubdomain);',
  '            return { subdomain: userDefinedSubdomain };',
  '        } else {',
  '            debug(\'Hostname: localhost\');',
  '            return {};',
  '        }',
  '    }',
].join('\n');

function getAsyncNgrokPath(projectRoot) {
  const pnpmDir = resolve(projectRoot, 'node_modules', '.pnpm');
  if (!existsSync(pnpmDir)) return null;
  const entries = readdirSync(pnpmDir);
  const cliDir = entries.find((e) => e.startsWith('@expo+cli@54'));
  if (!cliDir) return null;
  const target = resolve(pnpmDir, cliDir, 'node_modules', '@expo', 'cli', 'build', 'src', 'start', 'server', 'AsyncNgrok.js');
  return existsSync(target) ? target : null;
}

function patchAsyncNgrok(projectRoot) {
  const target = getAsyncNgrokPath(projectRoot);
  if (!target) return { ok: false, reason: 'AsyncNgrok.js not found (may be a different @expo/cli version)' };

  if (isAlreadyPatched(target)) {
    return { ok: true, skipped: true, path: target };
  }

  let content = readFileSync(target, 'utf-8');

  content = content.replace(
    'const TUNNEL_TIMEOUT = 10 * 1000;',
    `${PATCH_MARKER}\nconst TUNNEL_TIMEOUT = 30 * 1000;`,
  );

  content = content.replace(ORIGINAL_GET_CONNECTION_PROPS, PATCHED_GET_CONNECTION_PROPS);

  writeFileSync(target, content, 'utf-8');
  return { ok: true, skipped: false, path: target };
}

export function patch(projectRoot = process.cwd()) {
  const results = {
    ngrokIndex: patchNgrokIndex(projectRoot),
    asyncNgrok: patchAsyncNgrok(projectRoot),
  };
  const allOk = results.ngrokIndex.ok && results.asyncNgrok.ok;
  return { ok: allOk, results };
}
