# Keepsake Studio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a responsive, accessible, visually cohesive Keepsake Studio interface across the complete two-person booth journey without changing the approved tracking, masking, normalization, synchronization, capture, or photo-output behavior.

**Architecture:** Preserve the React state, PeerJS data flow, MediaPipe pipeline, and canvas engine in `App.tsx`. Add a focused shared UI module and dedicated Keepsake stylesheet, then migrate each screen to semantic class-based presentation in independently testable slices. Introduce explicit camera lifecycle state and only the minimum synchronized-navigation change needed for setup Back actions.

**Tech Stack:** React 18, TypeScript, Vite 6, Tailwind 4 build integration, Lucide React, PeerJS, MediaPipe Tasks Vision, Vitest, React Testing Library, ESLint flat config, Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-09-01-keepsake-studio-redesign-design.md`

## Global Constraints

- Work exclusively in `/Users/colin/Desktop/virtual-photo-booth`.
- Preserve the existing GitHub remote, Vercel project, and browser-only photo pipeline.
- Preserve and separately commit the current uncommitted washer-inward pose, hand-mask tightening, mirrored face-centering, and washer-proximity changes before the redesign.
- Do not change MediaPipe models, landmark algorithms, mask cleanup, filter anchoring, participant normalization, or canvas output geometry during visual tasks.
- Do not add an animation library or continuously repaint UI effects over the booth canvas.
- Keep interface motion between 150 and 240 ms; disable nonessential motion under `prefers-reduced-motion: reduce`.
- Use DM Serif Display for emotional headings, Nunito for interface copy, and Dancing Script only inside strip-name treatments.
- Core tokens are `#FBF7F2`, `#FFFDFC`, `#2D1B2E`, `#80697A`, `#C85278`, `#A93F63`, `#BFDCE8`, and `#EDF6FA`.
- Do not use gradients as the default button treatment, emoji as interface icons, or em dashes in visible interface copy.
- Maintain 44 by 44 px targets, WCAG AA contrast, visible focus, persistent labels, and non-color-only selection states.
- Keep QA artifacts under ignored `local-reviews/`; never add them to Git.
- Use `apply_patch` for source/documentation edits and commit each completed task separately.

## File Map

**Create:**

- `src/app/ui/StudioUI.tsx`: brand, button, setup header, status panel, segmented control.
- `src/app/ui/cameraStatus.ts`: camera lifecycle types and error classification.
- `src/app/ui/StudioUI.test.tsx` and `src/app/ui/cameraStatus.test.ts`: focused shared-UI tests.
- `src/app/App.test.tsx`: screen behavior tests using exported screen components.
- `src/test/setup.ts`: jest-dom and cleanup setup.
- `src/styles/keepsake.css`: tokens, shells, responsive layouts, focus, reduced motion.
- `eslint.config.js`: TypeScript/React flat ESLint configuration.
- `public/favicon.svg`: local Keepsake favicon.

**Modify:**

- `package.json`, `package-lock.json`, `vite.config.ts`: quality tooling.
- `src/styles/index.css`: import the Keepsake stylesheet.
- `src/app/App.tsx`: presentation and recoverable camera state while preserving the engine.
- `index.html`: title, description, favicon.
- `docs/DEVELOPMENT_LOG.md`: implementation and QA record.

---

### Task 1: Protect the Existing Computer-Vision Baseline

**Files:**
- Modify: `src/app/App.tsx:217-248, 583-622, 911-938, 1484-1518`

**Interfaces:**
- Consumes: current working-tree changes in `App.tsx`.
- Produces: a clean baseline commit for later visual comparisons.

- [ ] **Step 1: Review the exact patch**

```bash
git diff -- src/app/App.tsx
```

Expected: only washer demo selection/P1 pre-flip, narrower hand support, mirrored face centering, and washer default proximity.

- [ ] **Step 2: Verify the baseline**

```bash
npm run build
test -f local-reviews/washer-inward-facing-trial-2026-09-01/01-true-inward-no-filter-capture.jpg
```

Expected: Vite reports `✓ built`; the trial file exists.

- [ ] **Step 3: Commit only the existing patch**

```bash
git add src/app/App.tsx
git commit -m "Refine washer pose and hand masking"
```

