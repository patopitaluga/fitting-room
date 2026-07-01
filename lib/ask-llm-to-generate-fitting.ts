import { mkdirSync, readFileSync } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { pickReferencePhoto } from './pick-reference-photo.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const referencePhotosDir = path.join(projectRoot, 'reference-photos');

mkdirSync(referencePhotosDir, { recursive: true });

/** Used in `askLlmToGenerateFitting`. */
function imageFileToDataUrl(filePath: string, mimeType: string) {
  const data = readFileSync(filePath);
  return `data:${mimeType};base64,${data.toString('base64')}`;
}

/** Imported in `controllers/receive-image.ts`. */
export async function askLlmToGenerateFitting(clothingImagePath: string, clothingMimeType: string) {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is not set');

  const userPhoto = pickReferencePhoto(referencePhotosDir);
  const openai = new OpenAI();

  const response = await openai.responses.create({
    model: 'gpt-5.4',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'La primera imagen soy yo y la segunda es una ropa que me gustaría comprarme, puedes mostrarme cómo me quedaría el outfit completo con todos los accesorios',
          },
          {
            type: 'input_image',
            image_url: imageFileToDataUrl(userPhoto.path, userPhoto.mimeType),
          },
          {
            type: 'input_image',
            image_url: imageFileToDataUrl(clothingImagePath, clothingMimeType),
          },
        ],
      },
    ],
    tools: [{
      type: 'image_generation',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'low',
    }],
  });

  const imageBase64 = response.output
    .filter((output) => output.type === 'image_generation_call')
    .map((output) => output.result)
    .find(Boolean);

  if (!imageBase64) throw new Error('No generated image returned from OpenAI');

  return `data:image/png;base64,${imageBase64}`;
}
