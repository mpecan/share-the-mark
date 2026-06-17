import { drawScene, type DrawContext, type RenderOptions } from './render';
import { defaultCompositeDeps } from './composite-surface';
import type { ResolvedAnnotation } from '@/src/anchor';

// Composite annotations onto a screenshot into a PNG Blob (SPEC §5.4). The
// canvas/image plumbing is injected (see composite-surface) so the
// orchestration here is unit-testable without a real 2D canvas.

export interface LoadedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
}

export interface CompositeSurface {
  context: DrawContext;
  drawImage: (image: LoadedImage) => void;
  toBlob: () => Promise<Blob>;
}

export interface CompositeDeps {
  loadImage: (src: string) => Promise<LoadedImage>;
  createSurface: (width: number, height: number) => CompositeSurface;
}

export async function compositeAnnotations(
  screenshot: string,
  annotations: readonly ResolvedAnnotation[],
  options: RenderOptions,
  deps: CompositeDeps = defaultCompositeDeps,
): Promise<Blob> {
  const image = await deps.loadImage(screenshot);
  const surface = deps.createSurface(image.width, image.height);
  surface.drawImage(image);
  drawScene(surface.context, annotations, options);
  return surface.toBlob();
}
