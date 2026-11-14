import sharp from "sharp";

import { ApiError } from "../../http/errors.ts";
import type { AvatarCrop } from "./avatar.ts";

/** Largest accepted upload, in bytes. */
export const AVATAR_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** Smallest accepted width and height of an upload, in pixels. */
export const AVATAR_UPLOAD_MIN_DIMENSION = 64;
/** Side of the square avatar image, in pixels. */
export const AVATAR_SIZE = 512;
/** Longest side of the stored source photo, in pixels. */
export const AVATAR_SOURCE_MAX_DIMENSION = 2048;

export const AVATAR_UPLOAD_FORMATS = ["jpeg", "png", "webp"] as const;

// Rejects decompression bombs before decoding: 50 megapixels covers current phone cameras.
const MAX_INPUT_PIXELS = 50_000_000;

export interface AvatarSource {
  data: Buffer;
  width: number;
  height: number;
}

function invalidImage(message: string): ApiError {
  return new ApiError(422, "invalid_image", message);
}

export function imageTooLarge(): ApiError {
  return new ApiError(
    413,
    "image_too_large",
    `The image must be at most ${AVATAR_UPLOAD_MAX_BYTES / 1024 / 1024} MB.`,
  );
}

/**
 * Decodes an upload and stores it as the re-croppable source: oriented according to its
 * EXIF data, downscaled to {@link AVATAR_SOURCE_MAX_DIMENSION}, re-encoded as WebP and
 * stripped of metadata such as location.
 */
export async function normalizeAvatarSource(
  input: Uint8Array,
): Promise<AvatarSource> {
  if (input.byteLength > AVATAR_UPLOAD_MAX_BYTES) throw imageTooLarge();

  let format: string | undefined;
  try {
    ({ format } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata());
  } catch {
    throw invalidImage("The file is not a supported image.");
  }
  if (!AVATAR_UPLOAD_FORMATS.some((accepted) => accepted === format)) {
    throw invalidImage("Upload a JPEG, PNG or WebP image.");
  }

  try {
    const { data, info } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .autoOrient()
      .resize({
        width: AVATAR_SOURCE_MAX_DIMENSION,
        height: AVATAR_SOURCE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });

    if (
      info.width < AVATAR_UPLOAD_MIN_DIMENSION ||
      info.height < AVATAR_UPLOAD_MIN_DIMENSION
    ) {
      throw invalidImage(
        `The image must be at least ${AVATAR_UPLOAD_MIN_DIMENSION}×${AVATAR_UPLOAD_MIN_DIMENSION} pixels.`,
      );
    }
    return { data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidImage("The image could not be processed.");
  }
}

/** The largest centered square of an unrotated source. */
export function defaultAvatarCrop({
  width,
  height,
}: Pick<AvatarSource, "width" | "height">): AvatarCrop {
  const side = Math.min(width, height);
  return {
    rotation: 0,
    x: (width - side) / 2 / width,
    y: (height - side) / 2 / height,
    width: side / width,
    height: side / height,
  };
}

/** Renders the square avatar for a crop of the source. */
export async function renderAvatar(
  source: AvatarSource,
  crop: AvatarCrop,
): Promise<Buffer> {
  const sideways = crop.rotation === 90 || crop.rotation === 270;
  const width = sideways ? source.height : source.width;
  const height = sideways ? source.width : source.height;

  const left = clamp(Math.round(crop.x * width), 0, width - 1);
  const top = clamp(Math.round(crop.y * height), 0, height - 1);
  const region = {
    left,
    top,
    width: clamp(Math.round(crop.width * width), 1, width - left),
    height: clamp(Math.round(crop.height * height), 1, height - top),
  };

  return sharp(source.data)
    .rotate(crop.rotation)
    .extract(region)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer();
}

/** Reads the dimensions of a stored source. */
export async function readAvatarSource(
  data: Uint8Array,
): Promise<AvatarSource> {
  const { width, height } = await sharp(data).metadata();
  return { data: Buffer.from(data), width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
