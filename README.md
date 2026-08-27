# duet photo booth

A responsive virtual photo-booth MVP for couples in different places.

## Live app

https://keepsake-booth.vercel.app

## Development record

See [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md) for the design research,
theme decisions, camera-compositing approach, paired-browser test process, and
deployment history used to reach the current build.

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
- Three polished booth themes: Classic, an inside-the-washer-drum view, and a combined Elevator CCTV scene
- Optional synchronized face-tracked props for both participants: funky glasses, party hats, and cat ears
- Bundled public-domain/CC0 photography with source and license records in `public/theme-assets/LICENSES.md`
- On-device MediaPipe pose and hand tracking merged into full-person masks and shared AR-prop placement
- Browser camera capture with a five-second countdown
- Ten-shot contact sheet and ordered selection
- Filters, frames, stickers, names, date, and photo repositioning
- Direct high-resolution PNG download and native sharing

## Realtime architecture

Vercel hosts the Vite application as **Keepsake Booth**. PeerJS Cloud brokers the initial connection; video, audio, and state updates then travel directly between browsers over encrypted WebRTC. MediaPipe creates pose segmentation masks and tracks 33 body landmarks plus 21 landmarks per detected hand on-device. The limb and hand geometry is merged into each matte so movement remains visible without sending camera frames to a segmentation service. Captured photos and completed strips stay in browser memory; downloads go directly from the webpage to the user's device.

For a larger production launch, self-host PeerServer and configure a TURN relay so connections also work across restrictive corporate or carrier networks.

## Deploy to Vercel

```bash
npx vercel@latest login
npx vercel@latest --prod
```
