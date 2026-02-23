'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';

interface Settings {
  blurRadius: number;
  coverColor: string;
  method: 'blur' | 'fill' | 'inpaint' | 'remove';
  opacity: number;
}

interface ImageProcessorProps {
  imageSrc: string;
  settings: Settings;
  onProcessed: (dataUrl: string) => void;
}

export interface ImageProcessorHandle {
  process: () => void;
}

// ─── Alpha map calculation (from reference repo: alphaMap.js) ────────────────
/**
 * Calculates a per-pixel alpha map from a reference background capture of the
 * Gemini watermark logo. The alpha value represents how opaque the watermark
 * is at each pixel (0 = transparent, 1 = fully opaque).
 */
function calculateAlphaMap(bgImageData: ImageData): Float32Array {
  const { width, height, data } = bgImageData;
  const alphaMap = new Float32Array(width * height);
  for (let i = 0; i < alphaMap.length; i++) {
    const idx = i * 4;
    // Normalize max channel to 0–1
    alphaMap[i] = Math.max(data[idx], data[idx + 1], data[idx + 2]) / 255.0;
  }
  return alphaMap;
}

// ─── Watermark position calculation (from reference repo: engine.js) ─────────
/**
 * Gemini places its watermark logo in the bottom-right corner.
 * Size is 96×96px for images > 1024×1024, otherwise 48×48px.
 * Margin is 64px for large images, 32px for small.
 */
function getWatermarkInfo(width: number, height: number) {
  const isLarge = width > 1024 && height > 1024;
  const size = isLarge ? 96 : 48;
  const margin = isLarge ? 64 : 32;

  return {
    size,
    x: width - margin - size,
    y: height - margin - size,
    width: size,
    height: size,
  };
}

// ─── Load a reference background image and extract its alpha map ─────────────
async function loadAlphaMap(src: string, size: number): Promise<Float32Array> {
  // Helper: draw an image element onto a canvas and extract the alpha map
  const extractFromImg = (img: HTMLImageElement): Float32Array => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2d context');
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    return calculateAlphaMap(imageData);
  };

  // Primary: fetch as blob to avoid CORS/canvas-taint issues on mobile browsers
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          resolve(extractFromImg(img));
        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error(`Failed to load blob for ${src}`));
      };
      img.src = blobUrl;
    });
  } catch {
    // Fallback: try direct load with crossOrigin (desktop browsers)
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try { resolve(extractFromImg(img)); }
        catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.crossOrigin = 'anonymous';
      img.src = src;
    });
  }
}

// ─── Load image with SVG/CORS support ────────────────────────────────────────
function loadImageToCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  src: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      ctx.drawImage(img, 0, 0);
      resolve();
    };

    img.onerror = () => {
      // If crossOrigin caused the failure (e.g. data: URLs on some mobile
      // browsers), retry without it before falling back to fetch-as-blob.
      if (img.crossOrigin) {
        const img1b = new Image();
        img1b.onload = () => {
          canvas.width = img1b.naturalWidth || img1b.width;
          canvas.height = img1b.naturalHeight || img1b.height;
          ctx.drawImage(img1b, 0, 0);
          resolve();
        };
        img1b.onerror = () => {
          // Fallback: fetch as blob (handles SVG and CORS cases)
          fetch(src)
            .then((res) => res.blob())
            .then((blob) => {
              const blobUrl = URL.createObjectURL(blob);
              const img2 = new Image();
              img2.onload = () => {
                canvas.width = img2.naturalWidth || img2.width;
                canvas.height = img2.naturalHeight || img2.height;
                ctx.drawImage(img2, 0, 0);
                URL.revokeObjectURL(blobUrl);
                resolve();
              };
              img2.onerror = () => {
                URL.revokeObjectURL(blobUrl);
                reject(new Error('Failed to load image'));
              };
              img2.src = blobUrl;
            })
            .catch(reject);
        };
        img1b.src = src;
        return;
      }
      // Fallback: fetch as blob (handles SVG and CORS cases)
      fetch(src)
        .then((res) => res.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          const img2 = new Image();
          img2.onload = () => {
            canvas.width = img2.naturalWidth || img2.width;
            canvas.height = img2.naturalHeight || img2.height;
            ctx.drawImage(img2, 0, 0);
            URL.revokeObjectURL(blobUrl);
            resolve();
          };
          img2.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            reject(new Error('Failed to load image'));
          };
          img2.src = blobUrl;
        })
        .catch(reject);
    };

    // Only set crossOrigin for non-data URLs; setting it on data: URLs
    // causes failures on some mobile browsers (iOS Safari, Android Chrome).
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = src;
  });
}

