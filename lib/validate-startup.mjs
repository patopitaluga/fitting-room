import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const referencePhotosDir = path.join(projectRoot, 'reference-photos');

const REFERENCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** Used in `validateStartupRequirements`. */
function countReferencePhotos() {
  if (!existsSync(referencePhotosDir)) return 0;

  return readdirSync(referencePhotosDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => REFERENCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .length;
}

/** Imported in `server.ts` and `electron/main.mjs`. */
export function validateStartupRequirements() {
  const problems = [];

  if (!process.env.OPENAI_API_KEY?.trim()) 
    problems.push('OPENAI_API_KEY is missing. Add it to your .env file (see .env.example).');
  

  if (countReferencePhotos() === 0) 
    problems.push(
      'No reference photos found. Add at least one .jpg, .jpeg, .png, or .webp file to reference-photos/.',
    );
  

  if (problems.length === 0) return;

  throw new Error(problems.join('\n\n'));
}
