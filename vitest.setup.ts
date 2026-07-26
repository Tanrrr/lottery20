// jsdom does not implement HTMLMediaElement playback. Without this stub,
// calling .play()/.pause() on an <audio> element logs a noisy "not
// implemented" error to the console during tests and, in some jsdom
// versions, returns undefined instead of a Promise.
if (typeof window !== 'undefined') {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve()
  window.HTMLMediaElement.prototype.pause = () => {}
}
