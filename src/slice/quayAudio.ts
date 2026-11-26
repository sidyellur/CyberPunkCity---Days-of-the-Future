// All tones are generated on board. The audio context is opened by a passenger gesture.
export function createQuayAudio() {
  const context = new AudioContext();
  const volume = context.createGain();
  volume.gain.value = 0;
  volume.connect(context.destination);
  const motor = context.createOscillator();
  motor.type = 'triangle';
  const harmonic = context.createOscillator();
  harmonic.type = 'sine';
  const motorMix = context.createGain();
  motorMix.gain.value = 0.3;
  harmonic.connect(motorMix).connect(volume);
  motor.connect(volume);
  motor.start(); harmonic.start();

  function update(speed: number, paused: boolean) {
    const t = context.currentTime;
    motor.frequency.setTargetAtTime(42 + speed * 38, t, 0.17);
    harmonic.frequency.setTargetAtTime(82 + speed * 77, t, 0.19);
    volume.gain.setTargetAtTime(paused ? 0 : 0.016 + speed * 0.022, t, 0.12);
  }

  function chime() {
    for (const [offset, frequency] of [[0, 587.33], [0.19, 880]]) {
      const note = context.createOscillator();
      const envelope = context.createGain();
      const start = context.currentTime + offset;
      note.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.065, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.71);
      note.connect(envelope).connect(context.destination);
      note.start(start); note.stop(start + 0.74);
      note.onended = () => { note.disconnect(); envelope.disconnect(); };
    }
  }

  return { update, chime, resume: () => context.resume(), close: () => context.close() };
}
