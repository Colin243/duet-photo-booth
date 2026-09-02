import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App, { type CameraLifecycleTestHandle, CustomizeScreen, getCaptureProgress, GetReadyScreen, LandingScreen, LayoutScreen, RoomScreen, SelectScreen, ThemeScreen } from './App'

vi.mock('peerjs', () => {
  class MockConnection {
    open = true
    close = vi.fn()
    send = vi.fn()

    on(event: string, listener: () => void) {
      if (event === 'open') listener()
    }
  }

  return {
    default: class MockPeer {
      connect = vi.fn()
      call = vi.fn()
      destroy = vi.fn()

      on(event: string, listener: (connection: MockConnection) => void) {
        if (event === 'connection') listener(new MockConnection())
      }
    },
  }
})

const keepsakeCss = readFileSync('src/styles/keepsake.css', 'utf8')
const appSource = readFileSync('src/app/App.tsx', 'utf8')

describe('booth progress', () => {
  it('clamps capture progress to the ten-photo session boundary', () => {
    expect(getCaptureProgress(-1)).toBe('0 of 10')
    expect(getCaptureProgress(0)).toBe('0 of 10')
    expect(getCaptureProgress(10)).toBe('10 of 10')
    expect(getCaptureProgress(11)).toBe('10 of 10')
  })
})

describe('contact-sheet selection', () => {
  it('shows selection order and required count', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()

    render(<SelectScreen photos={['one', 'two']} selected={[1]} layout="classic" onToggle={onToggle} onContinue={vi.fn()} />)

    expect(screen.getByText('1 of 4 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Photo 2, selected first' })).toBePressed()
    await user.click(screen.getByRole('button', { name: 'Photo 1, not selected' }))
    expect(onToggle).toHaveBeenCalledWith(0)
  })
})

describe('strip customization', () => {
  it('switches labeled tabs and exposes named controls', async () => {
    const user = userEvent.setup()

    render(<CustomizeScreen photos={['one', 'two', 'three', 'four']} selectedIndices={[0, 1, 2, 3]} layout="classic" onDone={vi.fn()} />)

    expect(screen.getByRole('tab', { name: 'Frame' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'White frame' })).toBePressed()
    await user.click(screen.getByRole('tab', { name: 'Names' }))
    expect(screen.getByLabelText('Your name')).toBeInTheDocument()
    expect(screen.getByLabelText('Partner name')).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
  })

  it('removes placed stickers by keyboard and preserves the development payload', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()

    render(<CustomizeScreen photos={['one', 'two', 'three', 'four']} selectedIndices={[0, 1, 2, 3]} layout="classic" onDone={onDone} />)

    await user.click(screen.getByRole('tab', { name: 'Stickers' }))
    await user.click(screen.getByRole('button', { name: 'Add 🌸 sticker' }))
    const placedSticker = screen.getByRole('button', { name: 'Remove 🌸 sticker' })
    placedSticker.focus()
    await user.keyboard(' ')
    expect(screen.queryByRole('button', { name: 'Remove 🌸 sticker' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add 💕 sticker' }))
    const secondSticker = screen.getByRole('button', { name: 'Remove 💕 sticker' })
    secondSticker.focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('button', { name: 'Remove 💕 sticker' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Names' }))
    await user.type(screen.getByLabelText('Your name'), 'Alex')
    await user.type(screen.getByLabelText('Partner name'), 'Sam')
    await user.clear(screen.getByLabelText('Date'))
    await user.type(screen.getByLabelText('Date'), 'Sep 2, 2026')
    await user.click(screen.getByRole('button', { name: 'Develop strip' }))

    expect(onDone).toHaveBeenCalledWith({
      frameColor: '#ffffff',
      filter: 'none',
      stickers: [],
      name1: 'Alex',
      name2: 'Sam',
      date: 'Sep 2, 2026',
      offsets: {},
    })
  })

  it('keeps the mobile tool switcher fixed with clearance for the editor action', () => {
    const mobileCustomize = keepsakeCss.slice(keepsakeCss.indexOf('@media (max-width: 767px)'))

    expect(mobileCustomize).toMatch(/\.customize-tabs \{[\s\S]*?position: fixed;[\s\S]*?bottom: max\(12px, env\(safe-area-inset-bottom\)\);/)
    expect(mobileCustomize).toContain('.customize-workspace { gap: 20px; padding: 28px 16px calc(116px + env(safe-area-inset-bottom)); }')
  })

  it('retains pressed frame and filter choices plus drag offsets in the development payload', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<CustomizeScreen photos={['one', 'two', 'three', 'four']} selectedIndices={[0, 1, 2, 3]} layout="classic" onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: 'Cream frame' }))
    expect(screen.getByRole('button', { name: 'Cream frame' })).toBePressed()
    await user.click(screen.getByRole('tab', { name: 'Filter' }))
    await user.click(screen.getByRole('button', { name: 'Warm' }))
    expect(screen.getByRole('button', { name: 'Warm' })).toBePressed()

    const preview = container.querySelector('.strip-preview')!
    fireEvent.mouseDown(container.querySelector('.strip-preview__photo')!, { clientX: 10, clientY: 20 })
    fireEvent.mouseMove(preview, { clientX: 28, clientY: 44 })
    fireEvent.mouseUp(preview)
    await user.click(screen.getByRole('button', { name: 'Develop strip' }))

    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({
      frameColor: '#fdf8ee',
      filter: 'warm',
      offsets: { 0: { x: 18, y: 24 } },
    }))
  })
})

