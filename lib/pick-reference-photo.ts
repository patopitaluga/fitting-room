import { readdirSync } from 'fs';
import path from 'path';

const REFERENCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

let lastReferencePhotoPath: string | null = null;

/** Used in `pickReferencePhoto`. */
function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Used in `pickReferencePhoto`. */
function mimeTypeForExtension(extension: string) {
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/** Imported in `lib/ask-llm-to-generate-fitting.ts`. */
export function pickReferencePhoto(referencePhotosDir: string) {
  const filenames = readdirSync(referencePhotosDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => REFERENCE_EXTENSIONS.has(path.extname(name).toLowerCase()));

  if (filenames.length === 0) 
    throw new Error('Add at least one photo to reference-photos/');
  

  const shuffled = shuffle(filenames);
  const chosenName = shuffled.length === 1
    ? shuffled[0]
    : shuffled.find((name) => path.join(referencePhotosDir, name) !== lastReferencePhotoPath)
      ?? shuffled[0];

  const filePath = path.join(referencePhotosDir, chosenName);
  lastReferencePhotoPath = filePath;

  return {
    path: filePath,
    mimeType: mimeTypeForExtension(path.extname(chosenName).toLowerCase()),
  };
}
