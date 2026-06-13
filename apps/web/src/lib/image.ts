// Client-side image downscale + JPEG compression. Keeps uploads small enough to
// inline as base64 to the grading API. Runs entirely in the browser via <canvas>.

export interface CompressedImage {
  /** Base64 JPEG WITHOUT the `data:` prefix — what the API expects. */
  base64: string;
  /** Full data URL — convenient for <img> thumbnails. */
  dataUrl: string;
}

// NVIDIA inlines images as base64 with a ~180KB limit per image; stay well under.
const MAX_B64_LEN = 160_000;

// Progressively smaller (dimension, quality) attempts until under the budget.
const ATTEMPTS: ReadonlyArray<readonly [number, number]> = [
  [1024, 0.7],
  [900, 0.62],
  [800, 0.55],
  [700, 0.48],
  [600, 0.42],
  [512, 0.38],
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // NOTE: do NOT set img.crossOrigin here. Picked files become blob: object
    // URLs and demo images are same-origin, so CORS is irrelevant — and setting
    // crossOrigin='anonymous' on a blob: src can make the image never fire
    // load/error in Chrome, hanging compression silently.
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(
      () => done(() => reject(new Error('Image load timed out'))),
      15000,
    );
    img.onload = () => done(() => resolve(img));
    img.onerror = () => done(() => reject(new Error('Could not load image')));
    img.src = src;
  });
}

function drawToJpeg(img: HTMLImageElement, maxDim: number, quality: number): CompressedImage {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return { base64, dataUrl };
}

/** Compress until the base64 fits NVIDIA's inline budget, shrinking as needed. */
function compressAdaptive(img: HTMLImageElement): CompressedImage {
  let last: CompressedImage | null = null;
  for (const [dim, q] of ATTEMPTS) {
    last = drawToJpeg(img, dim, q);
    if (last.base64.length <= MAX_B64_LEN) return last;
  }
  // Return the smallest attempt even if marginally over — best effort.
  return last as CompressedImage;
}

/** Compress a user-picked File. */
export async function compressFile(file: File): Promise<CompressedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    return compressAdaptive(img);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Compress an image referenced by URL (e.g. a bundled demo product). */
export async function compressUrl(url: string): Promise<CompressedImage> {
  const img = await loadImage(url);
  return compressAdaptive(img);
}
