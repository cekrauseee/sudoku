import type { GoogleProfile } from "better-auth/social-providers";

import { fullName, truncateName } from "../modules/profile/name.ts";

/** Longest provider photo URL kept; longer values are dropped rather than truncated. */
export const PROVIDER_IMAGE_URL_MAX_LENGTH = 2048;

/**
 * Maps a Google profile to the user created on first sign-in. Names are normalized and
 * shortened to the profile limits; the first name falls back to the display name and then
 * to the email's local part, because Google does not always provide `given_name`.
 */
export function mapGoogleProfile(profile: Partial<GoogleProfile>) {
  const firstName =
    truncateName(profile.given_name ?? "") ||
    truncateName(profile.name?.split(/\s+/u)[0] ?? "") ||
    truncateName(profile.email?.split("@")[0] ?? "") ||
    "Player";
  const lastName = truncateName(profile.family_name ?? "") || null;

  return {
    name: fullName(firstName, lastName),
    firstName,
    lastName,
    image: providerImageUrl(profile.picture),
  };
}

function providerImageUrl(value: string | undefined): string | undefined {
  if (!value || value.length > PROVIDER_IMAGE_URL_MAX_LENGTH) return undefined;
  return URL.parse(value)?.protocol === "https:" ? value : undefined;
}
