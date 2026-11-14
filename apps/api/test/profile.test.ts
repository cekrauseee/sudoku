import { beforeEach, describe, expect, it } from "vitest";

import { AVATAR_PRESETS } from "../src/modules/profile/avatar.ts";
import { useTestApp } from "./support/app.ts";
import { signInWithGoogle } from "./support/google.ts";
import { call } from "./support/http.ts";

const { app, services } = useTestApp();

let cookie: string;

beforeEach(async () => {
  cookie = await signInWithGoogle(app, {
    email: "alex@example.com",
    given_name: "Alex",
    family_name: "Rivera",
    picture: "https://lh3.googleusercontent.com/a/alex",
  });
});

const updateProfile = (json: unknown) =>
  call(app, "/api/me", { method: "PATCH", cookie, json });

describe("Profile names", () => {
  it("updates the names, normalizing whitespace", async () => {
    const response = await updateProfile({
      firstName: "  Ana  Clara ",
      lastName: " Souza",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      firstName: "Ana Clara",
      lastName: "Souza",
    });
    const [user] = await services.db.query.users.findMany();
    expect(user?.name).toBe("Ana Clara Souza");
  });

  it("removes the last name when it is empty", async () => {
    const response = await updateProfile({ lastName: "  " });

    expect(await response.json()).toMatchObject({
      firstName: "Alex",
      lastName: null,
    });
  });

  it("accepts names up to 30 characters", async () => {
    const response = await updateProfile({
      firstName: "😀".repeat(30),
      lastName: "b".repeat(30),
    });

    expect(response.status).toBe(200);
  });

  it.each([
    ["an empty first name", { firstName: "   " }, "firstName"],
    [
      "a first name over 30 characters",
      { firstName: "a".repeat(31) },
      "firstName",
    ],
    [
      "a last name over 30 characters",
      { lastName: "b".repeat(31) },
      "lastName",
    ],
    [
      "a name over 30 characters of emoji",
      { firstName: "😀".repeat(31) },
      "firstName",
    ],
    ["control characters", { firstName: "Al\u0000ex" }, "firstName"],
    ["a non-string name", { firstName: 42 }, "firstName"],
    ["an unknown field", { email: "mallory@example.com" }, ""],
    ["an empty update", {}, ""],
  ])("rejects %s", async (_case, json, path) => {
    const response = await updateProfile(json);

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; issues: { path: string }[] };
    };
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.issues.map((issue) => issue.path)).toContain(path);
  });
});

describe("Avatar selection", () => {
  it.each(AVATAR_PRESETS)("selects the %s preset", async (preset) => {
    const response = await updateProfile({
      avatar: { kind: "preset", preset },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      avatar: { kind: "preset", preset },
    });
  });

  it("returns to the Google photo", async () => {
    await updateProfile({ avatar: { kind: "preset", preset: "violet-moon" } });

    const response = await updateProfile({ avatar: { kind: "provider" } });

    expect(await response.json()).toMatchObject({
      avatar: {
        kind: "provider",
        url: "https://lh3.googleusercontent.com/a/alex",
      },
    });
  });

  it.each([
    ["an unknown preset", { kind: "preset", preset: "green-star" }],
    ["a preset without its name", { kind: "preset" }],
    ["an upload without a file", { kind: "upload" }],
  ])("rejects %s", async (_case, avatar) => {
    const response = await updateProfile({ avatar });

    expect(response.status).toBe(400);
  });
});