// ─── Blur a region on canvas ─────────────────────────────────────────────────
function applyBoxBlur(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  passes: number = 3
) {
  for (let p = 0; p < passes; p++) {
    const imageData = ctx.getImageData(x, y, w, h);
    const src = new Uint8ClampedArray(imageData.data);
    const dst = imageData.data;
    const r = Math.max(1, Math.floor(radius / passes));

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
        for (let ky = -r; ky <= r; ky++) {
          for (let kx = -r; kx <= r; kx++) {
            const nx = Math.min(Math.max(px + kx, 0), w - 1);
            const ny = Math.min(Math.max(py + ky, 0), h - 1);
            const i = (ny * w + nx) * 4;
            rSum += src[i];
            gSum += src[i + 1];
            bSum += src[i + 2];
            aSum += src[i + 3];
            count++;
          }
        }
        const i = (py * w + px) * 4;
        dst[i] = rSum / count;
        dst[i + 1] = gSum / count;
        dst[i + 2] = bSum / count;
        dst[i + 3] = aSum / count;
      }
    }
    ctx.putImageData(imageData, x, y);
  }
}

// ─── Smart inpaint ────────────────────────────────────────────────────────────
function applyInpaint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  canvasWidth: number,
  canvasHeight: number
) {
  const borderSize = Math.max(10, Math.floor(Math.min(w, h) * 0.2));
  const borderPixels: [number, number, number, number][] = [];
  const sampleStep = 2;

  const sampleAt = (bx: number, by: number) => {
    if (bx >= 0 && bx < canvasWidth && by >= 0 && by < canvasHeight) {
      const d = ctx.getImageData(bx, by, 1, 1).data;
      borderPixels.push([d[0], d[1], d[2], d[3]]);
    }
  };

  for (let bx = x - borderSize; bx < x + w + borderSize; bx += sampleStep) {
    for (let by = y - borderSize; by < y; by += sampleStep) sampleAt(bx, by);
    for (let by = y + h; by < y + h + borderSize; by += sampleStep) sampleAt(bx, by);
  }
  for (let by = y; by < y + h; by += sampleStep) {
    for (let bx = x - borderSize; bx < x; bx += sampleStep) sampleAt(bx, by);
    for (let bx = x + w; bx < x + w + borderSize; bx += sampleStep) sampleAt(bx, by);
  }

  if (borderPixels.length === 0) return;

  const avg = borderPixels
    .reduce((acc, [r, g, b, a]) => [acc[0] + r, acc[1] + g, acc[2] + b, acc[3] + a], [0, 0, 0, 0])
    .map((v) => v / borderPixels.length);

  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const edgeFactor = Math.min(px, w - px, py, h - py) / (Math.min(w, h) * 0.5);
      const noise = (Math.random() - 0.5) * 12 * Math.min(edgeFactor, 1);
      data[i] = Math.min(255, Math.max(0, avg[0] + noise));
      data[i + 1] = Math.min(255, Math.max(0, avg[1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, avg[2] + noise));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, x, y);
  applyBoxBlur(ctx, x, y, w, h, 5, 2);
}

// ─── Alpha-map-guided inpaint ─────────────────────────────────────────────────
/**
 * Uses the alpha map to identify watermark pixels, then reconstructs each
 * watermark pixel by sampling nearby non-watermark pixels (distance-weighted).
 * This works regardless of the watermark color (white, black, or any color).
 *
 * For each watermark pixel (alpha > threshold), we look outward in a spiral
 * to find the nearest non-watermark pixels and blend them.
 */
