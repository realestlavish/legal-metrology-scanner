import type { AnalyzeLabelResponse } from '../types/scanner';

const MAX_IMAGES = 3;

function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured && configured.trim()) {
    return configured.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return '/api';
  }
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export const API_BASE_URL = resolveApiBase();

export async function analyzeLabelImages(
  images: Array<File | Blob>,
  lang = 'en',
): Promise<AnalyzeLabelResponse> {
  if (!images.length) {
    throw new Error('Add at least one label image before analyzing.');
  }
  if (images.length > MAX_IMAGES) {
    throw new Error(`You can analyze at most ${MAX_IMAGES} images per scan.`);
  }

  const formData = new FormData();
  images.forEach((image, index) => {
    const filename = image instanceof File ? image.name : `label_${index + 1}.jpg`;
    formData.append('files', image, filename);
  });

  try {
    const response = await fetch(`${API_BASE_URL}/analyze-label?lang=${encodeURIComponent(lang)}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `Server error (${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        }
      } catch {
        // Keep the status-code fallback.
      }
      throw new Error(errorMessage);
    }

    return (await response.json()) as AnalyzeLabelResponse;
  } catch (err: unknown) {
    if (err instanceof TypeError) {
      throw new Error(
        `Unable to connect to the FastAPI backend at ${API_BASE_URL}. Start it with: python main.py`,
      );
    }
    throw err;
  }
}

export async function analyzeLabelImage(imageFile: File | Blob, lang = 'en'): Promise<AnalyzeLabelResponse> {
  return analyzeLabelImages([imageFile], lang);
}

export async function checkBackendStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
