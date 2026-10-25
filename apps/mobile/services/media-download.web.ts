/**
 * Web implementation for downloading media files directly without redirecting
 */
export async function downloadPhotoToDevice(imageUrl: string): Promise<boolean> {
  if (typeof window === "undefined" || !imageUrl) return false;

  const filename = `chatapp_photo_${Date.now()}.jpg`;

  // 1. Primary method: Fetch image as Blob and download via local same-origin object URL
  // This bypasses browser cross-origin download restrictions and downloads directly to local disk
  try {
    const res = await fetch(imageUrl, { mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 3000);
      return true;
    }
  } catch (err) {
    console.warn("Direct blob download failed, falling back to attachment URL:", err);
  }

  // 2. Secondary method for Cloudinary: append fl_attachment flag so browser triggers download
  // instead of navigating/redirecting to the image URL
  let downloadUrl = imageUrl;
  if (downloadUrl.includes("/image/upload/") && !downloadUrl.includes("/fl_attachment")) {
    downloadUrl = downloadUrl.replace("/image/upload/", "/image/upload/fl_attachment/");
  }

  try {
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (e) {
    console.error("Web download error:", e);
    return false;
  }
}
