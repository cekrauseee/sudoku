import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";

import { useTestApp } from "./support/app.ts";
import { signInWithGoogle } from "./support/google.ts";
import { call } from "./support/http.ts";
import {
  BLUE,
  closeTo,
  describeImage,
  imageForm,
  ORANGE,
  splitImage,
} from "./support/images.ts";

const { app } = useTestApp();

let cookie: string;

beforeEach(async () => {
  cookie = await signInWithGoogle(app, {
    email: "alex@example.com",
    given_name: "Alex",
  });
});

interface UploadedAvatar {
  kind: "upload";
  url: string;
  crop: {
    rotation: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

async function upload(form: FormData) {
  const response = await call(app, "/api/me/avatar", {
    method: "PUT",
    cookie,
    form,
  });
  return {
    response,
    avatar: ((await response.clone().json()) as { avatar: UploadedAvatar })
      .avatar,
  };
}

const fetchAvatar = (url: string) => call(app, new URL(url).pathname);

describe("Avatar upload", () => {
  it("stores a 512 px square crop and keeps the photo for re-cropping", async () => {
    const { response, avatar } = await upload(
      imageForm(await splitImage(1200, 800)),
    );

    expect(response.status).toBe(200);
    expect(avatar).toMatchObject({
      kind: "upload",
      crop: { rotation: 0, x: 1 / 6, y: 0, width: 2 / 3, height: 1 },
    });

    const image = await fetchAvatar(avatar.url);
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/webp");
    expect(image.headers.get("Cache-Control")).toContain("immutable");
    expect(await describeImage(image)).toMatchObject({
      format: "webp",
      width: 512,
      height: 512,
    });

    const source = await call(app, "/api/me/avatar/source", { cookie });
    expect(source.status).toBe(200);
    expect(await describeImage(source)).toMatchObject({
      format: "webp",
      width: 1200,
      height: 800,
    });
  });

  it("applies the requested rotation and crop", async () => {
    // Rotated 90° clockwise, the blue left half becomes the top half.
    const crop = { rotation: 90, x: 0, y: 0, width: 1, height: 0.5 };
    const { avatar } = await upload(
      imageForm(await splitImage(400, 200), crop),
    );

    expect(avatar.crop).toEqual(crop);
    const { center } = await describeImage(await fetchAvatar(avatar.url));
    expect(closeTo(center, BLUE)).toBe(true);
  });

  it("downscales large photos and strips their metadata", async () => {
    const photo = await sharp(await splitImage(3000, 2000, "jpeg"))
      .withExif({ IFD0: { Artist: "Alex" } })
      .jpeg()
      .toBuffer();

    await upload(imageForm(photo, undefined, "image/jpeg"));

    const source = await describeImage(
      await call(app, "/api/me/avatar/source", { cookie }),
    );
    expect(source).toMatchObject({ width: 2048, height: 1365, hasExif: false });
  });

  it("re-crops from the stored photo and retires the previous image", async () => {
    const { avatar: original } = await upload(
      imageForm(await splitImage(400, 200)),
    );

    const response = await call(app, "/api/me/avatar", {
      method: "PATCH",
      cookie,
      json: { crop: { rotation: 0, x: 0.5, y: 0, width: 0.5, height: 1 } },
    });
    const { avatar } = (await response.json()) as { avatar: UploadedAvatar };

    expect(response.status).toBe(200);
    expect(avatar.url).not.toBe(original.url);
    expect(
      closeTo(
        (await describeImage(await fetchAvatar(avatar.url))).center,
        ORANGE,
      ),
    ).toBe(true);
    expect((await fetchAvatar(original.url)).status).toBe(404);
  });

  it("discards the uploaded photo when another avatar is chosen", async () => {
    const { avatar } = await upload(imageForm(await splitImage(300, 300)));

    await call(app, "/api/me", {
      method: "PATCH",
      cookie,
      json: { avatar: { kind: "preset", preset: "ink-cross" } },
    });

    expect((await fetchAvatar(avatar.url)).status).toBe(404);
    expect((await call(app, "/api/me/avatar/source", { cookie })).status).toBe(
      404,
    );
  });

  it("requires a session to read the stored photo", async () => {
    await upload(imageForm(await splitImage(300, 300)));

    expect((await call(app, "/api/me/avatar/source")).status).toBe(401);
  });

  it("refuses to re-crop without an uploaded photo", async () => {
    const response = await call(app, "/api/me/avatar", {
      method: "PATCH",
      cookie,
      json: { crop: { rotation: 0, x: 0, y: 0, width: 1, height: 1 } },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "no_uploaded_avatar" },
    });
  });
});

describe("Avatar upload validation", () => {
  it.each([
    ["just over 10 MB", 10 * 1024 * 1024 + 1],
    ["far over 10 MB", 12 * 1024 * 1024],
  ])("rejects files %s", async (_case, bytes) => {
    const response = await call(app, "/api/me/avatar", {
      method: "PUT",
      cookie,
      form: imageForm(new Uint8Array(bytes)),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: "image_too_large" },
    });
  });

  it.each([
    ["a file that is not an image", () => Buffer.from("not an image")],
    [
      "an unsupported format",
      () =>
        sharp({ create: size(200) })
          .gif()
          .toBuffer(),
    ],
    ["an image under 64 px", () => splitImage(63, 200)],
  ])("rejects %s", async (_case, image) => {
    const response = await call(app, "/api/me/avatar", {
      method: "PUT",
      cookie,
      form: imageForm(await image()),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_image" },
    });
  });

  it.each([
    [
      "a crop outside the image",
      { rotation: 0, x: 0.6, y: 0, width: 0.5, height: 1 },
    ],
    [
      "an unsupported rotation",
      { rotation: 45, x: 0, y: 0, width: 1, height: 1 },
    ],
    ["an empty crop", { rotation: 0, x: 0, y: 0, width: 0, height: 1 }],
    ["a crop that is not JSON", "{x:0"],
  ])("rejects %s", async (_case, crop) => {
    const response = await call(app, "/api/me/avatar", {
      method: "PUT",
      cookie,
      form: imageForm(await splitImage(300, 300), crop),
    });

    expect(response.status).toBe(400);
  });

  it("requires the image field", async () => {
    const response = await call(app, "/api/me/avatar", {
      method: "PUT",
      cookie,
      form: new FormData(),
    });

    expect(response.status).toBe(400);
  });
});

function size(side: number) {
  return { width: side, height: side, channels: 3 as const, background: BLUE };
}