describe('support canvas readback context', () => {
  it('configures repeated reads when the support canvas context is first created', () => {
    const supportRenderer = appSource.slice(
      appSource.indexOf('function renderLandmarkSupport'),
      appSource.indexOf('function boundsFromTracking'),
    )
    const personMaskUpdate = appSource.slice(
      appSource.indexOf('const updatePersonMask'),
      appSource.indexOf('// Animation loop'),
    )
    const firstSupportContextCall = supportRenderer.match(/supportCanvas\.getContext\([^)]*\)/)?.[0]

    expect(firstSupportContextCall).toBe('supportCanvas.getContext("2d", { willReadFrequently: true })')
    expect(personMaskUpdate).toContain('supportCanvas.getContext("2d")!.getImageData')
    expect(personMaskUpdate).not.toContain('supportCanvas.getContext("2d", { willReadFrequently: true })!.getImageData')
  })
})

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function cameraStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  return {
    stream: { getTracks: () => tracks } as unknown as MediaStream,
    tracks,
  }
}

async function renderAppAtReady(getUserMedia: ReturnType<typeof vi.fn>) {
  window.history.replaceState({}, '', '/')
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  const user = userEvent.setup()
  const cameraLifecycleTestHandle = { current: null as CameraLifecycleTestHandle | null }
  const view = render(<App cameraLifecycleTestHandle={cameraLifecycleTestHandle} />)

  await user.click(screen.getByRole('button', { name: 'Start a booth' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.click(screen.getByRole('button', { name: 'Next: Choose scene' }))
  await user.click(screen.getByRole('button', { name: 'Next: Get ready' }))
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))

  await waitFor(() => expect(cameraLifecycleTestHandle.current).not.toBeNull())
  return { view, cameraLifecycleTestHandle }
}

describe('landing and room', () => {
  it('normalizes a six-character room code before joining', async () => {
    const onStart = vi.fn()
    const user = userEvent.setup()

    render(<LandingScreen onStart={onStart} />)

    await user.type(screen.getByLabelText('Room code'), 'a1-b2 c3')
    await user.click(screen.getByRole('button', { name: 'Join room' }))

    expect(onStart).toHaveBeenCalledWith('A1B2C3')
  })

  it('shows connected status and enables continue', () => {
    render(
      <RoomScreen
        code="ABC123"
        partnerJoined
        copied={false}
        onCopy={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Partner connected')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('reserves the full mobile print composition at supported narrow breakpoints', () => {
    expect(keepsakeCss).toMatch(/@media \(max-width: 767px\) \{[\s\S]*?\.landing__prints \{[\s\S]*?height: 304px;/)
    expect(keepsakeCss).toMatch(/@media \(max-width: 480px\) \{[\s\S]*?\.landing__prints \{[\s\S]*?height: 304px;/)
  })

  it('keeps landing and room entrance motion within the approved duration', () => {
    expect(keepsakeCss).toContain('.landing.screen-enter,\n.room.screen-enter { animation-duration: 200ms; }')
  })
})

describe('setup selection', () => {
  it('provides a back action from scene selection', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()

    render(
      <ThemeScreen
        selected="classic"
        selectedProp="none"
        onSelect={vi.fn()}
        onPropSelect={vi.fn()}
        onContinue={vi.fn()}
        onBack={onBack}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows the selected real filter sprite and scene preview', () => {
    render(
      <ThemeScreen
        selected="washer"
        selectedProp="catEars"
        onSelect={vi.fn()}
        onPropSelect={vi.fn()}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'XMM Pixel Set' })).toBePressed()
    expect(screen.getByRole('img', { name: 'Washer POV preview' })).toBeInTheDocument()
  })

  it('marks every starting filter as a personal choice', () => {
    render(
      <ThemeScreen
        selected="classic"
        selectedProp="none"
        onSelect={vi.fn()}
        onPropSelect={vi.fn()}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    ;['No filter', 'XHS Heart Glow', 'Douyin Star Halo', 'XMM Pixel Set'].forEach(name => {
      expect(screen.getByRole('button', { name })).toHaveTextContent('Only you')
    })
  })

  it('gives every setup landmark an accessible name', () => {
    render(
      <>
        <LayoutScreen selected="classic" onSelect={vi.fn()} onContinue={vi.fn()} />
        <ThemeScreen
          selected="classic"
          selectedProp="none"
          onSelect={vi.fn()}
          onPropSelect={vi.fn()}
          onContinue={vi.fn()}
          onBack={vi.fn()}
        />
        <GetReadyScreen
          stream={null}
          remoteStream={null}
          tipIndex={0}
          skinSmoothing={0}
          cameraStatus={{ phase: 'idle' }}
          onSkinSmoothingChange={vi.fn()}
          onRetryCamera={vi.fn()}
          onContinue={vi.fn()}
          onBack={vi.fn()}
        />
      </>,
    )

    expect(screen.getByRole('region', { name: 'Layout setup' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Scene setup' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ready setup' })).toBeInTheDocument()
  })
})

describe('camera recovery', () => {
  it('shows denied camera guidance and invokes retry', async () => {
    const onRetryCamera = vi.fn()
    const user = userEvent.setup()

    render(
      <GetReadyScreen
        stream={null}
        remoteStream={null}
        tipIndex={0}
        skinSmoothing={0}
        cameraStatus={{
          phase: 'denied',
          message: 'Camera access is blocked. Allow camera access in your browser settings, then try again.',
        }}
        onSkinSmoothingChange={vi.fn()}
        onRetryCamera={onRetryCamera}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Camera access is blocked. Allow camera access in your browser settings, then try again.')
    await user.click(screen.getByRole('button', { name: 'Retry camera' }))
    expect(onRetryCamera).toHaveBeenCalledOnce()
  })

  it('keeps continue disabled until an accepted camera request has a played preview', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

    render(
      <GetReadyScreen
        stream={{ getTracks: () => [] } as unknown as MediaStream}
        remoteStream={null}
        tipIndex={0}
        skinSmoothing={0}
        cameraStatus={{
          phase: 'failed',
          message: 'The camera could not start. Close other camera apps and try again.',
        }}
        onSkinSmoothingChange={vi.fn()}
        onRetryCamera={vi.fn()}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    await waitFor(() => expect(play).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Waiting for camera…' })).toBeDisabled()
    play.mockRestore()
  })

  it('waits for the latest preview to play after a stale preview completes', async () => {
    let resolveFirstPlay: (() => void) | undefined
    let resolveSecondPlay: (() => void) | undefined
    const firstPlay = new Promise<void>(resolve => { resolveFirstPlay = resolve })
    const secondPlay = new Promise<void>(resolve => { resolveSecondPlay = resolve })
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementationOnce(() => firstPlay)
      .mockImplementationOnce(() => secondPlay)
    const firstStream = { getTracks: () => [] } as unknown as MediaStream
    const secondStream = { getTracks: () => [] } as unknown as MediaStream
    const props = {
      remoteStream: null,
      tipIndex: 0,
      skinSmoothing: 0 as const,
      cameraStatus: { phase: 'ready' as const },
      onSkinSmoothingChange: vi.fn(),
      onRetryCamera: vi.fn(),
      onContinue: vi.fn(),
      onBack: vi.fn(),
    }

    try {
      const view = render(<GetReadyScreen stream={firstStream} {...props} />)
      await waitFor(() => expect(play).toHaveBeenCalledTimes(1))

      view.rerender(<GetReadyScreen stream={secondStream} {...props} />)
      await waitFor(() => expect(play).toHaveBeenCalledTimes(2))

      await act(async () => {
        resolveFirstPlay?.()
        await firstPlay
      })
      expect(screen.getByRole('button', { name: 'Waiting for camera…' })).toBeDisabled()

      await act(async () => {
        resolveSecondPlay?.()
        await secondPlay
      })
      expect(screen.getByRole('button', { name: "We're ready" })).toBeEnabled()
    } finally {
      play.mockRestore()
    }
  })
})

describe('App camera request timing', () => {
  it('stops a request that resolves in the same turn as retry without publishing it as the replacement stream', async () => {
    const first = deferred<MediaStream>()
    const second = deferred<MediaStream>()
    const getUserMedia = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const firstCamera = cameraStream()
    const replacementCamera = cameraStream()
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

    try {
      const { cameraLifecycleTestHandle } = await renderAppAtReady(getUserMedia)

      await act(async () => {
        cameraLifecycleTestHandle.current?.retryCamera()
        first.resolve(firstCamera.stream)
        await first.promise
      })

      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
      expect(firstCamera.tracks[0].stop).toHaveBeenCalledOnce()
      expect(firstCamera.tracks[1].stop).toHaveBeenCalledOnce()

      await act(async () => {
        second.resolve(replacementCamera.stream)
        await second.promise
      })

      await waitFor(() => expect(document.querySelector('.ready-preview__local')).toHaveProperty('srcObject', replacementCamera.stream))
      expect(replacementCamera.tracks[0].stop).not.toHaveBeenCalled()
      expect(replacementCamera.tracks[1].stop).not.toHaveBeenCalled()
    } finally {
      play.mockRestore()
    }
  })

  it('does not let a rejected old request replace the retry request status', async () => {
    const first = deferred<MediaStream>()
    const second = deferred<MediaStream>()
    const getUserMedia = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

    try {
      const { cameraLifecycleTestHandle } = await renderAppAtReady(getUserMedia)

      await act(async () => {
        cameraLifecycleTestHandle.current?.retryCamera()
        first.reject(new Error('old camera failure'))
        await Promise.resolve()
      })

      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
      expect(screen.getByText('Requesting camera…')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry camera' })).not.toBeInTheDocument()

      const replacementCamera = cameraStream()
      await act(async () => {
        second.resolve(replacementCamera.stream)
        await second.promise
      })
    } finally {
      play.mockRestore()
    }
  })

  it('invalidates a pending camera request before navigating away, then starts a fresh request on return', async () => {
    const first = deferred<MediaStream>()
    const second = deferred<MediaStream>()
    const getUserMedia = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const firstCamera = cameraStream()

    await renderAppAtReady(getUserMedia)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      first.resolve(firstCamera.stream)
      await first.promise
    })

    expect(screen.getByRole('region', { name: 'Scene setup' })).toBeInTheDocument()
    expect(firstCamera.tracks[0].stop).toHaveBeenCalledOnce()
    expect(firstCamera.tracks[1].stop).toHaveBeenCalledOnce()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Next: Get ready' }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
  })

  it('stops a late camera stream after App unmounts', async () => {
    const request = deferred<MediaStream>()
    const getUserMedia = vi.fn().mockReturnValue(request.promise)
    const lateCamera = cameraStream()
    const { view } = await renderAppAtReady(getUserMedia)

    await act(async () => {
      view.unmount()
      request.resolve(lateCamera.stream)
      await request.promise
    })

    expect(lateCamera.tracks[0].stop).toHaveBeenCalledOnce()
    expect(lateCamera.tracks[1].stop).toHaveBeenCalledOnce()
  })
})
