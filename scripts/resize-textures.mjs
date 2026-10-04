// Resize large images in public/textures to a maximum width of 2048 pixels.
// Preserve originals in textures-original, outside public, so they are not deployed.
import sharp from "sharp";
import { mkdirSync, copyFileSync, existsSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";

const DIR = "public/textures";
const BACKUP = "textures-original";
const MAX_WIDTH = 2048;

mkdirSync(BACKUP, { recursive: true });

for (const file of readdirSync(DIR)) {
  if (!/\.(jpg|jpeg|png)$/i.test(file)) continue;

  const src = path.join(DIR, file);
  const meta = await sharp(src).metadata();
  console.log(`${file}: ${meta.width}x${meta.height}`);

  if (!meta.width || meta.width <= MAX_WIDTH) {
    console.log("  → Already within limits; skipped.");
    continue;
  }

  // Back up each original only once.
  const backup = path.join(BACKUP, file);
  if (!existsSync(backup)) copyFileSync(src, backup);

  // Resize from the backup and replace the original file.
  const tmp = path.join(DIR, `tmp_${file}`);
  const pipeline = sharp(backup).resize({ width: MAX_WIDTH });
  if (/\.png$/i.test(file)) await pipeline.png({ compressionLevel: 9 }).toFile(tmp);
  else await pipeline.jpeg({ quality: 85, mozjpeg: true }).toFile(tmp);
  renameSync(tmp, src);
  console.log(`  → Resized to ${MAX_WIDTH}px.`);
}
console.log("Done ✅");