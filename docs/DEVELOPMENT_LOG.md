# Development log

This document records the product and engineering decisions behind the current
Duet photo booth so future changes can build on evidence instead of restarting
the design process.

## Product direction

Duet is a browser photo booth for two people in different locations. The target
experience is a shared physical booth: both people see the same layout and
scene, their camera backgrounds are removed locally, their cutouts are placed
together, the shutter fires at the same time, and the completed strip downloads
directly from the webpage.

The working principles are:

- Keep both participants synchronized throughout the session.
- Preserve body, arm, and hand movement instead of using a head-and-shoulders crop.
- Keep camera processing on-device and avoid permanent photo storage.
- Use scenes that resemble believable photo-booth sets rather than generic effects.
- Test every major visual change with two connected browser cameras before deployment.
- Keep a plain original booth available even as playful scenes and effects are added.

## Iteration history

### Live-room synchronization

Layout choice, theme choice, screen navigation, and shutter timing are sent over
the same peer-to-peer room connection as the partner-presence state. Either
participant therefore sees the current shared choice rather than maintaining a
separate local setup.

### Person masking and movement

The mask pipeline uses MediaPipe Pose Landmarker segmentation, 33 pose
landmarks, and up to 21 landmarks for each detected hand. Landmarks lower the
segmentation threshold only near plausible limbs; they do not paint an opaque
skeleton into the image. This preserves uncertain moving hands without exposing
large pieces of the original room.

Tracked points also guide horizontal framing. The full vertical camera frame is
kept available so raising an arm does not cause an internal crop halfway through
the booth rectangle.

### Shared face-tracked props

Classic Plain remains the original no-frills booth. The optional prop layer now
uses a deliberately low-resolution, early-digital sticker language inspired by
contemporary Chinese social-camera aesthetics: Pixel Hearts, an 8-bit Star
Crown, and Retro Kitty ears with square blush and whiskers. The shapes are
original canvas drawings rather than copied platform assets or logos.

The filter choice is part of the synchronized room state, so either
participant's selection updates both browsers and the same treatment appears on
both people.

The first prop pass reuses Pose Landmarker eye points instead of loading a third
computer-vision model. Eye spacing controls scale, the line between the eyes
controls rotation, and each person's crop transform maps the prop into the final
composite. Pixel blocks are scaled from eye distance and intentionally rendered
without smoothing, preserving their hard retro edges as either person moves.
Filters appear in both the live preview and captured photo while adding very
little work to the existing tracking loop.

### Optional participant-controlled skin softening

The ready screen offers Natural, Soft, and Extra Soft settings. Natural is the
default. Each participant chooses only their own level; a small peer-to-peer
message carries that preference to the partner so both browsers render the same
final composite without allowing either person to alter the other's setting.

Softening is limited to an oval derived from the Pose Landmarker eye points. A
low-opacity blurred copy is blended over the original face while the unfiltered
frame remains beneath it, retaining eye detail, expression, hair, body edges,
and tracked props. No facial images or beauty preferences are uploaded or
stored, and the selected treatment is included in the captured photo.

### Theme reduction and realism pass

The earlier Airplane, Kitchen, and Arcade scenes were removed. They were visually
distinct but did not yet resemble convincing physical sets, and the large
Airplane overlay could cross the participants' faces.

The scene lineup was reduced again after visual review. Elevator and CCTV now
form one scene, while Laundromat has become a first-person view from inside the
machine drum:

| Scene | Current direction | Key implementation details |
| --- | --- | --- |
| Classic | Soft daylight studio | White-to-pastel-blue wall, central glow, restrained floor depth |
| Washer POV | Camera inside the open machine looking outward | CC0 laundromat beyond the opening, people standing outside, close foreground barrel texture, circular gasket, perforations, and vignette |
| Elevator CCTV | Security camera in the top-right ceiling corner | Cute cream, blush, and powder-blue photo-studio lift set, downward composition, soft scanlines, pink recording indicator, timestamp, and photo-lift label |

The realism pass used these references:

- TagBooth's washing-machine photo booth, which uses an actual front-loader frame as the interactive set: https://tagbooth.com.my/washing-machine-photobooth-malaysia-unique-creative-event-experience/
- The Film elevator booth review, describing burnished walls, mirror, handrail, faux buttons, aluminum flooring, and an elevated CCTV-style angle: https://thesmartlocal.my/the-film-ss15/
- PLAN.B Studio's stainless elevator photo booth and integrated self-service controls: https://planbstudio.bizplace.kr/

The washer camera now sits inside the machine and faces outward. A real CC0
laundromat is drawn first, both people stand in that outside space and are
visible only through the circular opening, and the barrel texture, perforations,
and gasket are drawn last at close range. Elevator CCTV uses a purpose-generated
photo-booth-store lift set from a steep top-right security-camera angle. Cream,
blush, powder blue, rounded panels, and soft studio lighting replace the earlier
dark industrial steel; people remain smaller and lower so they occupy the floor
rather than appearing at eye level.
Source and generation records live beside the assets in
`public/theme-assets/LICENSES.md`.

## Verification process

Every release follows this loop:

1. Research real references and identify the physical details that make a set recognizable.
2. Implement the scene with canvas-native shapes so it remains responsive and exportable.
3. Run the production build locally.
4. Connect a host and guest in separate browser tabs with two live camera streams.
5. Confirm both participants receive the same layout, theme, and navigation state.
6. Enter each booth scene and wait for both masks to report ready.
7. Confirm the capture button enables and inspect the live composite visually.
8. Check browser logs for mask-frame, timestamp, and peer-connection failures.
9. Commit and push the tested files to `main`.
10. Wait for Vercel's GitHub deployment status and verify the public URL returns successfully.