function removeWatermarkWithAlphaMap(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number
) {
  const { x: ox, y: oy, width: w, height: h } = position;
  const ALPHA_THRESHOLD = 0.05;
  const SEARCH_RADIUS = Math.max(w, h) + 8; // search beyond the watermark bounds

  const data = imageData.data;

  // Build a mask: true = watermark pixel (needs reconstruction)
  const mask = new Uint8Array(w * h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (alphaMap[row * w + col] > ALPHA_THRESHOLD) {
        mask[row * w + col] = 1;
      }
    }
  }

  // For each masked pixel, find surrounding non-masked pixels and blend
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (!mask[row * w + col]) continue;

      // Collect nearby non-watermark pixels with distance weighting
      let rSum = 0, gSum = 0, bSum = 0, wSum = 0;

      for (let radius = 1; radius <= SEARCH_RADIUS && wSum < 8; radius++) {
        // Sample pixels at this radius distance (ring sampling)
        const step = Math.max(1, Math.floor(radius / 2));
        for (let dy = -radius; dy <= radius; dy += step) {
          for (let dx = -radius; dx <= radius; dx += step) {
            // Only sample pixels approximately at this radius
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < radius - 1 || dist > radius + 1) continue;

            const sRow = row + dy;
            const sCol = col + dx;

            // Check if within watermark region
            if (sRow >= 0 && sRow < h && sCol >= 0 && sCol < w) {
              // Within watermark region: only use non-masked pixels
              if (mask[sRow * w + sCol]) continue;
              const imgIdx = ((oy + sRow) * canvasWidth + (ox + sCol)) * 4;
              const weight = 1.0 / (dist * dist);
              rSum += data[imgIdx] * weight;
              gSum += data[imgIdx + 1] * weight;
              bSum += data[imgIdx + 2] * weight;
              wSum += weight;
            } else {
              // Outside watermark region: always usable (no watermark there)
              const absRow = oy + sRow;
              const absCol = ox + sCol;
              if (absRow < 0 || absRow >= canvasHeight || absCol < 0 || absCol >= canvasWidth) continue;
              const imgIdx = (absRow * canvasWidth + absCol) * 4;
              const weight = 1.0 / (dist * dist);
              rSum += data[imgIdx] * weight;
              gSum += data[imgIdx + 1] * weight;
              bSum += data[imgIdx + 2] * weight;
              wSum += weight;
            }
          }
        }
      }

      if (wSum > 0) {
        const imgIdx = ((oy + row) * canvasWidth + (ox + col)) * 4;
        data[imgIdx] = Math.round(rSum / wSum);
        data[imgIdx + 1] = Math.round(gSum / wSum);
        data[imgIdx + 2] = Math.round(bSum / wSum);
      }
    }
  }
}

// ─── Main component ──────────────────────────────────────────────────────────
const ImageProcessor = forwardRef<ImageProcessorHandle, ImageProcessorProps>(
  ({ imageSrc, settings, onProcessed }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useImperativeHandle(ref, () => ({
      async process() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Load the image onto the canvas
        try {
          await loadImageToCanvas(canvas, ctx, imageSrc);
        } catch (err) {
          console.error('ImageProcessor: failed to load image', err);
          // On mobile, if canvas loading fails entirely, return the original
          // so the UI doesn't get stuck in a processing state.
          onProcessed(imageSrc);
          return;
        }

        const { width, height } = canvas;

        // ── Auto mode: use reference-based alpha-map-guided inpainting ────
        const info = getWatermarkInfo(width, height);

        if (settings.method === 'remove' || settings.method === 'inpaint') {
          // Primary method: use the alpha map to identify watermark pixels,
          // then reconstruct them from surrounding non-watermark pixels.
          // This works for any watermark color (white, black, colored).
          try {
            const alphaMap = await loadAlphaMap(
              info.size === 96 ? '/bg_96.png' : '/bg_48.png',
              info.size
            );

            const imageData = ctx.getImageData(0, 0, width, height);
            removeWatermarkWithAlphaMap(imageData, alphaMap, info, width, height);
            ctx.putImageData(imageData, 0, 0);

            // Final smoothing pass to blend the reconstructed region
            applyBoxBlur(ctx, info.x, info.y, info.width, info.height, 3, 2);
          } catch (e) {
            console.warn('Alpha map load failed, falling back to inpaint:', e);
            // Fallback to smart inpaint if alpha map assets unavailable
            applyInpaint(ctx, info.x, info.y, info.width, info.height, width, height);
          }
        } else if (settings.method === 'blur') {
          applyBoxBlur(ctx, info.x, info.y, info.width, info.height, settings.blurRadius, 4);
        } else if (settings.method === 'fill') {
          ctx.save();
          ctx.globalAlpha = settings.opacity;
          ctx.fillStyle = settings.coverColor;
          ctx.fillRect(info.x, info.y, info.width, info.height);
          ctx.restore();
        }

        onProcessed(canvas.toDataURL('image/png'));
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: 1, height: 1 }}
        aria-hidden="true"
      />
    );
  }
);

ImageProcessor.displayName = 'ImageProcessor';
export default ImageProcessor;
