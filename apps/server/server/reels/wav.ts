/**
 * Just enough WAV handling for reel voiceovers (16-bit PCM from OpenAI TTS): length, and padding/joining scenes.
 * OpenAI streams its WAV, so the header's size fields say 0xFFFFFFFF; lengths come from the byte count instead.
 */
type Format = { channels: number; rate: number; bits: number; byteRate: number; dataOffset: number };

function format(bytes: Uint8Array): Format {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a WAV file");
  let at = 12;
  let fmt: Omit<Format, "dataOffset"> | null = null;
  while (at + 8 <= b.length) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "fmt ") fmt = { channels: b.readUInt16LE(at + 10), rate: b.readUInt32LE(at + 12), byteRate: b.readUInt32LE(at + 16), bits: b.readUInt16LE(at + 22) };
    if (id === "data") {
      if (!fmt) throw new Error("WAV data before its format");
      return { ...fmt, dataOffset: at + 8 };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data");
}

export function wavSeconds(bytes: Uint8Array) {
  const f = format(bytes);
  return (bytes.length - f.dataOffset) / f.byteRate;
}

/** Each part padded with silence to seconds[i] (or cut to it), joined into one WAV with a correct header. */
export function padAndJoinWav(parts: Uint8Array[], seconds: number[]): Uint8Array {
  const formats = parts.map(format);
  const f = formats[0];
  if (formats.some((x) => x.channels !== f.channels || x.rate !== f.rate || x.bits !== f.bits)) throw new Error("Voice parts have different formats");
  const block = (f.channels * f.bits) / 8;
  const pcm = parts.map((p, i) => {
    const want = Math.round(seconds[i] * f.rate) * block;
    const out = Buffer.alloc(want); // zeros = silence for 16-bit PCM
    Buffer.from(p.buffer, p.byteOffset + formats[i].dataOffset, Math.min(want, p.byteLength - formats[i].dataOffset)).copy(out);
    return out;
  });
  return pcmWav(Buffer.concat(pcm), f);
}

/** Raw 16-bit PCM (e.g. ElevenLabs pcm_24000) in a WAV with a correct header; 24 kHz mono, as OpenAI's voice. */
export function pcmWav(pcm: Uint8Array, f: { channels: number; rate: number; bits: number } = { channels: 1, rate: 24_000, bits: 16 }): Uint8Array {
  const block = (f.channels * f.bits) / 8;
  const size = pcm.length;
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + size, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(f.channels, 22);
  head.writeUInt32LE(f.rate, 24);
  head.writeUInt32LE(f.rate * block, 28);
  head.writeUInt16LE(block, 32);
  head.writeUInt16LE(f.bits, 34);
  head.write("data", 36);
  head.writeUInt32LE(size, 40);
  return new Uint8Array(Buffer.concat([head, pcm]));
}
