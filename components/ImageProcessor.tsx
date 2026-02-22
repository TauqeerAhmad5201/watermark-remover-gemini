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

// ─── Reverse alpha blending (from reference repo: blendModes.js) ─────────────
const ALPHA_THRESHOLD = 0.002;
const MAX_ALPHA = 0.99;
const LOGO_VALUE = 255; // Gemini logo is white (255,255,255)

/**
 * Reverses the alpha blending formula to recover the original pixel value
 * underneath the watermark:
 *   watermarked = alpha * LOGO_VALUE + (1 - alpha) * original
 *   => original = (watermarked - alpha * LOGO_VALUE) / (1 - alpha)
 */
function removeWatermarkRegion(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: { x: number; y: number; width: number; height: number }
) {
  const { x, y, width, height } = position;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;
      const alphaIdx = row * width + col;

      let alpha = alphaMap[alphaIdx];
      if (alpha < ALPHA_THRESHOLD) continue;
      alpha = Math.min(alpha, MAX_ALPHA);

      for (let c = 0; c < 3; c++) {
        const watermarked = imageData.data[imgIdx + c];
        // Reverse alpha blending
        const original = (watermarked - alpha * LOGO_VALUE) / (1.0 - alpha);
        imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
      }
    }
  }
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
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No 2d context')); return; }
      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      resolve(calculateAlphaMap(imageData));
    };
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    // crossOrigin must be set before src to avoid canvas taint on mobile browsers
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
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

        // ── Auto mode: use reference-based reverse alpha blending ──────────
        const info = getWatermarkInfo(width, height);

        if (settings.method === 'remove' || settings.method === 'inpaint') {
          // Primary method: mathematically remove the watermark using
          // the reference alpha maps from the reference repo
          try {
            const alphaMap = await loadAlphaMap(
              info.size === 96 ? '/bg_96.png' : '/bg_48.png',
              info.size
            );

            const imageData = ctx.getImageData(0, 0, width, height);
            removeWatermarkRegion(imageData, alphaMap, info);
            ctx.putImageData(imageData, 0, 0);
          } catch (e) {
            console.warn('Alpha map load failed, falling back to blur:', e);
            // Fallback to blur if assets unavailable
            applyBoxBlur(ctx, info.x, info.y, info.width, info.height, settings.blurRadius, 4);
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
