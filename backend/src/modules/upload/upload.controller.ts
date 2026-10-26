import { Hono } from "hono";
import { uploadService } from "./upload.service.js";

export const uploadRouter = new Hono();

uploadRouter.post("/image", async (c) => {
  try {
    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await c.req.json();
      const image = body.image || body.base64;
      if (!image) {
        return c.json({ error: "Missing image data" }, 400);
      }
      const folder = body.folder || "chatapp/view_once";
      const result = await uploadService.uploadImage(image, folder);
      return c.json({
        status: "ok",
        url: result.url,
        publicId: result.publicId,
      });
    }

    // Multipart/form-data upload
    const body = await c.req.parseBody();
    const file = body["file"] || body["image"];

    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const arrayBuffer = await (file as File).arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mime = (file as File).type || "image/jpeg";
      const base64 = `data:${mime};base64,${buffer.toString("base64")}`;

      const folder = (body["folder"] as string) || "chatapp/view_once";
      const result = await uploadService.uploadImage(base64, folder);
      return c.json({
        status: "ok",
        url: result.url,
        publicId: result.publicId,
      });
    }

    return c.json({ error: "Invalid upload request format" }, 400);
  } catch (err: any) {
    console.error("[Upload Error]:", err?.message || err);
    return c.json({ error: err?.message || "Failed to upload image" }, 500);
  }
});

uploadRouter.post("/audio", async (c) => {
  try {
    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await c.req.json();
      const audio = body.audio || body.base64;
      if (!audio) {
        return c.json({ error: "Missing audio data" }, 400);
      }
      const folder = body.folder || "chatapp/audio";
      const result = await uploadService.uploadAudio(audio, folder);
      return c.json({
        status: "ok",
        url: result.url,
        publicId: result.publicId,
      });
    }

    // Multipart/form-data upload
    const body = await c.req.parseBody();
    const file = body["file"] || body["audio"];

    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const arrayBuffer = await (file as File).arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mime = (file as File).type || "audio/mp4";
      const base64 = `data:${mime};base64,${buffer.toString("base64")}`;

      const folder = (body["folder"] as string) || "chatapp/audio";
      const result = await uploadService.uploadAudio(base64, folder);
      return c.json({
        status: "ok",
        url: result.url,
        publicId: result.publicId,
      });
    }

    return c.json({ error: "Invalid upload request format" }, 400);
  } catch (err: any) {
    console.error("[Upload Audio Error]:", err?.message || err);
    return c.json({ error: err?.message || "Failed to upload audio" }, 500);
  }
});

