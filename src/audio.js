let context;

function init() {
  context ||= new AudioContext();
  if (context.state === 'suspended') context.resume();
  return context;
}

function synth(duration, sample) {
  const audio = init();
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i++) {
    channel[i] = sample(i / audio.sampleRate);
  }
  return buffer;
}

// A one-shot SFX at `volume`, pitch-shifted by playback `rate`.
function play(buffer, volume, rate) {
  const gain = init().createGain();
  const node = context.createBufferSource();
  node.buffer = buffer;
  node.playbackRate.value = rate;
  gain.gain.value = volume;
  node.connect(gain);
  gain.connect(context.destination);
  node.start();
}

// Loops `buffer` forever at full volume.
function music(buffer) {
  const node = init().createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.connect(context.destination);
  node.start();
}

export { init, music, play, synth };
