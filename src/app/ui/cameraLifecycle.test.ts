import { describe, expect, it, vi } from 'vitest'
import { createCameraRequestGuard, stopMediaStream } from './cameraLifecycle'

function cameraStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  return {
    stream: { getTracks: () => tracks } as unknown as MediaStream,
    tracks,
  }
}

describe('camera lifecycle', () => {
  it('stops every current track for retry or unmount cleanup', () => {
    const { stream, tracks } = cameraStream()

    stopMediaStream(stream)

    expect(tracks[0].stop).toHaveBeenCalledOnce()
    expect(tracks[1].stop).toHaveBeenCalledOnce()
  })

  it('stops a stream that resolves after its request was cancelled', () => {
    const { stream, tracks } = cameraStream()
    const accept = vi.fn()
    const request = createCameraRequestGuard()

    request.cancel()
    request.accept(stream, accept)

    expect(accept).not.toHaveBeenCalled()
    expect(tracks[0].stop).toHaveBeenCalledOnce()
    expect(tracks[1].stop).toHaveBeenCalledOnce()
  })

  it('does not publish a rejection from a cancelled request', () => {
    const reject = vi.fn()
    const request = createCameraRequestGuard()

    request.cancel()
    request.reject(new Error('busy'), reject)

    expect(reject).not.toHaveBeenCalled()
  })
})
