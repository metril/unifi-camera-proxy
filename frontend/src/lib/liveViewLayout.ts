import type { LiveViewTile } from '../types';

/**
 * Aspect-fit a logical canvas into a viewport, returning the scale and the
 * centering offset (the letterbox / pillarbox math).
 *
 * Shared by ``LiveViewPlayer`` (which fits the kiosk fullscreen window) and
 * the dashboard's ``LiveWall`` (which fits the main column). Pure function
 * so it can be unit-tested without DOM.
 */
export function fitCanvas(
  canvas: { w: number; h: number },
  viewport: { w: number; h: number },
): { scale: number; width: number; height: number; offsetX: number; offsetY: number } {
  if (canvas.w <= 0 || canvas.h <= 0 || viewport.w <= 0 || viewport.h <= 0) {
    return { scale: 1, width: 0, height: 0, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(viewport.w / canvas.w, viewport.h / canvas.h);
  const width = canvas.w * scale;
  const height = canvas.h * scale;
  return {
    scale,
    width,
    height,
    offsetX: (viewport.w - width) / 2,
    offsetY: (viewport.h - height) / 2,
  };
}

/** Px rect for a single tile within the scaled canvas. */
export function tileRect(
  tile: Pick<LiveViewTile, 'x' | 'y' | 'w' | 'h'>,
  scale: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: tile.x * scale,
    top: tile.y * scale,
    width: tile.w * scale,
    height: tile.h * scale,
  };
}
