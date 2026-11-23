import crypto from 'crypto';
import exifr from 'exifr';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  UPLOAD_MAX_BYTES,
} from '../../shared/constants.ts';
import type { MediaInspectionResult } from '../../shared/types.ts';
import { decodeBase64Image, resizeRgba } from '../ml/imageFeatures.ts';

function computeDHash(imageBase64: string): string {
  const raster = decodeBase64Image(imageBase64);
  if (!raster) {
    return crypto.createHash('md5').update(imageBase64.slice(0, 2048)).digest('hex').slice(0, 16);
  }
  const px = resizeRgba(raster, 9, 8);
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const idxL = (y * 9 + x) * 4;
      const idxR = (y * 9 + (x + 1)) * 4;
      const lumL = 0.299 * px[idxL] + 0.587 * px[idxL + 1] + 0.114 * px[idxL + 2];
      const lumR = 0.299 * px[idxR] + 0.587 * px[idxR + 1] + 0.114 * px[idxR + 2];
      bits += lumL > lumR ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

export function hammingSimilarityHex64(a: string, b: string): number {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 0;
  let sameBits = 0;
  for (let i = 0; i < 16; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    for (let bit = 0; bit < 4; bit++) {
      if ((xor & (1 << bit)) === 0) sameBits += 1;
    }
  }
  return Math.round((sameBits / 64) * 1000) / 1000;
}

export async function inspectUploadedPhoto(params: {
  imageBase64: string;
  mimeType: string;
  captureSource: 'live_camera' | 'gallery_upload';
  existingImageHashes?: Array<{ complaintId: string; sha256?: string; dHash?: string }>;
  geminiSuspectedAi?: boolean;
}): Promise<{ ok: boolean; error?: string; result?: MediaInspectionResult }> {
  const mime = String(params.mimeType || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mime)) {
    return {
      ok: false,
      error: 'Only JPEG, PNG, or WebP photos are allowed.',
    };
  }

  const cleanBase64 = params.imageBase64.includes(',')
    ? params.imageBase64.split(',')[1]
    : params.imageBase64;
  const buffer = Buffer.from(cleanBase64, 'base64');

  if (buffer.length < 32 || buffer.length > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: 'Photo file size must be under 5 MB.',
    };
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const dHash = computeDHash(params.imageBase64);

  // Layer (i): Read EXIF timestamp/GPS & C2PA JUMBF markers if embedded
  let exifTimestamp: string | undefined;
  let exifLatitude: number | undefined;
  let exifLongitude: number | undefined;
  try {
    const parsedExif = (await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
    })) as
      | {
          DateTimeOriginal?: Date;
          CreateDate?: Date;
          latitude?: number;
          longitude?: number;
        }
      | undefined;

    if (parsedExif) {
      const dt = parsedExif.DateTimeOriginal || parsedExif.CreateDate;
      if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
        exifTimestamp = dt.toISOString();
      }
      if (typeof parsedExif.latitude === 'number' && typeof parsedExif.longitude === 'number') {
        exifLatitude = parsedExif.latitude;
        exifLongitude = parsedExif.longitude;
      }
    }
  } catch {
    // EXIF may be stripped by mobile browsers or camera APIs — keep honest state
  }

  const hasC2paManifest =
    buffer.includes(Buffer.from('c2pa')) || buffer.includes(Buffer.from('jumb'));

  // Layer (ii): Detect reused or near-identical photos already in the system
  let reusedComplaintId: string | undefined;
  for (const prev of params.existingImageHashes || []) {
    if (prev.sha256 && prev.sha256 === sha256) {
      reusedComplaintId = prev.complaintId;
      break;
    }
    if (prev.dHash && hammingSimilarityHex64(prev.dHash, dHash) >= 0.92) {
      reusedComplaintId = prev.complaintId;
      break;
    }
  }

  // Layer (iii): AI-generated signal + config switch (never claims accuracy without real test set)
  const aiBlockingEnabled = process.env.AI_IMAGE_BLOCKING_ENABLED === 'true';
  const aiDetectorScore = params.geminiSuspectedAi ? 0.9 : 0.1;

  let authenticityStatus: MediaInspectionResult['authenticityStatus'] =
    params.captureSource === 'live_camera' ? 'verified_live' : 'gallery_not_live';
  let blocked = false;
  let notice =
    params.captureSource === 'live_camera'
      ? 'Live camera capture recorded.'
      : 'Gallery photo uploaded (marked "not live").';

  if (reusedComplaintId) {
    authenticityStatus = 'reused_photo';
    notice = 'This photo appears very similar to an earlier report and will be marked for review.';
  } else if (aiDetectorScore >= 0.85) {
    if (aiBlockingEnabled) {
      authenticityStatus = 'ai_blocked';
      blocked = true;
      notice =
        'This photo appears strongly consistent with AI-generated imagery. Please take a real live photo, or submit an appeal below.';
    } else {
      authenticityStatus = 'needs_review';
      notice = 'Photo accepted and marked "needs review" (AI blocking switch is off pending validation).';
    }
  } else if (params.captureSource === 'gallery_upload' && !exifTimestamp && !hasC2paManifest) {
    notice = 'Gallery upload without EXIF/C2PA metadata (marked "not live").';
  }

  return {
    ok: true,
    result: {
      authenticityStatus,
      exifTimestamp,
      exifLatitude,
      exifLongitude,
      hasC2paManifest,
      sha256,
      dHash,
      reusedComplaintId,
      aiDetectorScore,
      aiBlockingEnabled,
      blocked,
      notice,
    },
  };
}
