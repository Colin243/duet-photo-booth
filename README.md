# duet photo booth

A responsive virtual photo-booth MVP for couples in different places.

## Live app

https://duet-live-sigma.vercel.app

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Camera access requires `localhost` or HTTPS.

## Included

- Shareable live rooms with real partner connection state
- Peer-to-peer WebRTC video and audio
- Synchronized layout, theme, navigation, and shutter countdown
- Classic and wide strip layouts
- Seven canvas-rendered booth themes
- Browser camera capture with a five-second countdown
- Ten-shot contact sheet and ordered selection
- Filters, frames, stickers, names, date, and photo repositioning
- High-resolution PNG export and native sharing

## Realtime architecture

Vercel hosts the static Vite application. PeerJS Cloud brokers the initial connection; video, audio, and state updates then travel directly between browsers over encrypted WebRTC. Photos stay in browser memory and are not uploaded by this app.

For a larger production launch, self-host PeerServer and configure a TURN relay so connections also work across restrictive corporate or carrier networks.

## Deploy to Vercel

```bash
npx vercel@latest login
npx vercel@latest --prod
```
