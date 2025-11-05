export function getPublicIdFromCloudinaryUrl(url: string) {
    // remove domain + version + extension
    const parts = url.split("/upload/");
    const pathAndFile = parts[1]; // "v1698765432/uploads/my-image.jpg"
    const withoutVersion = pathAndFile.split("/").slice(1).join("/"); // "uploads/my-image.jpg"
    const publicId = withoutVersion.replace(/\.[^/.]+$/, ""); // remove extension
    return publicId;
  }