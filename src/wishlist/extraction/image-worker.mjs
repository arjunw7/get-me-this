import sharp from "sharp";

sharp.cache(false);
sharp.concurrency(1);

const MAX_SIDE = 8_192;
const MAX_PIXELS = 20_000_000;
const OUTPUT_SIDE = 1_600;
const OUTPUT_BYTES = 2 * 1024 * 1024;
const FORMAT_BY_TYPE = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

function exactContainer(bytes, format) {
  if (format === "jpeg") {
    return (
      bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[bytes.length - 2] === 0xff &&
      bytes[bytes.length - 1] === 0xd9
    );
  }
  if (format === "png") {
    if (
      bytes.length < 20 ||
      !Buffer.from(bytes.subarray(0, 8)).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      )
    ) {
      return false;
    }
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      offset += 12 + length;
      if (offset > bytes.length) return false;
      if (type === "IEND") return offset === bytes.length && length === 0;
    }
    return false;
  }
  if (format === "webp") {
    return (
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP" &&
      bytes.readUInt32LE(4) + 8 === bytes.length
    );
  }
  return false;
}

async function normalize(message) {
  const input = Buffer.from(message.bytes);
  const expectedFormat = FORMAT_BY_TYPE[message.contentType];
  if (!expectedFormat || !exactContainer(input, expectedFormat)) {
    throw new Error("unsupported");
  }
  const base = sharp(input, {
    animated: false,
    failOn: "warning",
    limitInputPixels: MAX_PIXELS,
    sequentialRead: true,
  });
  const metadata = await base.metadata();
  if (
    metadata.format !== expectedFormat ||
    !metadata.width ||
    !metadata.height ||
    metadata.width < 1 ||
    metadata.height < 1 ||
    metadata.width > MAX_SIDE ||
    metadata.height > MAX_SIDE ||
    metadata.width * metadata.height > MAX_PIXELS ||
    (metadata.pages ?? 1) !== 1
  ) {
    throw new Error("unsafe-image");
  }

  for (const quality of [82, 68, 52, 36]) {
    const output = await sharp(input, {
      animated: false,
      failOn: "warning",
      limitInputPixels: MAX_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: OUTPUT_SIDE,
        height: OUTPUT_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality, effort: 4, smartSubsample: true })
      .toBuffer();
    if (output.length <= OUTPUT_BYTES) {
      return Uint8Array.from(output);
    }
  }
  throw new Error("output-too-large");
}

process.once("message", (message) => {
  normalize(message)
    .then((bytes) => {
      process.send?.({ bytes }, () => process.exit(0));
    })
    .catch(() => {
      process.send?.({ bytes: null }, () => process.exit(1));
    });
});
