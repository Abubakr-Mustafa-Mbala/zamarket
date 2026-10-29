// A sound when something new needs you — chiefly a new order.
//
// The tone is generated rather than loaded from a file: no asset to ship, no
// request to wait for, and it works offline. Two soft notes, a rising third,
// at a level that carries across a room without making anyone jump.
//
// Browsers refuse to play audio until the person has interacted with the page,
// so the first tap anywhere unlocks it. Until then calling play() is harmless.

const KEY = 'zamarket-sound'
let ctx = null
let unlocked = false

export const soundOn = () => {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}

export const setSound = (on) => {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private window */ }
  if (on) unlock()
}

// Audio has to be created inside a real user gesture or it stays suspended.
export function unlock() {
  if (unlocked) return
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = ctx || new AC()
    if (ctx.state === 'suspended') ctx.resume()
    unlocked = true
  } catch { /* no audio on this device */ }
}

export function chime({ urgent = false } = {}) {
  if (!soundOn() || !ctx || ctx.state !== 'running') return
  try {
    const now = ctx.currentTime
    // A major third for ordinary news, a fifth for something urgent: different
    // enough to tell apart from the next room without reading the screen.
    const notes = urgent ? [[784, 0], [1047, 0.13], [1047, 0.3]] : [[659, 0], [880, 0.13]]
    for (const [freq, at] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      // Shaped rather than switched: a square edge on a sine clicks.
      gain.gain.setValueAtTime(0, now + at)
      gain.gain.linearRampToValueAtTime(0.16, now + at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0008, now + at + 0.42)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(now + at); osc.stop(now + at + 0.45)
    }
  } catch { /* never let a sound break the page */ }
}

// One listener for the whole app: the first interaction turns audio on.
if (typeof window !== 'undefined') {
  const go = () => { unlock(); window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go) }
  window.addEventListener('pointerdown', go, { once: true })
  window.addEventListener('keydown', go, { once: true })
}
