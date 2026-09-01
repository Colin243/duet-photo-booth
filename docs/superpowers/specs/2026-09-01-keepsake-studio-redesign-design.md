# Keepsake Studio Application Redesign

**Date:** September 1, 2026  
**Status:** Approved design direction, ready for implementation planning

## Objective

Upgrade Keepsake Booth into a cohesive, polished two-person photo-booth experience without changing the behavior of its room synchronization, MediaPipe tracking, compositing, capture, strip generation, or local-download pipeline.

The redesign will preserve the warm editorial personality of the current application while making every stage feel like one product. The visual direction is called **Keepsake Studio**: warm ivory surfaces, ink-plum typography, dusty berry interaction color, neutral pastel-blue accents, restrained print-inspired details, and camera-first hierarchy.

## Product Principles

1. **The people and their photos are the focus.** Decorative elements support the camera and output instead of competing with them.
2. **Shared choices and personal choices remain explicit.** Layout, scene, navigation, and capture stay synchronized. Face filters, skin softening, and participant size stay participant-controlled.
3. **The interface explains what happens next.** Every waiting, permission, tracking, capture, selection, development, and download state has clear feedback and recovery.
4. **Playful does not mean cluttered.** Personality comes from typography, photographic composition, sprite artwork, and small motion moments rather than excessive gradients, emojis, or floating decoration.
5. **Mobile is a first-class booth.** Controls must remain reachable, readable, and unobstructed at 375-390 px widths.

## Scope and Boundaries

### In scope

- Visual system and responsive application shell
- Landing, room, setup, ready, booth, selection, customization, development, and reveal UI
- Synchronized back navigation within the three setup steps
- Camera permission and camera-error recovery UI
- Booth-control hierarchy and responsive presentation
- Selection and customization usability
- Keyboard, contrast, focus, touch-target, and reduced-motion improvements
- Favicon and browser metadata polish
- Lint, unit/component test, and build scripts
- Automated and visual verification of the critical two-participant flow

### Out of scope

- Changing the PeerJS message protocol except for reusing the existing synchronized screen-state message for backward setup navigation
- Replacing MediaPipe, adding a second computer-vision library, or changing landmark/masking algorithms
- Changing the existing participant normalization, priority, filter anchoring, washer pose, or mask-cleanup work currently present in the working tree
- Server-side photo storage, user accounts, analytics, or a backend database
- New themes, new filters, GIF export, or video export
- Redesigning the generated photo-strip canvas format beyond matching revised brand tokens where the current renderer already exposes them

## Existing Architecture and Preservation Strategy

The application is a React 18/Vite single-page app. `App.tsx` owns the screen state, PeerJS connection, camera lifecycle, MediaPipe trackers, canvas compositing, captured photos, customization data, and final strip generation. Most visual styles are inline, with a global CSS template embedded in that file.

Implementation will use a **targeted presentation refactor**:

- Keep the computer-vision and canvas engine in place.
- Keep the existing screen state and component props unless a UI requirement needs a small extension.
- Move reusable design tokens and responsive classes into a dedicated stylesheet.
- Add a small set of reusable presentational components for brand mark, setup progress, buttons, choice cards, status messages, and segmented controls.
- Avoid a wholesale file split of the tracking or rendering engine during this redesign.

This approach improves consistency and testability without mixing visual changes with a risky engine rewrite.

## Visual System

### Color

- **Canvas:** warm ivory `#FBF7F2`
- **Raised surface:** soft white `#FFFDFC`
- **Primary text:** ink plum `#2D1B2E`
- **Secondary text:** muted mauve `#80697A`
- **Primary action:** dusty berry `#C85278`
- **Primary hover/pressed:** deep berry `#A93F63`
- **Supporting accent:** neutral pastel blue `#BFDCE8`
- **Supporting surface:** pale blue `#EDF6FA`
- **Borders:** translucent plum at approximately 12-18% opacity
- **Success:** muted evergreen, used with text or an icon rather than color alone
- **Error:** accessible deep red on a pale red recovery panel

Gradients will not be used as the default button treatment. They may remain inside photographic theme artwork but not as a substitute for hierarchy.

### Typography

- **Display:** DM Serif Display for major emotional headings and the final reveal
- **Interface/body:** Nunito for controls, helper text, status, and metadata
- **Handwritten:** Dancing Script only inside generated-strip names and limited print-preview details

