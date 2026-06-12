import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

let cfProcess = null;
let cfUrl = null;
let cfPromise = null;
let statusCallback = null;

export function startCloudflared(port) {
  if (cfPromise) return cfPromise;
  cfPromise = new Promise((resolve, reject) => {
    cfProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let resolved = false;
    const rl = createInterface({ input: cfProcess.stderr });
    rl.on('line', (line) => {
      const match = line.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
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
      else if (!resolved) reject(new Error(`cloudflared exited with code ${code} before tunnel URL was ready`));
      cfProcess = null;
    });
    cfProcess.on('error', (err) => {
      cfPromise = null;
      if (!resolved) { resolved = true; reject(err); }
    });
  });
  return cfPromise;
}

export function connect(opts) {
  const port = opts.port || opts.addr || 8081;
  statusCallback = opts.onStatusChange || null;
  if (cfPromise) { cfProcess.kill(); cfProcess = null; cfPromise = null; cfUrl = null; }
  return startCloudflared(port);
}

export async function disconnect() {}

export async function kill() {
  if (cfProcess) { cfProcess.kill(); cfProcess = null; }
  cfPromise = null; cfUrl = null; statusCallback = null;
}

export function getUrl() { return cfUrl; }
export function getApi() { return null; }
export function getVersion() { return '1.0.0'; }
export function getActiveProcess() { return cfProcess; }
