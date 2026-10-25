import { v2 as cloudinary } from "cloudinary";

if (process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL,
  });
}

export class UploadService {
  /**
   * Upload an image (base64 string or data URI) to Cloudinary
   */
  async uploadImage(
    dataUriOrBase64: string,
    folder = "chatapp/view_once"
  ): Promise<{
    url: string;
    publicId: string;
  }> {
    let fileToUpload = dataUriOrBase64;
    if (!fileToUpload.startsWith("data:") && !fileToUpload.startsWith("http")) {
      fileToUpload = `data:image/jpeg;base64,${fileToUpload}`;
    }

    const result = await cloudinary.uploader.upload(fileToUpload, {
      folder,
      resource_type: "image",
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  }

  /**
   * Permanently delete an image from Cloudinary after being viewed
   */
  async deleteImage(publicId: string): Promise<boolean> {
    try {
      const res = await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
        invalidate: true,
      });
      console.log(`[Cloudinary] Image ${publicId} deleted:`, res.result);
      return res.result === "ok";
    } catch (err: any) {
      console.error(`[Cloudinary] Failed to delete image ${publicId}:`, err?.message || err);
      return false;
    }
  }
}

export const uploadService = new UploadService();
