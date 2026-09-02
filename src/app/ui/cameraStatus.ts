export type CameraFailureStatus = {
  phase: 'denied' | 'unavailable' | 'failed'
  message: string
}

export type CameraStatus =
  | { phase: 'idle' | 'requesting' | 'ready' }
  | CameraFailureStatus

export function classifyCameraFailure(error: unknown): CameraFailureStatus {
  const name = error instanceof DOMException ? error.name : ''

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      phase: 'denied',
      message: 'Camera access is blocked. Allow camera access in your browser settings, then try again.',
    }
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      phase: 'unavailable',
      message: 'No camera was found. Connect a camera or choose another device, then try again.',
    }
  }

  return {
    phase: 'failed',
    message: 'The camera could not start. Close other camera apps and try again.',
  }
}
