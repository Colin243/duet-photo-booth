export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach(track => track.stop())
}

export function createCameraRequestGuard() {
  let active = true

  return {
    accept(stream: MediaStream, onAccept: (stream: MediaStream) => void) {
      if (active) {
        onAccept(stream)
        return
      }

      stopMediaStream(stream)
    },
    reject(error: unknown, onReject: (error: unknown) => void) {
      if (active) onReject(error)
    },
    cancel() {
      active = false
    },
  }
}
