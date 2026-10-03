// A minimal MP4 writer for one H.264 video track, so the spot's frames can
// be encoded frame by frame (WebCodecs) with exact timestamps instead of
// being screen-recorded in real time, which drops and doubles frames.
//
//   writeMp4({ width, height, fps, avcC, samples: [{ data, key }] }) → Buffer
//
// `avcC` is the decoder configuration WebCodecs reports
// (decoderConfig.description); each sample is one frame in AVCC form
// (length-prefixed NAL units, WebCodecs' `avc: { format: "avc" }`). Baseline
// profile only: no B-frames, so presentation order is decode order and no
// composition offsets are needed. Layout: ftyp, moov, mdat ("fast start").

const u8 = (n) => Buffer.from([n & 0xff]);
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const str = (s) => Buffer.from(s, "latin1");
const zeros = (n) => Buffer.alloc(n);

function box(type, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), str(type), body]);
}
function fullBox(type, version, flags, ...parts) {
  return box(type, u8(version), u8(flags >> 16), u8(flags >> 8), u8(flags), ...parts);
}

const MATRIX = Buffer.concat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

export function writeMp4({ width, height, fps, avcC, samples }) {
  if (!samples.length) throw new Error("No frames to write.");
  const timescale = fps * 512; // e.g. 12800 at 25 fps: one frame = 512 ticks
  const delta = 512;
  const mediaDuration = samples.length * delta;
  const movieDuration = Math.round((samples.length / fps) * 1000); // ms

  const moovFor = (dataOffset) => {
    const stsd = fullBox("stsd", 0, 0, u32(1), box("avc1",
      zeros(6), u16(1), // reserved, data_reference_index
      u16(0), u16(0), zeros(12), // pre_defined, reserved, pre_defined
      u16(width), u16(height),
      u32(0x00480000), u32(0x00480000), // 72 dpi
      u32(0), u16(1), // reserved, frame_count
      Buffer.concat([u8(0), zeros(31)]), // compressorname
      u16(0x0018), u16(0xffff), // depth, pre_defined
      box("avcC", Buffer.from(avcC)),
    ));
    const stts = fullBox("stts", 0, 0, u32(1), u32(samples.length), u32(delta));
    const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
    const stss = fullBox("stss", 0, 0, u32(keys.length), ...keys.map(u32));
    const stsc = fullBox("stsc", 0, 0, u32(1), u32(1), u32(samples.length), u32(1));
    const stsz = fullBox("stsz", 0, 0, u32(0), u32(samples.length), ...samples.map((s) => u32(s.data.length)));
    const stco = fullBox("stco", 0, 0, u32(1), u32(dataOffset));
    const stbl = box("stbl", stsd, stts, stss, stsc, stsz, stco);
    const minf = box("minf",
      fullBox("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0)),
      box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1))),
      stbl,
    );
    const mdia = box("mdia",
      fullBox("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(mediaDuration), u16(0x55c4), u16(0)),
      fullBox("hdlr", 0, 0, u32(0), str("vide"), zeros(12), str("CATTIPU video\0")),
      minf,
    );
    const tkhd = fullBox("tkhd", 0, 3,
      u32(0), u32(0), u32(1), u32(0), u32(movieDuration),
      zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX,
      u32(width * 0x10000), u32(height * 0x10000),
    );
    const mvhd = fullBox("mvhd", 0, 0,
      u32(0), u32(0), u32(1000), u32(movieDuration),
      u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2),
    );
    return box("moov", mvhd, box("trak", tkhd, mdia));
  };

  const ftyp = box("ftyp", str("isom"), u32(0x200), str("isom"), str("iso2"), str("avc1"), str("mp41"));
  const mdatSize = 8 + samples.reduce((n, s) => n + s.data.length, 0);
  const moovSize = moovFor(0).length;
  const moov = moovFor(ftyp.length + moovSize + 8);
  return Buffer.concat([ftyp, moov, u32(mdatSize), str("mdat"), ...samples.map((s) => Buffer.from(s.data))]);
}
