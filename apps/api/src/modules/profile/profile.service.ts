import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Config } from "../../config.ts";
import type { Database } from "../../db/client.ts";
import { users } from "../../db/schema/index.ts";
import { ApiError } from "../../http/errors.ts";
import type { ObjectStorage, StoredObject } from "../../storage.ts";
import {
  defaultAvatarCrop,
  normalizeAvatarSource,
  readAvatarSource,
  renderAvatar,
} from "./avatar-image.ts";
import {
  AVATAR_CONTENT_TYPE,
  avatarImageKey,
  avatarSourceKey,
  deleteUserObjects,
  userObjectsPrefix,
} from "./avatar-storage.ts";
import type { AvatarCrop, AvatarPreset, AvatarUpload } from "./avatar.ts";
import { fullName } from "./name.ts";
import type { UpdateProfileInput } from "./profile.schemas.ts";

export type ProfileAvatar =
  /** `url` is the provider photo; clients show initials when it is `null`. */
  | { kind: "provider"; url: string | null }
  | { kind: "preset"; preset: AvatarPreset }
  | { kind: "upload"; url: string; crop: AvatarCrop };

export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  avatar: ProfileAvatar;
  createdAt: string;
}

interface ProfileDependencies {
  config: Config;
  db: Database;
  storage: ObjectStorage;
}

const profileColumns = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  image: users.image,
  avatarKind: users.avatarKind,
  avatarPreset: users.avatarPreset,
  avatarUpload: users.avatarUpload,
  createdAt: users.createdAt,
};

type ProfileRow = Pick<typeof users.$inferSelect, keyof typeof profileColumns>;

const userNotFound = () =>
  new ApiError(404, "not_found", "The user does not exist.");

export function createProfileService({
  config,
  db,
  storage,
}: ProfileDependencies) {
  function toProfile(row: ProfileRow): Profile {
    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      avatar: toAvatar(row),
      createdAt: row.createdAt.toISOString(),
    };
  }

  function toAvatar(row: ProfileRow): ProfileAvatar {
    if (row.avatarKind === "preset" && row.avatarPreset) {
      return { kind: "preset", preset: row.avatarPreset };
    }
    if (row.avatarKind === "upload" && row.avatarUpload) {
      const { imageId, crop } = row.avatarUpload;
      return {
        kind: "upload",
        url: `${config.apiUrl}/api/users/${row.id}/avatar/${imageId}.webp`,
        crop,
      };
    }
    return { kind: "provider", url: row.image };
  }

  async function findUser(userId: string): Promise<ProfileRow> {
    const [row] = await db
      .select(profileColumns)
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw userNotFound();
    return row;
  }

  /** Points the user at a stored upload and removes the objects it replaces. */
  async function applyUpload(
    userId: string,
    upload: AvatarUpload,
  ): Promise<Profile> {
    const [row] = await db
      .update(users)
      .set({ avatarKind: "upload", avatarPreset: null, avatarUpload: upload })
      .where(eq(users.id, userId))
      .returning(profileColumns);
    const keep = [
      avatarImageKey(userId, upload.imageId),
      avatarSourceKey(userId, upload.sourceId),
    ];
    await storage.deletePrefix(userObjectsPrefix(userId), row ? keep : []);
    if (!row) throw userNotFound();
    return toProfile(row);
  }

  return {
    async get(userId: string): Promise<Profile> {
      return toProfile(await findUser(userId));
    },

    async update(userId: string, input: UpdateProfileInput): Promise<Profile> {
      const current = await findUser(userId);
      const firstName = input.firstName ?? current.firstName;
      const lastName =
        input.lastName === undefined ? current.lastName : input.lastName;
      const avatar = input.avatar
        ? {
            avatarKind: input.avatar.kind,
            avatarPreset:
              input.avatar.kind === "preset" ? input.avatar.preset : null,
            avatarUpload: null,
          }
        : {};

      const [row] = await db
        .update(users)
        .set({
          firstName,
          lastName,
          name: fullName(firstName, lastName),
          ...avatar,
        })
        .where(eq(users.id, userId))
        .returning(profileColumns);
      if (!row) throw userNotFound();

      // Choosing another avatar discards the uploaded photo.
      if (input.avatar && current.avatarUpload)
        await deleteUserObjects(storage, userId);
      return toProfile(row);
    },

    async uploadAvatar(
      userId: string,
      file: Uint8Array,
      crop?: AvatarCrop,
    ): Promise<Profile> {
      await findUser(userId);
      const source = await normalizeAvatarSource(file);
      const upload: AvatarUpload = {
        imageId: randomUUID(),
        sourceId: randomUUID(),
        crop: crop ?? defaultAvatarCrop(source),
      };
      const image = await renderAvatar(source, upload.crop);
      await Promise.all([
        storage.put(
          avatarSourceKey(userId, upload.sourceId),
          source.data,
          AVATAR_CONTENT_TYPE,
        ),
        storage.put(
          avatarImageKey(userId, upload.imageId),
          image,
          AVATAR_CONTENT_TYPE,
        ),
      ]);
      return applyUpload(userId, upload);
    },

    async cropAvatar(userId: string, crop: AvatarCrop): Promise<Profile> {
      const { avatarUpload } = await findUser(userId);
      const stored =
        avatarUpload &&
        (await storage.get(avatarSourceKey(userId, avatarUpload.sourceId)));
      if (!avatarUpload || !stored) {
        throw new ApiError(
          409,
          "no_uploaded_avatar",
          "Upload a photo before cropping it.",
        );
      }

      const upload: AvatarUpload = {
        ...avatarUpload,
        imageId: randomUUID(),
        crop,
      };
      const image = await renderAvatar(
        await readAvatarSource(stored.body),
        crop,
      );
      await storage.put(
        avatarImageKey(userId, upload.imageId),
        image,
        AVATAR_CONTENT_TYPE,
      );
      return applyUpload(userId, upload);
    },

    /** The uploaded photo before cropping, for the owner to re-crop it. */
    async getAvatarSource(userId: string): Promise<StoredObject> {
      const { avatarUpload } = await findUser(userId);
      const stored =
        avatarUpload &&
        (await storage.get(avatarSourceKey(userId, avatarUpload.sourceId)));
      if (!stored)
        throw new ApiError(404, "not_found", "There is no uploaded photo.");
      return stored;
    },

    async getAvatarImage(
      userId: string,
      imageId: string,
    ): Promise<StoredObject> {
      const stored = await storage.get(avatarImageKey(userId, imageId));
      if (!stored)
        throw new ApiError(404, "not_found", "The avatar does not exist.");
      return stored;
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
