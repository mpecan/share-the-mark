import { drawScene, type DrawContext, type RenderOptions } from './render';
import { defaultCompositeDeps } from './composite-surface';
import type { ResolvedAnnotation } from '@/src/anchor';
import type { Point } from '@/src/core/model';

// Composite annotations onto a screenshot into a PNG Blob (SPEC §5.4). The
// canvas/image plumbing is injected (see composite-surface) so the
// orchestration here is unit-testable without a real 2D canvas.

// What a capture provider hands back: the raster plus the document-space origin of
// its top-left corner. Annotations resolve to viewport-relative coordinates (so the
// live overlay can render them), so a viewport capture needs no shift (`{0,0}`) but a
// full-page capture — whose top-left is the document origin — needs `{scrollX, scrollY}`
// added before the marks are drawn. The session forwards this into `RenderOptions`.
export interface CapturedScreenshot {
  /** PNG data URL of the captured page. */
  dataUrl: string;
  /** Document-space offset of the image's top-left, in CSS px (added to coords). */
  offset: Point;
}

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
