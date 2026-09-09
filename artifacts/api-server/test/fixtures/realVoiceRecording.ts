import { Buffer } from "node:buffer";

/**
 * Deterministic WAV fixture shaped like a short microphone recording.
 *
 * Keeping the fixture as PCM makes the request exercise the same base64 and
 * format checks as a mobile recording, while the speech provider remains
 * mocked so the suite never uploads test audio or spends API credits.
 */
const sampleRate = 16_000;
const durationSeconds = 0.8;
const sampleCount = Math.floor(sampleRate * durationSeconds);
const pcm = Buffer.alloc(sampleCount * 2);

for (let index = 0; index < sampleCount; index += 1) {
  const envelope = Math.min(1, index / 800, (sampleCount - index) / 800);
  const sample = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 8_000 * envelope);
  pcm.writeInt16LE(sample, index * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0, "ascii");
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8, "ascii");
header.write("fmt ", 12, "ascii");
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36, "ascii");
header.writeUInt32LE(pcm.length, 40);

export const realVoiceRecording = Buffer.concat([header, pcm]);