import type { CompositeDeps } from './composite';

// Real canvas/image plumbing for compositing. Irreducible browser glue
// (fetch + createImageBitmap + OffscreenCanvas), exercised at runtime in the
// content script but not in happy-dom — excluded from coverage in
// vitest.config.ts. The testable orchestration lives in composite.ts.
export const defaultCompositeDeps: CompositeDeps = {
  async loadImage(src) {
    const response = await fetch(src);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  },
  createSurface(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context is unavailable');
    return {
      context,
      drawImage: (image) => {
        context.drawImage(image.source, 0, 0);
      },
      toBlob: () => canvas.convertToBlob({ type: 'image/png' }),
    };
  },
};
