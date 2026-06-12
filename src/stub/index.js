// @patch:cloudflared
// Provided by expo-cloudflare-tunnel — replaces @expo/ngrok with cloudflared
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

function connect(opts) {
  const port = opts.port || opts.addr || 8081;
  statusCallback = opts.onStatusChange || null;
  if (cfPromise) { cfProcess.kill(); cfProcess = null; cfPromise = null; cfUrl = null; }
  return startCloudflared(port);
}
function disconnect() {}
function kill() {
  if (cfProcess) { cfProcess.kill(); cfProcess = null; }
  cfPromise = null; cfUrl = null; statusCallback = null;
}
function getUrl() { return cfUrl; }
function getApi() { return null; }
function getVersion() { return '1.0.0'; }
function getActiveProcess() { return cfProcess; }

module.exports = {
  connect, disconnect,
  authtoken: () => Promise.resolve(),
  kill, getUrl, getApi, getVersion, getActiveProcess,
  NgrokClientError
};
