let context;
let master;
let musicGain;
let sfxGain;
let activeMusic;

function init() {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    musicGain = context.createGain();
    sfxGain = context.createGain();
    musicGain.connect(master);
    sfxGain.connect(master);
    master.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume();
  return context;
}

function synth(duration, sample) {
  const audio = init();
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i++) {
    channel[i] = sample(i / audio.sampleRate, i, channel.length);
  }
  return buffer;
}

function source(buffer, destination, loop = false) {
  const node = init().createBufferSource();
  node.buffer = buffer;
  node.loop = loop;
  node.connect(destination);
  return node;
}

function play(buffer, volume = 1, rate = 1) {
  init();
  const gain = context.createGain();
  const node = source(buffer, gain);
  gain.gain.value = volume;
  gain.connect(sfxGain);
  node.playbackRate.value = rate;
  node.start();
  return node;
}

function music(buffer, fadeSeconds = 0.5) {
  init();
  const now = context.currentTime;
  const gain = context.createGain();
  const node = source(buffer, gain, true);
  gain.connect(musicGain);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + fadeSeconds);
  node.start();

  if (activeMusic) {
    activeMusic.gain.gain.cancelScheduledValues(now);
    activeMusic.gain.gain.setValueAtTime(activeMusic.gain.gain.value, now);
    activeMusic.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    activeMusic.node.stop(now + fadeSeconds);
  }
  activeMusic = { node, gain };
}

function stopMusic(fadeSeconds = 0.5) {
  if (!activeMusic) return;
  const current = activeMusic;
  const now = context.currentTime;
  current.gain.gain.setValueAtTime(current.gain.gain.value, now);
  current.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
  current.node.stop(now + fadeSeconds);
  activeMusic = undefined;
}

function setVolume(channel, value) {
  init();
  ({ master, music: musicGain, sfx: sfxGain })[channel].gain.value = value;
}

export { init, music, play, setVolume, stopMusic, synth };
