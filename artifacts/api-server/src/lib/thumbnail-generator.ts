import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import sharp from "sharp";

export const PLACEHOLDER_THUMBNAIL = "";

/**
 * Generate a thumbnail for an ingredient using the OpenAI image integration,
 * then resize it to 128×128 JPEG and return it as a base64 data URL.
 * Storing the data (not a temporary URL) means the thumbnail never expires.
 */
export async function generateIngredientThumbnail(
  ingredientName: string,
): Promise<string> {
  try {
    const raw = await generateImageBuffer(
      `A clean digital illustration of a single ${ingredientName}, like a polished food app icon or high-quality food emoji. Slightly stylized — not a photograph, but detailed enough to be clearly recognizable. Natural colors, gentle shading, simple highlight. Pure white background. One item only, no garnishes, no props, no text. The shape should be immediately obvious at a small size.`,
      "1024x1024",
    );

    const resized = await sharp(raw)
      .resize(128, 128, { fit: "cover", position: "centre" })
      .jpeg({ quality: 85 })
      .toBuffer();

    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch (err) {
    console.error(
      "[thumbnail-generator] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return PLACEHOLDER_THUMBNAIL;
  }
}