Headings will use a compact editorial scale. Body copy will stay between 15 and 17 px with readable line height. Tiny uppercase labels will not drop below 11 px on desktop or mobile.

### Shape and elevation

- Primary card radius: 20 px
- Compact control radius: 12-14 px
- Pills reserved for status, participant selection, and compact segmented controls
- Shadows remain soft and low-contrast, with stronger elevation only for the active camera or final print
- Selected choices use a border, soft tinted fill, and checkmark; they never rely on color alone

### Icons

Lucide icons will replace interface emojis for actions, tabs, privacy, link sharing, tips, and status. Existing custom SVG filter sprites remain because they communicate the actual filter appearance. Decorative emojis on the landing page and coming-soon panel will be removed.

### Motion

- 150-240 ms interaction transitions
- One restrained entrance transition per screen
- Capture countdown and flash remain prominent functional motion
- Floating decorations and grain animation will be reduced
- `prefers-reduced-motion: reduce` will disable nonessential movement, looping animation, and smooth transforms

## Shared Application Shell

Setup and editing screens will use a shared responsive shell with:

- Compact Keepsake Booth brand mark
- Clear stage title and helper copy
- A three-step progress indicator for Layout, Scene, and Ready
- A synchronized Back action on setup steps two and three
- A consistent maximum content width and vertical rhythm
- A single primary action location at the bottom of the content region

The room, booth, selection, customization, and reveal screens will not pretend to be part of the three-step setup, but will share the same brand tokens and action patterns.

## Screen Designs

### Landing

Desktop uses an asymmetric two-column composition: a controlled cluster of two or three real sample strips on one side and the brand, headline, privacy statement, and room actions on the other. Duplicate decorative strips are removed.

Mobile places one compact strip composition above the headline. No strip may overlap interactive content or body text. Start and join actions become full-width, with a properly associated room-code label and visible disabled state. The privacy statement uses a Lucide lock icon and accessible contrast.

### Room

The room code becomes the main artifact, with a copy-invite action, explicit private peer-to-peer explanation, and a clear connection card showing Waiting, Connected, or Disconnected. Waiting animation is restrained and reduced-motion safe. The continue action remains disabled until the partner connects.

### Layout

Layout cards show realistic mini strip previews, output count, and a concise explanation of when each format works best. Selection state includes a check icon and clear border/fill treatment. The step header replaces the isolated `STEP 1 / 3` label.

### Scene and starting filter

Scene cards use the actual theme artwork as a visual preview with text in a separate high-contrast region rather than over the image. The filter area shows the actual custom sprite for every selectable starting filter. On mobile, both groups use horizontal snap scrolling with all choices remaining keyboard reachable.

Shared scene and personal filter choices are labeled with short badges: `Shared choice` and `Only you`.

### Ready and camera recovery

The camera preview remains dominant. The partner picture-in-picture view stays visible when connected. Skin softening becomes a clearly labeled personal segmented control.

Camera state is represented explicitly:

- `requesting`: loading message and brief permission explanation
- `ready`: live preview and enabled continue action
- `denied`: explanation, browser-settings guidance, and Retry camera button
- `unavailable`: device/browser guidance and Retry button
- `failed`: concise error and Retry button

The application must never remain indefinitely on `Requesting camera…` after `getUserMedia` rejects.

### Booth

The camera remains the largest element. The control order will be:

1. Participant proximity
2. Personal size
3. Personal filter sprites
4. Front-person priority

Tracking status becomes a compact non-competing status line. Capture progress is represented once as `3 of 10` with a single progress indicator. The shutter remains the strongest control.

On desktop, controls sit in a compact studio console below the camera. On mobile, filters remain immediately visible while size, proximity, and priority use compact collapsible rows or a bottom control tray. All controls retain 44 px minimum interactive targets.

The existing drawing, tracking, normalization, participant priority, capture countdown, and photo-output logic must remain functionally unchanged.

### Photo selection

The contact sheet uses soft neutral borders instead of black frames. Selected images receive a tinted border, checkmark, and prominent order number. The fixed or sticky action area reports `4 of 6 selected` and explains that tapping a selected photo removes it. Desktop uses a balanced grid; mobile uses two columns.

### Customization

Desktop uses a balanced two-column workspace:

- Left: larger sticky strip preview
- Right: editing panel with Frame, Filter, Stickers, and Names tabs

