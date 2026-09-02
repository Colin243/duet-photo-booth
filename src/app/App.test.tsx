import { readFileSync } from 'node:fs'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GetReadyScreen, LandingScreen, LayoutScreen, RoomScreen, ThemeScreen } from './App'

const keepsakeCss = readFileSync('src/styles/keepsake.css', 'utf8')

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
