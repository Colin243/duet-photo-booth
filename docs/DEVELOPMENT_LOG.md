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
| Elevator CCTV | Security camera in the top-right ceiling corner | Original generated high-angle cabin background, downward composition, cool monitor grade, scanlines, recording indicator, timestamp, and lift-cabin label |

The realism pass used these references:

- TagBooth's washing-machine photo booth, which uses an actual front-loader frame as the interactive set: https://tagbooth.com.my/washing-machine-photobooth-malaysia-unique-creative-event-experience/
- The Film elevator booth review, describing burnished walls, mirror, handrail, faux buttons, aluminum flooring, and an elevated CCTV-style angle: https://thesmartlocal.my/the-film-ss15/
- PLAN.B Studio's stainless elevator photo booth and integrated self-service controls: https://planbstudio.bizplace.kr/

The washer camera now sits inside the machine and faces outward. A real CC0
laundromat is drawn first, both people stand in that outside space and are
visible only through the circular opening, and the barrel texture, perforations,
and gasket are drawn last at close range. Elevator CCTV uses a purpose-generated
empty cabin from a steep top-right security-camera angle; people are scaled
smaller and lower so they occupy the floor rather than appearing at eye level.
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
- Production: https://duet-live-sigma.vercel.app
- Realistic-theme implementation commit: `c118247`

The Vercel project tracks the repository's `main` branch, so an accepted push
automatically creates the next production deployment.
