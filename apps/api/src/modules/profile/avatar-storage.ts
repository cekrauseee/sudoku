import type { ObjectStorage } from "../../storage.ts";

// Every object a user owns lives under `users/<id>/`, so the whole prefix can be removed
// when the account is deleted.

export const AVATAR_CONTENT_TYPE = "image/webp";

export const userObjectsPrefix = (userId: string) => `users/${userId}/`;

export const avatarImageKey = (userId: string, imageId: string) =>
  `users/${userId}/avatar/${imageId}.webp`;

export const avatarSourceKey = (userId: string, sourceId: string) =>
  `users/${userId}/avatar-source/${sourceId}.webp`;

export function deleteUserObjects(
  storage: ObjectStorage,
  userId: string,
): Promise<void> {
  return storage.deletePrefix(userObjectsPrefix(userId));
}
