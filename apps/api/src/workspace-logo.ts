import { createHash } from "node:crypto";
import sharp from "sharp";
import { workspaceLogoInputSchema } from "@founderhq/api-contract";
import { DataPlaneError } from "./data-plane.js";

/** Decode and re-encode uploaded pixels; never persist arbitrary file content. */
export async function normalizeWorkspaceLogo(input: string) {
  try {
    const value = workspaceLogoInputSchema.parse(input);
    const [prefix, encoded] = value.split(",") as [string, string];
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64") !== encoded)
      throw new Error("Invalid encoding");
    const image = sharp(bytes, {
      limitInputPixels: 1_048_576,
      failOn: "warning",
      pages: 1,
    });
    const metadata = await image.metadata();
    const expectedFormat = prefix.match(/^data:image\/(\w+);/)?.[1];
    if (
      !["png", "jpeg", "webp"].includes(metadata.format ?? "") ||
      metadata.format !== expectedFormat
    )
      throw new Error("Unsupported format");
    const data = await image
      .rotate()
      .resize({
        width: 512,
        height: 512,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
    if (data.length > 90_000) throw new Error("Logo too large");
    return {
      data: data.toString("base64"),
      version: createHash("sha256").update(data).digest("hex"),
    };
  } catch {
    throw new DataPlaneError(
      "invalid_input",
      "This image could not be used as a workspace logo. Choose a valid PNG, JPG or WebP image and try again.",
    );
  }
}
