#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = process.cwd();
const pnpmLock = resolve(projectRoot, 'pnpm-lock.yaml');

if (existsSync(pnpmLock)) {
  // pnpm: use overrides so it survives pnpm install
  const pkgPath = resolve(projectRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const hasOverride = pkg.pnpm?.overrides?.['@expo/ngrok'];
  if (!hasOverride) {
    pkg.pnpm = pkg.pnpm || {};
    pkg.pnpm.overrides = pkg.pnpm.overrides || {};
    pkg.pnpm.overrides['@expo/ngrok'] = 'link:./node_modules/expo-cloudflare-tunnel/src/stub';
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('[@expo/ngrok] Added pnpm.overrides to package.json — will persist across installs');
  }
} else {
  // npm / yarn: write @expo/ngrok stub directly into node_modules
  const ngrokDir = resolve(projectRoot, 'node_modules', '@expo', 'ngrok');
  if (!existsSync(ngrokDir)) {
    mkdirSync(ngrokDir, { recursive: true });
    writeFileSync(resolve(ngrokDir, 'package.json'), JSON.stringify({
      name: '@expo/ngrok',
      version: '0.0.0-cloudflared',
      description: 'Provided by expo-cloudflare-tunnel — cloudflared tunnel',
      main: 'index.js',
      private: true,
    }));
    writeFileSync(resolve(ngrokDir, 'index.js'),
      "module.exports = require('expo-cloudflare-tunnel/src/stub/index.js');\n",
    );
    console.log('[@expo/ngrok] Created node_modules/@expo/ngrok stub');
  }
}

// Run the direct file patch to replace ngrok's installed files with the cloudflared stub
import('../src/patch.mjs').then(({ patch }) => {
  const result = patch(projectRoot);
  if (result.ok) {
    if (result.results.ngrokIndex.skipped || result.results.asyncNgrok.skipped) {
      console.log('[@expo/ngrok] Patch up to date');
    }
  } else {
    const failures = Object.entries(result.results)
      .filter(([, r]) => !r.ok)
      .map(([k, r]) => `${k}: ${r.reason || 'failed'}`);
    console.error('[@expo/ngrok] Patch had issues:', failures.join('; '));
  }
}).catch(() => {});