Tabs use Lucide icons and text. The active tool is visually clear. Frame colors receive accessible names. Photo-filter choices show thumbnail previews. Stickers remain the playful emoji artwork because they are user-created photo content, not interface icons. Names and date fields receive persistent labels.

Mobile uses the preview first and a sticky bottom tool switcher. The active panel expands beneath the preview without horizontal page overflow. The Develop action remains visible after tool content.

### Development and reveal

Development uses a small print-processing animation with reduced-motion fallback and `Developing your strip` copy. The final screen keeps the successful editorial reveal and large print preview, but consolidates the three actions into a clear primary/secondary hierarchy.

Download success or error appears adjacent to the download action. The unimplemented GIF/video teaser is removed so the finished flow ends with the user’s photo rather than a future feature.

## Data Flow and Synchronization

- Existing `STATE` messages continue synchronizing screen, layout, and theme.
- Back actions call the existing synchronized navigation mechanism.
- Personal filter, smoothing, and scale settings continue using their existing per-participant messages.
- Front-person selection remains synchronized.
- No visual state will be transmitted unless the underlying choice already needs to be shared.
- UI-only state such as an open customization tab or collapsed mobile booth row remains local.

## Error Handling

- Camera rejection is stored as a recoverable UI state, not swallowed.
- Retry creates a new camera request without requiring a page refresh.
- Peer disconnection remains visible and does not masquerade as a ready state.
- Tracking initialization retains Loading, Ready, and Error states with more concise presentation.
- Download keeps Working, Success, and Error states with the current local-only privacy message.
- All errors include an actionable next step where one exists.

## Accessibility Requirements

- Visible `:focus-visible` treatment for every interactive element
- Persistent labels for inputs and sliders
- Accessible names for color choices and icon-only controls
- `aria-pressed` for selectable filter, theme, layout, and participant controls where appropriate
- Minimum 44 by 44 px touch targets
- WCAG AA contrast for normal text and controls
- Status changes exposed through appropriate live regions when useful
- Keyboard-complete setup, booth controls, photo selection, customization, and reveal actions
- Reduced-motion handling for grain, floating strips, countdown embellishments, entrances, and developing animation
- No information communicated by color alone

## Performance Requirements

- Do not add visual effects that continuously repaint over the camera canvas.
- Use CSS transforms and opacity for UI motion.
- Apply the `willReadFrequently` canvas context option where the existing repeated pixel readback warrants it and verification confirms no rendering regression.
- Keep new assets local and optimized.
- Avoid adding a general animation library.
- Preserve lazy initialization of the computer-vision pipeline at the booth stage.

## Testing and Verification

### Tooling

- Add an ESLint script covering TypeScript and React hooks.
- Add Vitest and React Testing Library for focused UI behavior tests.
- Keep Vite production build as the release build check.

### Automated coverage

- Landing room-code validation and join enablement
- Setup selection and back/forward navigation
- Camera error and retry presentation
- Selection limit and selection-order feedback
- Customization tab switching and labeled controls
- Download success/error feedback where practical
- Pure utilities that are touched during the work

MediaPipe, WebRTC, and browser download integration will remain primarily browser-tested because they depend on real media and peer behavior.

### Browser flow verification

Run paired simulated participants through:

1. Host creation and guest join
2. Synchronized layout and scene navigation
3. Independent filters and skin softening
4. Ready preview
5. Tracking initialization
6. Size, proximity, filter, and priority controls
7. Ten captures
8. Photo selection
9. All customization tabs
10. Strip development
11. Direct download
12. Start again

Visually inspect at 390x844, 768x1024, 1440x1000, and a wide desktop viewport. Test Classic, Washer POV, and Elevator CCTV presentation without changing their rendering engine.

## Acceptance Criteria

- No decorative element overlaps meaningful content at supported viewport sizes.
- Every major screen has a clear primary action and consistent hierarchy.
- The customization editor uses the available viewport effectively on desktop and mobile.
- Camera failures provide recovery instead of an indefinite loading state.
- All current synchronized and per-participant booth behaviors still work.
- A full ten-photo simulated paired session reaches a downloadable strip.
- The previously approved masking, tracking, normalization, washer-pose, and filter-placement changes remain intact.
- Keyboard focus, reduced motion, labels, and contrast meet the accessibility requirements above.
- Tests, lint, and production build pass with no new application errors.

