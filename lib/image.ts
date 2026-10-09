import sharp from "sharp"

sharp.concurrency(1)
sharp.cache(false)

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
export const MAX_IMAGE_DIMENSION = 12_000

export function isPng(contents: Buffer) {
  return contents.length >= PNG_SIGNATURE.length && contents.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
}

export async function inspectPng(contents: Buffer) {
  const metadata = await sharp(contents, { limitInputPixels: MAX_IMAGE_DIMENSION ** 2, failOn: "error" }).metadata()
  if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error("The image could not be read as a PNG.")
  if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
    throw new Error(`Images may not exceed ${MAX_IMAGE_DIMENSION.toLocaleString()} pixels in either dimension.`)
  }
  return { width: metadata.width, height: metadata.height }
}

export async function createThumbnail(input: string, output: string) {
  await sharp(input, { limitInputPixels: MAX_IMAGE_DIMENSION ** 2 })
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(output)
}
