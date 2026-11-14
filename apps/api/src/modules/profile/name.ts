/**
 * Maximum length of a first or last name, in characters (Unicode code points), as
 * counted by both the request validation and PostgreSQL's `char_length`.
 */
export const NAME_MAX_LENGTH = 30;

/** Normalizes a name for storage: Unicode NFC, collapsed and trimmed whitespace. */
export function normalizeName(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Normalizes a name and shortens it to {@link NAME_MAX_LENGTH} characters. */
export function truncateName(value: string): string {
  return Array.from(normalizeName(value))
    .slice(0, NAME_MAX_LENGTH)
    .join("")
    .trimEnd();
}

/** Full name kept in `users.name` for Better Auth and other consumers of the standard field. */
export function fullName(firstName: string, lastName: string | null): string {
  return lastName ? `${firstName} ${lastName}` : firstName;
}
