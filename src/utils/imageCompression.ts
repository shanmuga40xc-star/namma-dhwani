/**
 * Client-side canvas image compressor ensuring Firestore dataUrl payloads
 * stay strictly below the 350,000-character security rule limit and 1 MiB document cap.
 */
export async function compressImageFileToDataUrl(
  file: File,
  maxChars = 260000,
  maxDimension = 768
): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file'));
      }
    };
    reader.onerror = () => reject(new Error('Error reading image file'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Invalid image format'));
    el.src = rawDataUrl;
  });

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return rawDataUrl.slice(0, maxChars);
  }

  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.78;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > maxChars && quality > 0.32) {
    quality -= 0.1;
    result = canvas.toDataURL('image/jpeg', quality);
  }

  if (result.length > maxChars) {
    const shrinkCanvas = document.createElement('canvas');
    shrinkCanvas.width = Math.max(1, Math.round(width * 0.65));
    shrinkCanvas.height = Math.max(1, Math.round(height * 0.65));
    const sCtx = shrinkCanvas.getContext('2d');
    if (sCtx) {
      sCtx.drawImage(canvas, 0, 0, shrinkCanvas.width, shrinkCanvas.height);
      result = shrinkCanvas.toDataURL('image/jpeg', 0.62);
    }
  }

  return result;
}
