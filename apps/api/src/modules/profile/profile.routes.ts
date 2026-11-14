import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { Auth } from "../../auth/index.ts";
import { requireSession } from "../../auth/session.ts";
import { validate } from "../../http/validation.ts";
import { AVATAR_UPLOAD_MAX_BYTES, imageTooLarge } from "./avatar-image.ts";
import { AVATAR_CONTENT_TYPE } from "./avatar-storage.ts";
import {
  avatarImageParamsSchema,
  updateAvatarCropSchema,
  updateProfileSchema,
  uploadAvatarSchema,
} from "./profile.schemas.ts";
import type { ProfileService } from "./profile.service.ts";

// Stops reading oversized bodies early. Room is left for the multipart envelope and the
// crop field; the image itself is limited to AVATAR_UPLOAD_MAX_BYTES when processed.
const UPLOAD_BODY_MAX_BYTES = AVATAR_UPLOAD_MAX_BYTES + 64 * 1024;

interface ProfileRoutesDependencies {
  auth: Auth;
  profiles: ProfileService;
}

/** The signed-in user's profile, mounted at `/api/me`. */
export function meRoutes({ auth, profiles }: ProfileRoutesDependencies) {
  return new Hono()
    .use(requireSession(auth))
    .get("/", async (c) => c.json(await profiles.get(c.var.user.id)))
    .patch("/", validate("json", updateProfileSchema), async (c) =>
      c.json(await profiles.update(c.var.user.id, c.req.valid("json"))),
    )
    .put(
      "/avatar",
      bodyLimit({
        maxSize: UPLOAD_BODY_MAX_BYTES,
        onError: () => {
          throw imageTooLarge();
        },
      }),
      validate("form", uploadAvatarSchema),
      async (c) => {
        const { image, crop } = c.req.valid("form");
        const bytes = new Uint8Array(await image.arrayBuffer());
        return c.json(await profiles.uploadAvatar(c.var.user.id, bytes, crop));
      },
    )
    .patch("/avatar", validate("json", updateAvatarCropSchema), async (c) =>
      c.json(
        await profiles.cropAvatar(c.var.user.id, c.req.valid("json").crop),
      ),
    )
    .get("/avatar/source", async (c) => {
      const source = await profiles.getAvatarSource(c.var.user.id);
      return c.body(source.body, 200, {
        "Content-Type": AVATAR_CONTENT_TYPE,
        "Cache-Control": "private, no-store",
      });
    });
}

/** Public user resources, mounted at `/api/users`. */
export function userRoutes({
  profiles,
}: Pick<ProfileRoutesDependencies, "profiles">) {
  return new Hono().get(
    "/:userId/avatar/:file",
    validate("param", avatarImageParamsSchema),
    async (c) => {
      const { userId, file } = c.req.valid("param");
      const image = await profiles.getAvatarImage(
        userId,
        file.replace(/\.webp$/u, ""),
      );
      // Each crop gets a new object id, so a URL always serves the same image.
      return c.body(image.body, 200, {
        "Content-Type": AVATAR_CONTENT_TYPE,
        "Cache-Control": "public, max-age=31536000, immutable",
      });
    },
  );
}
