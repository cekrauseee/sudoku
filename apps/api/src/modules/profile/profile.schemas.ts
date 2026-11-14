import { z } from "zod";

import { AVATAR_PRESETS, AVATAR_ROTATIONS } from "./avatar.ts";
import { NAME_MAX_LENGTH, normalizeName } from "./name.ts";

const name = z
  .string()
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .max(NAME_MAX_LENGTH, `Must have at most ${NAME_MAX_LENGTH} characters.`)
      .regex(/^\P{Cc}*$/u, "Must not contain control characters."),
  );

const firstName = name.pipe(z.string().min(1, "Must not be empty."));

/** An empty last name removes it. */
const lastName = z
  .union([name, z.null()])
  .transform((value) => (value === "" ? null : value));

export const avatarSelectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("provider") }),
  z.strictObject({ kind: z.literal("preset"), preset: z.enum(AVATAR_PRESETS) }),
]);

export const updateProfileSchema = z
  .strictObject({
    firstName: firstName.optional(),
    lastName: lastName.optional(),
    avatar: avatarSelectionSchema.optional(),
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    "Provide at least one field to update.",
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Tolerates rounding when a client computes fractions from pixels.
const EDGE_TOLERANCE = 1e-6;

export const avatarCropSchema = z
  .strictObject({
    rotation: z.literal(AVATAR_ROTATIONS),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine(
    (crop) =>
      crop.x + crop.width <= 1 + EDGE_TOLERANCE &&
      crop.y + crop.height <= 1 + EDGE_TOLERANCE,
    "The crop must stay within the image.",
  );

export const updateAvatarCropSchema = z.strictObject({
  crop: avatarCropSchema,
});

export const uploadAvatarSchema = z.object({
  // The size limit answers 413 and is checked when the image is processed.
  image: z.file("Attach the image as the `image` field."),
  /** JSON-encoded crop. Defaults to the largest centered square. */
  crop: z
    .string()
    .optional()
    .transform((value, context) => {
      if (value === undefined) return undefined;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({ code: "custom", message: "Must be valid JSON." });
        return z.NEVER;
      }
    })
    .pipe(avatarCropSchema.optional()),
});

export const avatarImageParamsSchema = z.object({
  userId: z.uuid(),
  file: z.string().regex(/^[0-9a-f-]{36}\.webp$/u),
});
