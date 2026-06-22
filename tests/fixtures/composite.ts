import type { CompositeDeps, CompositeSurface, DrawContext, LoadedImage } from '@/src/capture';

// Shared canvas stub for the embed tests (session + mount). The real composite
// surface uses OffscreenCanvas/createImageBitmap, which happy-dom can't run, so the
// browser-free orchestration is tested with these injected deps instead.

const noop = (): void => undefined;

export function noopContext(): DrawContext {
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
    strokeRect: noop,
    stroke: noop,
    fill: noop,
    fillText: noop,
  };
}

export function fakeCompositeDeps(): CompositeDeps {
  const image: LoadedImage = { width: 10, height: 10, source: {} as CanvasImageSource };
  const surface: CompositeSurface = {
    context: noopContext(),
    drawImage: noop,
    toBlob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
  };
  return { loadImage: () => Promise.resolve(image), createSurface: () => surface };
}
