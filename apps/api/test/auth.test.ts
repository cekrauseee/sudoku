import { describe, expect, it } from "vitest";

import { useTestApp } from "./support/app.ts";
import { signInWithGoogle } from "./support/google.ts";
import { call } from "./support/http.ts";
import { imageForm, splitImage } from "./support/images.ts";

const { app, services } = useTestApp();

const alex = {
  email: "alex@example.com",
  name: "Alex Rivera",
  given_name: "Alex",
  family_name: "Rivera",
  picture: "https://lh3.googleusercontent.com/a/alex",
};

describe("Google sign-in", () => {
  it("creates the user from the Google profile on first sign-in", async () => {
    const cookie = await signInWithGoogle(app, alex);

    const response = await call(app, "/api/me", { cookie });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      email: "alex@example.com",
      firstName: "Alex",
      lastName: "Rivera",
      avatar: {
        kind: "provider",
        url: "https://lh3.googleusercontent.com/a/alex",
      },
    });
  });

  it("derives a first name when Google omits it and fits long names", async () => {
    const cookie = await signInWithGoogle(app, {
      email: "sam.lee@example.com",
      name: "Sam",
      family_name: "Montgomery-Wolfeschlegelsteinhausen",
      picture: "http://insecure.example.com/photo.jpg",
    });

    const profile = await (await call(app, "/api/me", { cookie })).json();

    expect(profile).toMatchObject({
      firstName: "Sam",
      lastName: "Montgomery-Wolfeschlegelsteinh",
      avatar: { kind: "provider", url: null },
    });
  });

  it("keeps profile edits when the user signs in again", async () => {
    const first = await signInWithGoogle(app, alex);
    const edited = await call(app, "/api/me", {
      method: "PATCH",
      cookie: first,
      json: { firstName: "Lex" },
    });
    const { id } = (await edited.json()) as { id: string };

    const second = await signInWithGoogle(app, alex);
    const profile = await (
      await call(app, "/api/me", { cookie: second })
    ).json();

    expect(profile).toMatchObject({ id, firstName: "Lex", lastName: "Rivera" });
  });

  it("does not expose Better Auth's user update endpoint", async () => {
    const cookie = await signInWithGoogle(app, alex);

    const response = await call(app, "/api/auth/update-user", {
      method: "POST",
      cookie,
      json: { name: "Mallory", image: "https://attacker.example.com/a.png" },
    });

    expect(response.status).toBe(404);
  });
});

describe("Sessions", () => {
  it("rejects profile requests without a session", async () => {
    const response = await call(app, "/api/me");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
  });

  it("ends the session on sign-out", async () => {
    const cookie = await signInWithGoogle(app, alex);

    const signOut = await call(app, "/api/auth/sign-out", {
      method: "POST",
      cookie,
      json: {},
    });

    expect(signOut.status).toBe(200);
    expect((await call(app, "/api/me", { cookie })).status).toBe(401);
  });

  it("lists sessions and revokes the other devices", async () => {
    const laptop = await signInWithGoogle(app, alex);
    const phone = await signInWithGoogle(app, alex);

    const sessions = await call(app, "/api/auth/list-sessions", {
      cookie: laptop,
    });
    expect(await sessions.json()).toHaveLength(2);

    const revoke = await call(app, "/api/auth/revoke-other-sessions", {
      method: "POST",
      cookie: laptop,
      json: {},
    });

    expect(revoke.status).toBe(200);
    expect((await call(app, "/api/me", { cookie: laptop })).status).toBe(200);
    expect((await call(app, "/api/me", { cookie: phone })).status).toBe(401);
  });
});

describe("Account deletion", () => {
  it("deletes the user with their sessions and stored photos", async () => {
    const cookie = await signInWithGoogle(app, alex);
    const upload = await call(app, "/api/me/avatar", {
      method: "PUT",
      cookie,
      form: imageForm(await splitImage(300, 300)),
    });
    const { avatar } = (await upload.json()) as { avatar: { url: string } };

    const response = await call(app, "/api/auth/delete-user", {
      method: "POST",
      cookie,
      json: {},
    });

    expect(response.status).toBe(200);
    expect((await call(app, "/api/me", { cookie })).status).toBe(401);
    expect((await call(app, new URL(avatar.url).pathname)).status).toBe(404);
    expect(await services.db.query.users.findMany()).toEqual([]);
    expect(await services.db.query.sessions.findMany()).toEqual([]);
  });
});