For the initial realistic-theme release, Laundromat, Elevator, and CCTV each
passed the paired-camera run. The later photo-backed Washer Drum and combined
Elevator CCTV scenes retain the same synchronized scene state and person-mask
pipeline. Their paired-camera verification confirmed that scene navigation
reached both browsers, both trackers reported ready, the shutter enabled, and
the photographic layers loaded without application or peer-connection errors.
MediaPipe emitted only its normal WebGL/delegate startup notices.

## Privacy and artifacts

Camera frames, captured moments, and generated strips remain in browser memory.
The live test screenshots are kept locally for review and are intentionally not
committed because they contain personal camera imagery. The public repository
contains application code and documentation only.

## Deployment

- Repository: https://github.com/Colin243/duet-photo-booth
- Vercel project: `keepsake-booth`
- Production: https://keepsake-booth.vercel.app
- Legacy alias retained for existing invitations: https://duet-live-sigma.vercel.app
- Realistic-theme implementation commit: `c118247`

The Vercel project tracks the repository's `main` branch, so an accepted push
automatically creates the next production deployment.

## Keepsake Studio redesign QA — 2026-09-02

The completed Keepsake Studio pass uses the warm ivory, ink-plum, dusty-berry,
and pastel-blue direction across the landing, room, setup, booth, selection,
customization, development, and reveal flow. The responsive pass keeps the
mobile shell, editor tool tray, booth controls, focus treatment, and
reduced-motion CSS within the presentation boundary. Camera requests remain
recoverable and typed, and the repeated-readback context hint remains limited
to the existing canvas readback boundary.

The MediaPipe model, landmarks, segmentation/mask cleanup, filter anchoring,
participant normalization, priority compositing, capture timing, and output
geometry were not changed during final QA. A paired synthetic-camera Washer
run used `demo=p1` and `demo=p2` with `demoPose=upper`, `demoOverlap=1`, and
`demoMotion=1`: host/guest connection, shared Back/forward, Wide layout,
Washer scene, distinct filters and smoothing, proximity endpoints, size
controls (80/100/120), both front-person choices, tracking, and all ten
captures were exercised. Six photos were selected; every frame and output
filter choice, all customization tabs, sticker pointer drag, names/date,
development, reveal, PNG download, Share invocation, and Start again were
exercised. The browser confirmed a completed local PNG download and Start
again reset the URL to the path with no room/demo query, photos, preferences,
room/role state, and local streams.

The paired-browser keyboard-removal attempt did not achieve focus on the
injected sticker, so browser evidence does not claim Space/Enter removal.
Existing deterministic component coverage in `src/app/App.test.tsx` covers
both keys. This is a harness-evidence limitation, not a reproduced product
defect.

The required local QA images and manifest are intentionally ignored at
`local-reviews/keepsake-studio-redesign-2026-09-02/`. Washer, Classic, and
Elevator each have a paired upper-body/overlap/motion runtime capture with
tracking-ready state and one confirmed photo. Across those visual comparisons,
the filter anchors, equal baseline normalization before size changes,
arms/overlap ordering, Washer inward-facing framing, edge cleanup, capture
dimensions, and scene geometry remained within the protected CV boundary. The
browser's reduced-motion emulation resolved animation and transition duration
to `1e-05s`; 390px document width matched its client width with no horizontal
overflow. Console output contained the allowed upstream MediaPipe XNNPACK
delegate diagnostics, plus one external PeerJS signaling disconnect/503 during
the separate Classic follow-on session; no application-owned exception or
asset/request failure was reproduced.

Final release gate on 2026-09-02: `npm run check` completed typecheck, ESLint,
Vitest (4 files, 38 tests), and Vite build successfully. No push, deployment,
merge, or CV change was made.

### Final lifecycle/accessibility review — 2026-09-02

The final review found two asynchronous ownership gaps outside the protected CV
pipeline. Camera API property access occurred before a promise existed, so a
browser without `mediaDevices` or `getUserMedia` could throw synchronously and
leave the ready UI requesting. Camera acquisition now begins inside the
existing promise chain, so the unchanged request guard classifies that failure
into the recoverable Retry UI and still rejects stale requests safely.

Download completion now carries an App-owned generation token. A new download,
new strip/session, navigation away from reveal, Start again, and unmount all
invalidate the prior generation; only the current operation can publish done
or error feedback. This changes neither the PNG drawing/output bytes nor the
PeerJS contracts.

Focused TDD evidence: the first `npx vitest run src/app/App.test.tsx` run was
RED with the expected synchronous `mediaDevices.getUserMedia` TypeError, no
download lifecycle handle/ownership boundary, and missing 44px/200ms CSS
contracts. After the smallest boundary fixes, the same focused run was GREEN:
34 tests passed. It includes missing-camera Retry UI, deferred download resolve
and reject after Start again, current download success, sticker hit-area
contracts, and screen-entry duration. Placed sticker controls now have a
transparent 44px target centered on the unchanged 17px visual emoji, preserving
the existing preview position and generated-strip coordinates. The base
`.screen-enter` duration is 200ms; the existing reduced-motion override is
unchanged. No browser rerun was needed for these deterministic lifecycle/CSS
checks; the automated component suite exercised the affected runtime paths.