- [ ] **Step 4: Confirm the source tree is clean**

```bash
git status --short
```

Expected: no modified source file.

---

### Task 2: Add Quality Tooling and Shared UI Infrastructure

**Files:**
- Modify: `package.json`, `package-lock.json`, `vite.config.ts`, `src/styles/index.css`
- Create: `eslint.config.js`, `src/test/setup.ts`, `src/styles/keepsake.css`
- Create: `src/app/ui/StudioUI.tsx`, `src/app/ui/StudioUI.test.tsx`

**Interfaces:**
- Produces: `BrandMark`, `StudioButton`, `SetupHeader`, `StatusPanel`, and `SegmentedControl` plus global Keepsake classes.

- [ ] **Step 1: Install and configure the toolchain**

```bash
npm install --save-dev eslint @eslint/js globals typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Set scripts in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"lint": "eslint .",
"check": "npm run lint && npm run test && npm run build"
```

Change `vite.config.ts` to import `defineConfig` from `vitest/config` and add:

```ts
test: {
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  css: true,
},
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(cleanup)
```

- [ ] **Step 2: Create the ESLint flat config**

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'local-reviews', 'public/local-demo'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
)
```

- [ ] **Step 3: Write the failing shared-UI test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupHeader, StatusPanel, StudioButton } from './StudioUI'

describe('Studio UI', () => {
  it('exposes progress and a working back action', async () => {
    const onBack = vi.fn()
    render(<SetupHeader step={2} title="Choose your scene" description="Choose together." onBack={onBack} />)
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('renders semantic status and buttons', () => {
    render(<><StatusPanel tone="success" title="Partner connected">Ready together</StatusPanel><StudioButton>Continue</StudioButton></>)
    expect(screen.getByRole('status')).toHaveTextContent('Partner connected')
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('studio-button')
  })
})
```

- [ ] **Step 4: Prove the test fails**

```bash
npm test -- src/app/ui/StudioUI.test.tsx
```

Expected: FAIL because `StudioUI.tsx` does not exist.

- [ ] **Step 5: Implement the shared components**

Create `StudioUI.tsx` with these implementations:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ArrowLeft, Check, Heart, Info, TriangleAlert } from 'lucide-react'

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} aria-label="Keepsake Booth"><span className="brand-mark__symbol"><Heart aria-hidden="true" /></span><span>Keepsake</span></div>
}

export function StudioButton({ tone = 'primary', block = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'quiet'; block?: boolean }) {
  return <button className={`studio-button studio-button--${tone}${block ? ' studio-button--block' : ''} ${className}`.trim()} {...props} />
}

export function SetupHeader({ step, title, description, onBack }: { step: 1 | 2 | 3; title: string; description: string; onBack?: () => void }) {
  return <header className="setup-header">{onBack && <button className="setup-header__back" onClick={onBack}><ArrowLeft aria-hidden="true" />Back</button>}<p className="setup-header__step">Step {step} of 3</p><div className="setup-header__progress" aria-hidden="true">{[1,2,3].map(value => <span key={value} className={value <= step ? 'is-complete' : ''}>{value < step ? <Check /> : value}</span>)}</div><h1>{title}</h1><p className="setup-header__description">{description}</p></header>
}

export function StatusPanel({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'error'; title: string; children?: ReactNode }) {
  const Icon = tone === 'success' ? Check : tone === 'error' ? TriangleAlert : Info
  return <div className={`status-panel status-panel--${tone}`} role="status"><Icon aria-hidden="true" /><div><strong>{title}</strong>{children && <p>{children}</p>}</div></div>
}

export function SegmentedControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <fieldset className="segmented-control"><legend>{label}</legend><div>{options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div></fieldset>
}
```

- [ ] **Step 6: Add tokens, focus, and reduced-motion CSS**

Import `keepsake.css` after `theme.css`. Begin the stylesheet with:

```css
:root {
  --studio-canvas: #fbf7f2;
  --studio-surface: #fffdfc;
  --studio-ink: #2d1b2e;
  --studio-muted: #80697a;
  --studio-berry: #c85278;
  --studio-berry-pressed: #a93f63;
  --studio-blue: #bfdce8;
  --studio-blue-soft: #edf6fa;
  --studio-border: rgba(45, 27, 46, 0.14);
  --studio-shadow: 0 18px 50px rgba(74, 48, 67, 0.12);
  --studio-radius-card: 20px;
  --studio-radius-control: 13px;
}

