#!/usr/bin/env node
import { patch } from '../src/patch.mjs';

const result = patch(process.cwd());
if (result.ok) {
  console.log('expo-cloudflare-tunnel: patched successfully');
} else {
  const failures = Object.entries(result.results)
    .filter(([, r]) => !r.ok)
    .map(([k, r]) => `  ${k}: ${r.reason}`)
    .join('\n');
  console.error(`expo-cloudflare-tunnel: patch failed\n${failures}`);
  process.exit(1);
}
