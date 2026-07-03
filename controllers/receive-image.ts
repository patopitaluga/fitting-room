import { mkdirSync, unlinkSync } from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { askLlmToGenerateFitting } from '../lib/ask-llm-to-generate-fitting.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uploadsDir = path.join(__dirname, '..', 'temp-uploads');
mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

const uploadImages = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'reference', maxCount: 1 },
]);

/** Used in `createReceiveImageHandler`. */
async function handleUploadedImage(req: Request, res: Response, err: unknown) {
  if (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Upload failed' });
    return;
  }

  const clothingFile = req.files && !Array.isArray(req.files) ? req.files.image?.[0] : undefined;
  const referenceFile = req.files && !Array.isArray(req.files) ? req.files.reference?.[0] : undefined;

  if (!clothingFile) {
    res.status(400).json({ error: 'Provide an image' });
    return;
  }

  const tempPaths = [clothingFile.path];
  if (referenceFile) tempPaths.push(referenceFile.path);

  try {
    const imageDataUrl = await askLlmToGenerateFitting(
      clothingFile.path,
      clothingFile.mimetype || 'image/png',
      referenceFile
        ? {
          path: referenceFile.path,
          mimeType: referenceFile.mimetype || 'image/jpeg',
        }
        : undefined,
    );

    res.json({
      ok: true,
      imageDataUrl,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate fitting image',
    });
  } finally {
    for (const tempPath of tempPaths) {
      try {
        unlinkSync(tempPath);
      } catch (cleanupError) {
        console.warn('Could not delete temp upload', cleanupError);
      }
    }
  }
}

/** Mounted at `POST /capture` in `server.ts`. */
export function createReceiveImageHandler() {
  return (req: Request, res: Response) => {
    uploadImages(req, res, (err) => {
      handleUploadedImage(req, res, err).catch((error) => {
        console.error('Unhandled upload error', error);
      });
    });
  };
}