button, input, textarea { font: inherit; }
:where(button, input, [tabindex]):focus-visible { outline: 3px solid var(--studio-blue); outline-offset: 3px; }
.studio-button { min-height: 48px; border-radius: var(--studio-radius-control); padding: 0 20px; font-weight: 800; transition: background-color 180ms ease, border-color 180ms ease, transform 180ms ease; }
.studio-button--primary { background: var(--studio-berry); color: #fff; }
.studio-button--primary:hover:not(:disabled) { background: var(--studio-berry-pressed); transform: translateY(-1px); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
```

Complete styles for all Task 2 components with 44 px targets.

- [ ] **Step 7: Verify and commit**

```bash
npm test -- src/app/ui/StudioUI.test.tsx
npm run lint
git add package.json package-lock.json vite.config.ts eslint.config.js src/test/setup.ts src/styles/index.css src/styles/keepsake.css src/app/ui/StudioUI.tsx src/app/ui/StudioUI.test.tsx
git commit -m "Add Keepsake design system and quality tooling"
```

---

### Task 3: Redesign Landing and Room

**Files:**
- Modify: `src/app/App.tsx:1088-1261`, `src/styles/keepsake.css`, `index.html`
- Create: `public/favicon.svg`, `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `BrandMark`, `StudioButton`, `StatusPanel`.
- Produces: exported `LandingScreen` and `RoomScreen` with unchanged callback contracts.

- [ ] **Step 1: Write failing behavior tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LandingScreen, RoomScreen } from './App'

describe('landing and room', () => {
  it('normalizes a six-character room code before joining', async () => {
    const onStart = vi.fn()
    render(<LandingScreen onStart={onStart} />)
    await userEvent.type(screen.getByLabelText('Room code'), 'a1-b2 c3')
    await userEvent.click(screen.getByRole('button', { name: 'Join room' }))
    expect(onStart).toHaveBeenCalledWith('A1B2C3')
  })

  it('shows connected status and enables continue', () => {
    render(<RoomScreen code="ABC123" partnerJoined copied={false} onCopy={vi.fn()} onContinue={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Partner connected')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })
})
```

- [ ] **Step 2: Prove the tests fail**

```bash
npm test -- src/app/App.test.tsx
```

Expected: FAIL because screens are not exported and the room-code input lacks a label.

- [ ] **Step 3: Rebuild semantic screen markup**

Export both components. Use `.landing`, `.landing__prints`, `.landing__content`, `.room`, and `.room__code-card`. Keep at most three sample strips on desktop and one compact composition on mobile. Add `<label htmlFor="room-code">Room code</label>`, input id `room-code`, and accessible button name `Join room`.

Render room status exactly:

```tsx
<StatusPanel tone={partnerJoined ? 'success' : 'info'} title={partnerJoined ? 'Partner connected' : 'Waiting for your partner'}>
  {partnerJoined ? 'You can choose the booth together.' : 'Keep this tab open while they join.'}
</StatusPanel>
```

Add the visible privacy line `Camera and photos stay between your browsers. Nothing is uploaded.` with a Lucide `ShieldCheck` icon. Keep room generation, normalization, copy behavior, and the connected gate unchanged.

- [ ] **Step 4: Add responsive regression CSS**

Desktop is a controlled asymmetric two-column composition. Under 768 px, prints are normal-flow content above the copy and cannot overlap `.landing__content`. Include:

```css
@media (max-width: 480px) {
  .landing { padding: 28px 20px 36px; overflow-x: clip; }
  .landing__prints { position: relative; height: 210px; margin-bottom: 20px; }
  .landing__content { position: relative; z-index: 2; width: 100%; }
  .landing__join-row { display: grid; grid-template-columns: minmax(0, 1fr) 92px; }
}
```

- [ ] **Step 5: Add metadata and favicon**

Update `index.html`:

```html
<title>Keepsake Booth | A photo booth for two</title>
<meta name="description" content="Take synchronized photo-booth pictures with someone you love, wherever you both are." />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
```

Create `public/favicon.svg` with a dusty-berry rounded square, white heart, and small lens circle.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/app/App.test.tsx
npm run lint
npm run build
```

Use Playwright at 1440x1000 and 390x844. Expected: no print overlaps meaningful content; no favicon 404.

```bash
git add src/app/App.tsx src/styles/keepsake.css src/app/App.test.tsx index.html public/favicon.svg
git commit -m "Redesign landing and room experience"
```

---

### Task 4: Unify Setup Navigation, Layout, Scene, and Filter Selection

**Files:**
- Modify: `src/app/App.tsx:1267-1450, 2490-2520`
- Modify: `src/styles/keepsake.css`, `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `SetupHeader`, `StudioButton`, `FilterSprite`, existing synchronized `navigate`.
- Produces: `ThemeScreen.onBack` and `GetReadyScreen.onBack`, both using existing `STATE` synchronization.

- [ ] **Step 1: Add failing tests**

```tsx
import { ThemeScreen } from './App'

it('provides a back action from scene selection', async () => {
  const onBack = vi.fn()
  render(<ThemeScreen selected="classic" selectedProp="none" onSelect={vi.fn()} onPropSelect={vi.fn()} onContinue={vi.fn()} onBack={onBack} />)
  await userEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(onBack).toHaveBeenCalledOnce()
})

it('shows real filter and scene previews', () => {
  render(<ThemeScreen selected="washer" selectedProp="catEars" onSelect={vi.fn()} onPropSelect={vi.fn()} onContinue={vi.fn()} onBack={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'XMM Pixel Set' })).toBePressed()
  expect(screen.getByRole('img', { name: 'Washer POV preview' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Prove failure**

```bash
npm test -- src/app/App.test.tsx
```

Expected: FAIL for missing `onBack`, scene image, and real filter-sprite selection.

- [ ] **Step 3: Add shared setup headers and synchronized Back**

Add `onBack` to Theme and Ready props. Use `SetupHeader` steps 1, 2, and 3. Wire:

```tsx
<ThemeScreen {...themeProps} onBack={() => navigate('layout')} onContinue={() => navigate('ready')} />
<GetReadyScreen {...readyProps} onBack={() => navigate('theme')} />
```

Layout has no Back action. Back uses the existing synchronized navigation message.

- [ ] **Step 4: Rebuild cards with real previews**

```ts
const SCENE_PREVIEWS: Record<ThemeId, string> = {
  classic: '/couple.png',
  washer: '/theme-assets/laundromat-neutral-blue-v3.png',
  elevator: '/theme-assets/elevator-cctv-cute.jpg',
}
```

Replace the abstract layout blocks with realistic mini strip previews using `/couple.png`, preserving four vertical frames for Classic and a two-by-three grid for Wide. Add the descriptions `Classic vertical keepsake` and `Wide six-photo story` beneath their output counts.

Each scene card renders an image and separate text region, `Shared choice`, `aria-pressed`, and selected check. Each filter card renders `FilterSprite`, `Only you`, `aria-pressed`, and its accessible name. Use Lucide `X` for No filter.

- [ ] **Step 5: Add responsive card CSS and verify synchronization**

Under 767 px, scene/filter groups become keyboard-reachable horizontal snap regions with minimum 172 px cards. Test host and guest selecting Wide Frame, Washer POV, different personal filters, Back, and forward again. Expected: shared choices/screens synchronize; personal filters remain different.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/app/App.test.tsx
npm run lint
npm run build
git add src/app/App.tsx src/styles/keepsake.css src/app/App.test.tsx
git commit -m "Unify synchronized booth setup"
```

---

### Task 5: Add Recoverable Camera Lifecycle UX

**Files:**
- Create: `src/app/ui/cameraStatus.ts`, `src/app/ui/cameraStatus.test.ts`
- Modify: `src/app/App.tsx:1364-1450, 2346-2372, 2510-2522`
- Modify: `src/styles/keepsake.css`, `src/app/App.test.tsx`

**Interfaces:**
- Produces: `CameraStatus`, `CameraFailureStatus`, `classifyCameraFailure(error: unknown)`.
- Extends Get Ready with `cameraStatus: CameraStatus` and `onRetryCamera: () => void`.

- [ ] **Step 1: Write failing classifier tests**

```ts
import { describe, expect, it } from 'vitest'
import { classifyCameraFailure } from './cameraStatus'

describe('classifyCameraFailure', () => {
  it('classifies permission denial', () => expect(classifyCameraFailure(new DOMException('denied', 'NotAllowedError')).phase).toBe('denied'))
  it('classifies a missing camera', () => expect(classifyCameraFailure(new DOMException('missing', 'NotFoundError')).phase).toBe('unavailable'))
  it('falls back to a recoverable failure', () => expect(classifyCameraFailure(new Error('busy'))).toEqual({ phase: 'failed', message: 'The camera could not start. Close other camera apps and try again.' }))
})
```

- [ ] **Step 2: Prove failure, then implement**

```bash
npm test -- src/app/ui/cameraStatus.test.ts
```

Create:

```ts
export type CameraStatus = { phase: 'idle' | 'requesting' | 'ready' } | CameraFailureStatus
export type CameraFailureStatus = { phase: 'denied' | 'unavailable' | 'failed'; message: string }

export function classifyCameraFailure(error: unknown): CameraFailureStatus {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return { phase: 'denied', message: 'Camera access is blocked. Allow camera access in your browser settings, then try again.' }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return { phase: 'unavailable', message: 'No camera was found. Connect a camera or choose another device, then try again.' }
  return { phase: 'failed', message: 'The camera could not start. Close other camera apps and try again.' }
}
```

- [ ] **Step 3: Add explicit App camera state and retry**

```tsx
const [cameraStatus, setCameraStatus] = useState<CameraStatus>({ phase: 'idle' })
const [cameraRequest, setCameraRequest] = useState(0)
const retryCamera = () => {
  stream?.getTracks().forEach(track => track.stop())
  setStream(null)
  setCameraStatus({ phase: 'requesting' })
  setCameraRequest(value => value + 1)
}
```

Set `requesting` before the camera promise, `ready` when accepted, and `classifyCameraFailure(error)` in `.catch`. Include `cameraRequest` in the effect dependencies. Do not swallow rejection.

- [ ] **Step 4: Render exact recovery states**

For denied/unavailable/failed, show `StatusPanel tone="error"`, classifier message, and `StudioButton tone="secondary"` labeled `Retry camera`. Continue is enabled only when status is ready and the video has played.

Keep the partner picture-in-picture preview. Replace the current skin-smoothing buttons with `SegmentedControl<SkinSmoothing>` labeled `Your skin smoothing`, using options Natural, Soft, and Extra soft; continue calling the existing `onSkinSmoothingChange` callback so the choice remains personal.

Append a Get Ready test that renders denied status, clicks Retry camera, and asserts the callback.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/app/ui/cameraStatus.test.ts src/app/App.test.tsx
npm run lint
npm run build
```

Browser-check denied permission once, Retry, and a `?demo=p1` ready stream.

```bash
git add src/app/ui/cameraStatus.ts src/app/ui/cameraStatus.test.ts src/app/App.tsx src/app/App.test.tsx src/styles/keepsake.css
git commit -m "Add recoverable camera permission states"
```

---

### Task 6: Reorganize the Booth Console Without Touching Rendering

**Files:**
- Modify: `src/app/App.tsx:1451-1912`
- Modify: `src/styles/keepsake.css`, `src/app/App.test.tsx`

**Interfaces:**
- Consumes: all current `BoothScreen` props and callbacks unchanged.
- Produces: `getCaptureProgress(count: number): string` plus accessible, responsive control groups.

- [ ] **Step 1: Write the failing progress test**

```tsx
import { getCaptureProgress } from './App'

it('reports capture progress once', () => {
  expect(getCaptureProgress(0)).toBe('0 of 10')
  expect(getCaptureProgress(10)).toBe('10 of 10')
})
```

- [ ] **Step 2: Prove failure and add the helper**

```bash
npm test -- src/app/App.test.tsx
```

Expected: FAIL because the helper is missing. Implement:

```ts
export const getCaptureProgress = (count: number) => `${Math.max(0, Math.min(10, count))} of 10`
```

Remove the duplicate fraction, dot strip, and `moments left` count. Render one `.booth-progress` with visible text and an `aria-hidden` ten-segment indicator.

- [ ] **Step 3: Convert only booth presentation to semantic groups**

Add exact reusable class names near the Booth render:

```tsx
const boothClassName = `booth studio-screen booth--${themeId}`
const consoleRowClassName = (name: 'proximity' | 'size' | 'priority') => `booth-console__row booth-console__row--${name}`
```

Change the current outer booth element to `<main className={boothClassName}>`. Wrap the current canvas, participant labels, countdown, and flash in `<section className="booth__camera" aria-label="Live booth preview">`. Wrap the current control blocks in `<section className="booth-console" aria-label="Booth controls">`; assign `consoleRowClassName('proximity')`, `consoleRowClassName('size')`, `.booth-console__filters`, and `consoleRowClassName('priority')` to their current wrappers. Assign `.booth__shutter` to the existing capture-control wrapper.

Keep canvas/video refs and all render/capture callbacks in their current lifecycle. Do not alter `drawBoothFrame`, MediaPipe initialization, `processPerson`, animation frames, countdown timing, JPEG quality, or `onPhotoCapture`.

- [ ] **Step 4: Make every booth control accessible**

- Label proximity `Togetherness` and retain Further/Closer endpoints.
- Keep `aria-label="Your size"`, add `aria-valuetext={`${localScalePercent}%`}`, and label reset `Normal size`.
- Keep filter names, titles, and `aria-pressed`.
- Use the priority fieldset above.
- Put tracking status in `role="status" aria-live="polite"`.

- [ ] **Step 5: Add responsive console CSS**

At 1024 px, cap camera at 760 px and console at 620 px. Under 767 px, filters remain visible as a horizontal sprite strip and proximity/size/priority become compact rows. At 390x844 the shutter must not cover the final control row.

- [ ] **Step 6: Apply the repeated-readback hint in the exact context**

Use `{ willReadFrequently: true }` only for the canvas 2D context that performs repeated `getImageData`. Re-run three theme captures and compare against Task 1 before committing.

- [ ] **Step 7: Verify invariants and commit**

Paired-demo checks: different P1/P2 filters; 80%, 100%, 120% scale; both priority choices; min/max proximity; upper-body overlap/motion; all three themes. Expected: capture dimensions, anchoring, normalization, masks, and theme geometry match baseline.

```bash
npm test -- src/app/App.test.tsx
npm run lint
npm run build
git add src/app/App.tsx src/app/App.test.tsx src/styles/keepsake.css
git commit -m "Reorganize accessible booth controls"
```

---

### Task 7: Improve Contact-Sheet Selection

**Files:**
- Modify: `src/app/App.tsx:1918-1956`
- Modify: `src/styles/keepsake.css`, `src/app/App.test.tsx`

**Interfaces:**
- Consumes: current `photos`, `selected`, `layout`, `onToggle`, `onContinue` props.
- Produces: exported `SelectScreen` with unchanged selection limits and explicit order/state feedback.

- [ ] **Step 1: Write the failing selection test**

```tsx
import { SelectScreen } from './App'

it('shows selection order and required count', async () => {
  const onToggle = vi.fn()
  render(<SelectScreen photos={['one', 'two']} selected={[1]} layout="classic" onToggle={onToggle} onContinue={vi.fn()} />)
  expect(screen.getByText('1 of 4 selected')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Photo 2, selected first' })).toBePressed()
  await userEvent.click(screen.getByRole('button', { name: 'Photo 1, not selected' }))
  expect(onToggle).toHaveBeenCalledWith(0)
})
```

- [ ] **Step 2: Prove failure, then rebuild markup**

Expected failure: current count is `1/4`, buttons omit pressed/order state. Export `SelectScreen`; use `.selection-grid`, `.selection-card`, `.selection-action`; set `aria-pressed`; accessible names are `Photo N, not selected` or `Photo N, selected first/second/...`; selected cards show Lucide `Check` and order number.

The action panel displays `${selected.length} of ${needed} selected` plus `Tap a selected photo to remove it.` Continue remains disabled until the required count.

- [ ] **Step 3: Add responsive selection CSS**

Use three columns near 900 px, two below 767 px, and a mobile sticky action panel with safe-area inset. Replace black borders/background with the studio surface and border tokens.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/app/App.test.tsx
npm run lint
npm run build
git add src/app/App.tsx src/app/App.test.tsx src/styles/keepsake.css
git commit -m "Improve photo selection feedback"
```

Visually confirm all ten images fit at 390 px without horizontal overflow.

---

### Task 8: Rebuild the Customization Workspace

**Files:**
- Modify: `src/app/App.tsx:1962-2123`
- Modify: `src/styles/keepsake.css`, `src/app/App.test.tsx`

**Interfaces:**
- Consumes: existing `CustomizeOpts`, colors, filters, stickers, dragging, and `onDone` payload unchanged.
- Produces: exported `CustomizeScreen` with semantic tabs, labeled controls, desktop two-column workspace, mobile tool layout.

- [ ] **Step 1: Write the failing customization test**

```tsx
import { CustomizeScreen } from './App'

it('switches labeled tabs and exposes named controls', async () => {
  render(<CustomizeScreen photos={['one','two','three','four']} selectedIndices={[0,1,2,3]} layout="classic" onDone={vi.fn()} />)
  expect(screen.getByRole('tab', { name: 'Frame' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: 'White frame' })).toBePressed()
  await userEvent.click(screen.getByRole('tab', { name: 'Names' }))
  expect(screen.getByLabelText('Your name')).toBeInTheDocument()
  expect(screen.getByLabelText('Partner name')).toBeInTheDocument()
  expect(screen.getByLabelText('Date')).toBeInTheDocument()
})
```

- [ ] **Step 2: Prove failure, then implement semantic tabs**

Expected: FAIL because tabs are emoji buttons, swatches lack accessible names/pressed state, and fields have placeholders only.

Import Lucide `Frame`, `ImageIcon`, `Sticker`, `Type`. Render `role="tablist"`; each tab uses `role="tab"`, `aria-selected`, `aria-controls`; each active panel uses matching `role="tabpanel"`. Sticker emoji remain inside the content panel.

- [ ] **Step 3: Label editor controls exactly**

```tsx
<button type="button" aria-label={`${c.label} frame`} aria-pressed={frameColor === c.v} className="frame-swatch" style={{ '--swatch': c.v } as React.CSSProperties} onClick={() => setFrameColor(c.v)} />

<label htmlFor="strip-name-one">Your name</label>
<input id="strip-name-one" value={name1} onChange={event => setName1(event.target.value)} />
<label htmlFor="strip-name-two">Partner name</label>
<input id="strip-name-two" value={name2} onChange={event => setName2(event.target.value)} />
<label htmlFor="strip-date">Date</label>
<input id="strip-date" value={date} onChange={event => setDate(event.target.value)} />
```

Sticker-add buttons use `aria-label={`Add ${emoji} sticker`}`. Placed stickers receive `role="button"`, `tabIndex={0}`, remove label, and Enter/Space keyboard removal.

- [ ] **Step 4: Build the responsive workspace**

At 900 px use `.customize-workspace { grid-template-columns: minmax(300px,.9fr) minmax(380px,1.1fr); }`; make the preview sticky and cap it at 360 px. Under 767 px stack preview first, use a sticky bottom tab list, and keep Develop in normal flow after the panel. Preserve photo ratios and final canvas renderer.

Keep thumbnail previews for every photo-filter choice and show the selected state with border, check icon, and `aria-pressed`, not color alone.

- [ ] **Step 5: Verify all editor behaviors**

Test tabs/labels automatically. In browser: drag a photo; select every frame/filter; add/remove sticker with mouse and keyboard; enter names/date; develop; inspect final canvas.

- [ ] **Step 6: Commit**

```bash
npm test -- src/app/App.test.tsx
npm run lint
npm run build
git add src/app/App.tsx src/app/App.test.tsx src/styles/keepsake.css
git commit -m "Rebuild strip customization workspace"
```

---

### Task 9: Polish Development, Reveal, Download, and Restart

**Files:**
- Modify: `src/app/App.tsx:2129-2201, 2476-2541`
- Modify: `src/styles/keepsake.css`, `src/app/App.test.tsx`

**Interfaces:**
- Consumes: current reveal props and download status unchanged.
- Produces: exported `RevealScreen`, reduced-motion-safe development, adjacent status, no teaser.

- [ ] **Step 1: Write the failing reveal test**

```tsx
import { RevealScreen } from './App'

it('ends on the completed strip and actions', () => {
  render(<RevealScreen stripUrl="data:image/png;base64,abc" isRevealing={false} downloadStatus="done" onDownload={vi.fn()} onShare={vi.fn()} onStartAgain={vi.fn()} />)
  expect(screen.getByRole('img', { name: 'Your photo strip' })).toBeInTheDocument()
  expect(screen.getByText('Saved directly to this device. Nothing was uploaded.')).toBeInTheDocument()
  expect(screen.queryByText(/Coming soon/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Prove failure, then rebuild final presentation**

Replace the rose emoji with Lucide `Aperture`. Visible development copy is `Developing your strip` and `Your photos are being printed.` Final uses primary Download, secondary Share, quiet Start again. Status is adjacent with `role="status"`; success text exactly matches the test; failure text is `The download failed. Please try again.` Remove the GIF/video teaser.

- [ ] **Step 3: Make reveal timers cleanup-safe**

Store and clear the reveal `setTimeout`. Reduced-motion CSS shows the strip without translating/developing animation. Keep current 2.9-second developing state.

- [ ] **Step 4: Verify download/restart and commit**

Use Playwright to download a PNG, then Start again. Expected: URL query, photos, participant settings, streams, and room state reset.

```bash
npm test -- src/app/App.test.tsx
npm run lint
npm run build
git add src/app/App.tsx src/app/App.test.tsx src/styles/keepsake.css
git commit -m "Polish strip reveal and download feedback"
```

---

### Task 10: Full Paired-Flow QA and Release Verification

**Files:**
- Modify: `src/app/App.tsx`, `src/styles/keepsake.css`, focused tests only for discovered defects
- Modify: `docs/DEVELOPMENT_LOG.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified two-participant, three-theme application and documented results.

- [ ] **Step 1: Run the automated gate**

```bash
npm run check
```

Expected: ESLint, Vitest, and Vite build all pass.

- [ ] **Step 2: Run keyboard and reduced-motion checks**

Tab through landing, room, setup, booth, selection, editor, and reveal. Every focus is visible. Emulate reduced motion; floating prints, grain, entrances, development, and hover transforms do not loop. Confirm no horizontal overflow at 390 px.

- [ ] **Step 3: Run the paired ten-shot journey**

Use two tabs with `demo=p1`/`demo=p2`, `demoPose=upper`, `demoOverlap=1`, `demoMotion=1`. Complete host/guest join, synchronized setup, independent filters/smoothing/scale, tracking initialization, all controls, ten captures, selection, every editor tab, development, download, and restart.

- [ ] **Step 4: Capture viewport QA sets**

Save landing, connected room, setup, ready, all three themes, selection, customization, and reveal under `local-reviews/keepsake-studio-redesign-2026-09-01/` at 390x844, 768x1024, 1440x1000, and 1728x1117. Never stage this directory.

- [ ] **Step 5: Compare CV output against Task 1**

Inspect anchoring, normalization, hands/arms, overlap, washer inward pose, and edge cleanup. If a regression appears, preserve a before/after reproduction and fix the smallest presentation boundary. Do not tune landmark or mask algorithms.

- [ ] **Step 6: Inspect diagnostics**

Allow upstream MediaPipe WASM diagnostic warnings. Fix application exceptions, missing local assets, React warnings, inaccessible-control warnings, and failed app-owned requests.

- [ ] **Step 7: Update the development log**

Record visual direction, responsive/accessibility work, camera recovery, unchanged CV boundaries, paired ten-shot trial, exact check results, and QA artifact path.

- [ ] **Step 8: Run final verification**

```bash
npm run check
git diff --check
git status --short
```

Expected: all pass; only intended tracked files remain; `local-reviews/` stays ignored.

- [ ] **Step 9: Commit final fixes/documentation**

Stage only files changed during this task, then:

```bash
git commit -m "Complete Keepsake Studio redesign QA"
```

- [ ] **Step 10: Request review and finish safely**

Invoke `superpowers:requesting-code-review`; resolve Blocker/Important findings; rerun `npm run check`; then use `superpowers:finishing-a-development-branch`. Do not push or deploy unless the user explicitly asks.
