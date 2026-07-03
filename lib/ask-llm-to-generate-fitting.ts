import { mkdirSync, readFileSync } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import type { Response, ResponseInputContent, ResponseInputItem } from 'openai/resources/responses/responses';
import { fileURLToPath } from 'url';
import { pickReferencePhoto } from './pick-reference-photo.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const referencePhotosDir = path.join(projectRoot, 'reference-photos');

mkdirSync(referencePhotosDir, { recursive: true });

/** Used in `imageFileToDataUrl`. */
function imageFileToDataUrl(filePath: string, mimeType: string) {
  const data = readFileSync(filePath);
  return `data:${mimeType};base64,${data.toString('base64')}`;
}

/** Used in `askLlmToGenerateFitting`. */
function describeOpenAiGenerationFailure(response: Response) {
  const imageCalls = response.output.filter((item) => item.type === 'image_generation_call');
  const messages = response.output.filter((item) => item.type === 'message');
  const refusals = messages.flatMap((item) => (
    item.type === 'message'
      ? item.content
        .filter((part) => part.type === 'refusal')
        .map((part) => part.refusal)
      : []
  ));
  const assistantText = messages.flatMap((item) => (
    item.type === 'message'
      ? item.content
        .filter((part) => part.type === 'output_text')
        .map((part) => part.text)
      : []
  ));

  const details = {
    responseId: response.id,
    status: response.status ?? null,
    error: response.error,
    incompleteDetails: response.incomplete_details,
    outputText: response.output_text || null,
    outputTypes: response.output.map((item) => item.type),
    imageGenerationCalls: imageCalls.map((item) => ({
      id: item.id,
      status: item.status,
      hasResult: Boolean(item.result),
    })),
    refusals,
    assistantText,
  };

  console.error('OpenAI image generation failed:', details);

  const summaryParts = [
    response.error ? `${response.error.code}: ${response.error.message}` : null,
    refusals.length > 0 ? `Refusal: ${refusals.join(' ')}` : null,
    assistantText.length > 0 ? `Model text: ${assistantText.join(' ')}` : null,
    imageCalls.length > 0
      ? `Image generation calls: ${imageCalls.map((item) => `${item.status}${item.result ? '' : ' (no result)'}`).join(', ')}`
      : null,
    response.incomplete_details ? `Incomplete: ${JSON.stringify(response.incomplete_details)}` : null,
    response.output_text ? `Output text: ${response.output_text}` : null,
  ].filter(Boolean);

  return summaryParts.join(' | ') || 'No generated image returned from OpenAI';
}

/** Used in `askLlmToGenerateFitting`. */
function buildFittingInput(
  referencePhotoPath: string,
  referencePhotoMimeType: string,
  clothingImagePath: string,
  clothingMimeType: string,
): ResponseInputItem.Message {
  const content: ResponseInputContent[] = [
    {
      type: 'input_text',
      text: 'La primera imagen soy yo y la segunda es una ropa que me gustaría comprarme. Muéstrame cómo me quedaría el outfit completo con todos los accesorios. Respeta la forma de mi cuerpo de la primera imagen — proporciones, complexión y silueta — para que el calce sea realista y no parezca el cuerpo del modelo de la referencia de ropa.',
    },
    {
      type: 'input_image',
      detail: 'auto',
      image_url: imageFileToDataUrl(referencePhotoPath, referencePhotoMimeType),
    },
    {
      type: 'input_image',
      detail: 'auto',
      image_url: imageFileToDataUrl(clothingImagePath, clothingMimeType),
    },
  ];

  return {
    role: 'user',
    type: 'message',
    content,
  };
}

/** Imported in `controllers/receive-image.ts`. */
export async function askLlmToGenerateFitting(
  clothingImagePath: string,
  clothingMimeType: string,
  userPhoto?: { path: string; mimeType: string },
) {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is not set');

  const referencePhoto = userPhoto ?? pickReferencePhoto(referencePhotosDir);

  if (userPhoto) {
    console.log('Reference photo using camera upload:', userPhoto.path);
  }

  const openai = new OpenAI();

  const response = await openai.responses.create({
    model: 'gpt-5.4',
    input: [
      buildFittingInput(
        referencePhoto.path,
        referencePhoto.mimeType,
        clothingImagePath,
        clothingMimeType,
      ),
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

  if (!imageBase64) throw new Error(describeOpenAiGenerationFailure(response));

  return `data:image/png;base64,${imageBase64}`;
}
