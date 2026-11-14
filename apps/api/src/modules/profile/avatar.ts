/**
 * Where a user's avatar comes from:
 * - `provider`: the photo inherited from Google (`users.image`), or initials when there is none.
 * - `preset`: one of the platform's predefined avatars.
 * - `upload`: a photo uploaded by the user, cropped to a square.
 */
export const AVATAR_KINDS = ["provider", "preset", "upload"] as const;
export type AvatarKind = (typeof AVATAR_KINDS)[number];

/** Predefined platform avatars. Clients map each value to its artwork. */
export const AVATAR_PRESETS = [
  "blue-sun",
  "teal-diamond",
  "amber-horizon",
  "violet-moon",
  "pink-peak",
  "ink-cross",
] as const;
export type AvatarPreset = (typeof AVATAR_PRESETS)[number];

export const AVATAR_ROTATIONS = [0, 90, 180, 270] as const;
export type AvatarRotation = (typeof AVATAR_ROTATIONS)[number];

/**
 * Square region of the uploaded photo that becomes the avatar.
 *
 * The photo is first rotated clockwise by `rotation`; `x`, `y`, `width` and `height` are
 * fractions (0–1) of the rotated photo's width and height, so they do not depend on its
 * resolution.
 */
export interface AvatarCrop {
  rotation: AvatarRotation;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Stored objects of an uploaded avatar. The source is kept so the photo can be re-cropped. */
export interface AvatarUpload {
  imageId: string;
  sourceId: string;
  crop: AvatarCrop;
}
