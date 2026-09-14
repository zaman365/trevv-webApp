/** Fit a local image into a small static logo before sending it to the API. */
export async function prepareWorkspaceLogo(file: File): Promise<string> {
  const supported = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif",
  ]);
  if (!supported.has(file.type))
    throw new Error("Choose a PNG, JPG, WebP, GIF or AVIF image.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose an image smaller than 10 MB.");
  if (file.size === 0)
    throw new Error("This image is empty. Choose another file.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40_000_000
    )
      throw new Error("Choose an image up to 40 megapixels.");
    for (const edge of [512, 384, 256]) {
      const scale = Math.min(
        1,
        edge / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Image processing is unavailable in this browser.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/webp", 0.88);
      if (
        data.length <= 115_000 &&
        /^data:image\/(webp|png);base64,/.test(data)
      )
        return data;
    }
    throw new Error(
      "This image is too detailed for a logo. Try a smaller image.",
    );
  } catch (error) {
    if (error instanceof Error && error.name !== "EncodingError") throw error;
    throw new Error(
      "This image could not be opened. Choose another PNG, JPG, WebP, GIF or AVIF file.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
