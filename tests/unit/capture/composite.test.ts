import { describe, expect, it, vi } from 'vitest';
import {
  compositeAnnotations,
  type CompositeDeps,
  type CompositeSurface,
  type DrawContext,
  type LoadedImage,
  type RenderOptions,
} from '@/src/capture';
import type { ResolvedAnnotation } from '@/src/anchor';

const options: RenderOptions = {
  strokeColor: '#000',
  strokeWidth: 2,
  highlightColor: '#ff0',
  scale: 1,
};

const noop = (): void => undefined;

function noopContext(): DrawContext {
  return {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fillRect: noop,
    stroke: noop,
    fill: noop,
    fillText: noop,
  };
}

describe('compositeAnnotations', () => {
  it('loads the screenshot, draws it, renders annotations, and returns a PNG blob', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const image: LoadedImage = { width: 100, height: 50, source: {} as CanvasImageSource };

    const drawImage = vi.fn<(image: LoadedImage) => void>();
    const surface: CompositeSurface = {
      context: noopContext(),
      drawImage,
      toBlob: () => Promise.resolve(blob),
    };
    const createSurface = vi.fn<(w: number, h: number) => CompositeSurface>(() => surface);
    const deps: CompositeDeps = {
      loadImage: () => Promise.resolve(image),
      createSurface,
    };

    const annotations: ResolvedAnnotation[] = [
      { id: '1', kind: 'callout', index: 1, at: { x: 1, y: 1 } },
    ];

    const result = await compositeAnnotations(
      'data:image/png;base64,AAAA',
      annotations,
      options,
      deps,
    );

    expect(result).toBe(blob);
    expect(createSurface).toHaveBeenCalledWith(100, 50);
    expect(drawImage).toHaveBeenCalledWith(image);
  });
});
