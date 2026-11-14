import sharp from "sharp";

export const BLUE = { r: 43, g: 89, b: 195 };
export const ORANGE = { r: 194, g: 87, b: 12 };

type Format = "png" | "jpeg" | "webp";

/** An image whose left half is blue and right half is orange. */
export async function splitImage(
  width: number,
  height: number,
  format: Format = "png",
) {
  const right = await sharp({
    create: {
      width: Math.ceil(width / 2),
      height,
      channels: 3,
      background: ORANGE,
    },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width, height, channels: 3, background: BLUE } })
    .composite([{ input: right, left: Math.floor(width / 2), top: 0 }])
    .toFormat(format)
    .toBuffer();
}

export function imageForm(
  bytes: Uint8Array,
  crop?: unknown,
  type = "image/png",
): FormData {
  const form = new FormData();
  form.set("image", new File([new Uint8Array(bytes)], "photo", { type }));
  if (crop !== undefined)
    form.set("crop", typeof crop === "string" ? crop : JSON.stringify(crop));
  return form;
}

export async function describeImage(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  const { data } = await sharp(bytes)
    .resize(1, 1, { fit: "fill", kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    hasExif: metadata.exif !== undefined,
    /** Color at the center of the image. */
    center: { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0 },
  };
}

/** Whether two colors are equal within lossy-compression tolerance. */
export function closeTo(
  actual: { r: number; g: number; b: number },
  expected: typeof BLUE,
) {
  return (
    Math.abs(actual.r - expected.r) < 24 &&
    Math.abs(actual.g - expected.g) < 24 &&
    Math.abs(actual.b - expected.b) < 24
  );
}
