import { readdirSync } from 'fs';
import path from 'path';

const REFERENCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

let referencePhotoQueue: string[] = [];
let nextReferencePhotoIndex = 0;

/** Used in `syncReferencePhotoQueue` and `pickReferencePhoto`. */
function listReferenceFilenames(referencePhotosDir: string) {
  return readdirSync(referencePhotosDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => REFERENCE_EXTENSIONS.has(path.extname(name).toLowerCase()));
}

/** Used in `syncReferencePhotoQueue`. */
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

/** Used in `pickReferencePhoto`. */
function syncReferencePhotoQueue(referencePhotosDir: string) {
  const onDisk = listReferenceFilenames(referencePhotosDir);

  if (onDisk.length === 0) throw new Error('Add at least one photo to reference-photos/');

  if (referencePhotoQueue.length === 0) {
    referencePhotoQueue = shuffle(onDisk);
    nextReferencePhotoIndex = 0;
    return;
  }

  const onDiskSet = new Set(onDisk);
  referencePhotoQueue = referencePhotoQueue.filter((name) => onDiskSet.has(name));

  const inQueue = new Set(referencePhotoQueue);
  for (const name of onDisk)
    if (!inQueue.has(name)) referencePhotoQueue.push(name);

  if (referencePhotoQueue.length === 0) {
    referencePhotoQueue = shuffle(onDisk);
    nextReferencePhotoIndex = 0;
  } else if (nextReferencePhotoIndex >= referencePhotoQueue.length) nextReferencePhotoIndex = 0;
}

/** Imported in `lib/ask-llm-to-generate-fitting.ts`. */
export function pickReferencePhoto(referencePhotosDir: string) {
  syncReferencePhotoQueue(referencePhotosDir);

  const chosenName = referencePhotoQueue[nextReferencePhotoIndex];
  nextReferencePhotoIndex = (nextReferencePhotoIndex + 1) % referencePhotoQueue.length;

  const filePath = path.join(referencePhotosDir, chosenName);

  console.log('Reference photos queue:', referencePhotoQueue);
  console.log('Reference photo using:', chosenName, filePath);

  return {
    path: filePath,
    mimeType: mimeTypeForExtension(path.extname(chosenName).toLowerCase()),
  };
}
