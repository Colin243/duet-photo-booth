import { describe, expect, it } from 'vitest'
import { classifyCameraFailure } from './cameraStatus'

describe('classifyCameraFailure', () => {
  it('classifies permission denial', () => {
    expect(classifyCameraFailure(new DOMException('denied', 'NotAllowedError')).phase).toBe('denied')
  })

  it('classifies a missing camera', () => {
    expect(classifyCameraFailure(new DOMException('missing', 'NotFoundError')).phase).toBe('unavailable')
  })

  it('falls back to a recoverable failure', () => {
    expect(classifyCameraFailure(new Error('busy'))).toEqual({
      phase: 'failed',
      message: 'The camera could not start. Close other camera apps and try again.',
    })
  })
})
