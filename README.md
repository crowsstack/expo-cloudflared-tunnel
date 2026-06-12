# expo-cloudflare-tunnel

Replace `@expo/ngrok` with `cloudflared` tunnel for Expo dev builds.

[![npm](https://img.shields.io/npm/v/expo-cloudflare-tunnel)](https://www.npmjs.com/package/expo-cloudflare-tunnel)
[![GitHub](https://img.shields.io/badge/github-crowsstack/expo--cloudflared--tunnel-blue)](https://github.com/crowsstack/expo-cloudflared-tunnel)

## Install

```bash
npx expo install expo-cloudflare-tunnel --save-dev
```

Or with pnpm:

```bash
pnpm add -D expo-cloudflare-tunnel @expo/ngrok@^4.1.0
```

## How it works

The `postinstall` script patches Expo's installed `@expo/ngrok` files to spawn `cloudflared` instead.
When you run `expo start --tunnel`, Expo loads the patched ngrok → cloudflared runs instead.

## Usage

```bash
# After install, just use the normal tunnel command:
npx expo start --tunnel

# The postinstall patch happens automatically on install.
# To re-patch manually:
npx expo-tunnel
```

## API

```js
import { connect, disconnect, kill, getUrl } from 'expo-cloudflare-tunnel'
// or
import { patch } from 'expo-cloudflare-tunnel/patch'
await patch(projectRoot)
```

---

[npm](https://www.npmjs.com/package/expo-cloudflare-tunnel) · [GitHub](https://github.com/crowsstack/expo-cloudflared-tunnel)
