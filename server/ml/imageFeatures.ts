import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export interface DecodedRaster {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export const CATEGORIES = [
  'Potholes',
  'Garbage accumulation',
  'Water leakage',
  'Broken streetlights',
] as const;

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

export const FEATURE_NAMES = [
  'meanR',
  'meanG',
  'meanB',
  'stdR',
  'stdG',
  'stdB',
  'meanHue',
  'stdHue',
  'meanSat',
  'stdSat',
  'meanVal',
  'stdVal',
  'darkRatio',
  'brightSpotRatio',
  'upperSkyRatio',
  'upperBrightRatio',
  'lowerDarkRatio',
  'lowerAsphaltRatio',
  'lowerWaterCyanRatio',
  'lowerSpecularWetRatio',
  'garbageWarmRatio',
  'edgeDensity',
  'upperEdgeDensity',
  'lowerEdgeDensity',
  'centerEdgeRatio',
  'thinDarkInBrightSkyRatio',
  'centerCraterContrast',
  'upperWarmGlowRatio',
  'patchColorVariance',
  'colorEntropy',
] as const;

export function decodeBase64Image(input?: string): DecodedRaster | null {
  if (!input || typeof input !== 'string') return null;
  try {
    const cleaned = input.includes(',') ? input.split(',')[1] : input;
    const buf = Buffer.from(cleaned.trim(), 'base64');
    if (buf.length < 16) return null;

    // PNG magic bytes: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const png = PNG.sync.read(buf);
      return {
        width: png.width,
        height: png.height,
        rgba: new Uint8Array(png.data),
      };
    }

    // JPEG magic bytes: FF D8
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      const raw = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
      return {
        width: raw.width,
        height: raw.height,
        rgba: raw.data,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function resizeRgba(raster: DecodedRaster, targetW = 64, targetH = 64): Uint8Array {
  const out = new Uint8Array(targetW * targetH * 4);
  const { width, height, rgba } = raster;
  if (width <= 0 || height <= 0) return out;

  // Bilinear resampling preserves thin streetlight poles, wires, and pothole edges
  for (let y = 0; y < targetH; y++) {
    const fy = ((y + 0.5) * height) / targetH - 0.5;
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(fy)));
    const y1 = Math.max(0, Math.min(height - 1, y0 + 1));
    const wy = Math.max(0, fy - y0);

    for (let x = 0; x < targetW; x++) {
      const fx = ((x + 0.5) * width) / targetW - 0.5;
      const x0 = Math.max(0, Math.min(width - 1, Math.floor(fx)));
      const x1 = Math.max(0, Math.min(width - 1, x0 + 1));
      const wx = Math.max(0, fx - x0);

      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;
      const dstIdx = (y * targetW + x) * 4;

      for (let c = 0; c < 3; c++) {
        const top = rgba[i00 + c] * (1 - wx) + rgba[i10 + c] * wx;
        const bot = rgba[i01 + c] * (1 - wx) + rgba[i11 + c] * wx;
        out[dstIdx + c] = Math.round(top * (1 - wy) + bot * wy);
      }
      out[dstIdx + 3] = 255;
    }
  }
  return out;
}

function rgbToHsv(rNorm: number, gNorm: number, bNorm: number): [number, number, number] {
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === rNorm) h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6;
    else if (max === gNorm) h = ((bNorm - rNorm) / d + 2) / 6;
    else h = ((rNorm - gNorm) / d + 4) / 6;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

export function extractVisualFeatureVector(raster: DecodedRaster): number[] {
  const W = 64;
  const H = 64;
  const px = resizeRgba(raster, W, H);
  const N = W * H;

  const rArr = new Float64Array(N);
  const gArr = new Float64Array(N);
  const bArr = new Float64Array(N);
  const hArr = new Float64Array(N);
  const sArr = new Float64Array(N);
  const vArr = new Float64Array(N);
  const gray = new Float64Array(N);

  const hueBins = new Float64Array(12);
  let darkCount = 0;
  let brightCount = 0;
  let upperSkyCount = 0;
  let upperBrightCount = 0;
  let upperPixels = 0;
  let lowerDarkCount = 0;
  let lowerAsphaltCount = 0;
  let lowerWaterCyanCount = 0;
  let lowerSpecularWetCount = 0;
  let lowerPixels = 0;
  let garbageWarmCount = 0;
  let centerDarkCount = 0;
  let centerPixels = 0;
  let outerLowerDarkCount = 0;
  let outerLowerPixels = 0;
  let upperWarmGlowCount = 0;
  let upperDarkThinCount = 0;

  // 4x4 spatial tile average RGB for clutter / patch variance
  const tileMeanR = new Float64Array(16);
  const tileMeanG = new Float64Array(16);
  const tileMeanB = new Float64Array(16);
  const tileCounts = new Float64Array(16);

  let chromaticCount = 0;

  for (let y = 0; y < H; y++) {
    const inUpper = y < Math.floor(H * 0.5);
    const inLower = y >= Math.floor(H * 0.45);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const idx = i * 4;
      const r = px[idx] / 255;
      const g = px[idx + 1] / 255;
      const b = px[idx + 2] / 255;
      const [h, s, v] = rgbToHsv(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      rArr[i] = r;
      gArr[i] = g;
      bArr[i] = b;
      hArr[i] = h;
      sArr[i] = s;
      vArr[i] = v;
      gray[i] = lum;

      if (s >= 0.16 && v >= 0.15) {
        const bin = Math.min(11, Math.floor(h * 12));
        hueBins[bin] += 1;
        chromaticCount += 1;
      }

      const tileIdx = Math.floor(y / 16) * 4 + Math.floor(x / 16);
      tileMeanR[tileIdx] += r;
      tileMeanG[tileIdx] += g;
      tileMeanB[tileIdx] += b;
      tileCounts[tileIdx] += 1;

      if (v < 0.27) darkCount += 1;
      if (v > 0.82) brightCount += 1;
      if (((h >= 0.03 && h <= 0.24) || h >= 0.84) && s >= 0.25 && v >= 0.22) {
        garbageWarmCount += 1;
      }

      if (inUpper) {
        upperPixels += 1;
        if (v > 0.65) upperBrightCount += 1;
        // Overcast grey/white or clear blue sky in top half
        if ((s < 0.28 && v > 0.62) || (h >= 0.48 && h <= 0.68 && s >= 0.15 && v > 0.55)) {
          upperSkyCount += 1;
        }
        // Dark pole / lamp / wire silhouette in upper half
        if (v < 0.36) {
          upperDarkThinCount += 1;
        }
        // Warm streetlamp amber/yellow glow against darker sky
        if (h >= 0.06 && h <= 0.18 && s >= 0.35 && v > 0.68) {
          upperWarmGlowCount += 1;
        }
      }

      if (inLower) {
        lowerPixels += 1;
        if (v < 0.34) lowerDarkCount += 1;
        // Asphalt road surface in lower frame
        if (s < 0.22 && v >= 0.15 && v <= 0.62) lowerAsphaltCount += 1;
        // Water puddles / cyan-blue or cool muddy wet reflections strictly on the GROUND
        if (
          !(v > 0.78 && s < 0.35) &&
          ((h >= 0.44 && h <= 0.72 && s >= 0.16 && v >= 0.2) ||
            (b > r + 0.06 && b > g && s >= 0.12 && v >= 0.22))
        ) {
          lowerWaterCyanCount += 1;
        }
        if (s < 0.24 && v > 0.72) lowerSpecularWetCount += 1;

        const inCenter = x >= Math.floor(W * 0.24) && x < Math.floor(W * 0.76) && y >= Math.floor(H * 0.5) && y < Math.floor(H * 0.88);
        if (inCenter) {
          centerPixels += 1;
          if (v < 0.32) centerDarkCount += 1;
        } else {
          outerLowerPixels += 1;
          if (v < 0.32) outerLowerDarkCount += 1;
        }
      }
    }
  }

  // Sobel edge density (global, upper, lower, center, plus silhouette contrast)
  let totalEdge = 0;
  let upperEdge = 0;
  let lowerEdge = 0;
  let centerEdge = 0;
  let silhouetteEdge = 0;
  let edgeCount = 0;
  let upperEdgeCount = 0;
  let lowerEdgeCount = 0;
  let centerEdgeCount = 0;

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const gx =
        -gray[(y - 1) * W + (x - 1)] +
        gray[(y - 1) * W + (x + 1)] -
        2 * gray[y * W + (x - 1)] +
        2 * gray[y * W + (x + 1)] -
        gray[(y + 1) * W + (x - 1)] +
        gray[(y + 1) * W + (x + 1)];
      const gy =
        -gray[(y - 1) * W + (x - 1)] -
        2 * gray[(y - 1) * W + x] -
        gray[(y - 1) * W + (x + 1)] +
        gray[(y + 1) * W + (x - 1)] +
        2 * gray[(y + 1) * W + x] +
        gray[(y + 1) * W + (x + 1)];
      const mag = Math.min(1, Math.sqrt(gx * gx + gy * gy));
      totalEdge += mag;
      edgeCount += 1;

      if (y < Math.floor(H * 0.55)) {
        upperEdge += mag;
        upperEdgeCount += 1;
        // Sharp silhouette edge (e.g. dark pole/wire/lamp housing against bright sky)
        if (mag > 0.3 && gray[y * W + x] < 0.65) {
          silhouetteEdge += 1;
        }
      } else {
        lowerEdge += mag;
        lowerEdgeCount += 1;
      }

      if (x >= Math.floor(W * 0.24) && x < Math.floor(W * 0.76) && y >= Math.floor(H * 0.35) && y < Math.floor(H * 0.85)) {
        centerEdge += mag;
        centerEdgeCount += 1;
      }
    }
  }

  const mean = (arr: Float64Array) => {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    return sum / arr.length;
  };
  const std = (arr: Float64Array, m: number) => {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += (arr[i] - m) ** 2;
    return Math.sqrt(sum / arr.length);
  };

  const meanR = mean(rArr);
  const meanG = mean(gArr);
  const meanB = mean(bArr);
  const meanHue = mean(hArr);
  const meanSat = mean(sArr);
  const meanVal = mean(vArr);

  let entropy = 0;
  if (chromaticCount > 20) {
    for (let i = 0; i < hueBins.length; i++) {
      const p = hueBins[i] / chromaticCount;
      if (p > 1e-6) entropy -= p * Math.log2(p);
    }
  }
  const chromaticFrac = Math.min(1, chromaticCount / (N * 0.12));
  const colorEntropy = (entropy / Math.log2(12)) * chromaticFrac;

  // Patch color variance across 4x4 grid (high for garbage clutter, low for sky/uniform road)
  let patchVarSum = 0;
  for (let t = 0; t < 16; t++) {
    const cnt = tileCounts[t] || 1;
    const tr = tileMeanR[t] / cnt;
    const tg = tileMeanG[t] / cnt;
    const tb = tileMeanB[t] / cnt;
    patchVarSum += (tr - meanR) ** 2 + (tg - meanG) ** 2 + (tb - meanB) ** 2;
  }
  const patchColorVariance = Math.min(1, Math.sqrt(patchVarSum / 16) * 2.5);

  // Count dark pixels in the upper 70% that are horizontally flanked by bright sky on the SAME row
  // (distinguishes poles, lamp arms, and dangling wires from a dark road below a horizon)
  let poleInSkyHits = 0;
  let upperRowsWithSky = 0;
  for (let y = 2; y < Math.floor(H * 0.7); y++) {
    let rowSkyCount = 0;
    let rowDarkInSkyCount = 0;
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const isSky = (sArr[idx] < 0.32 && vArr[idx] > 0.6) || (hArr[idx] >= 0.48 && hArr[idx] <= 0.68 && sArr[idx] >= 0.14 && vArr[idx] > 0.56);
      if (isSky) rowSkyCount += 1;
    }
    if (rowSkyCount >= W * 0.35) {
      upperRowsWithSky += 1;
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (vArr[idx] < 0.44) {
          rowDarkInSkyCount += 1;
        }
      }
      // Thin pole/arm/wire occupies >0% and <45% of a sky-dominated row
      if (rowDarkInSkyCount > 0 && rowDarkInSkyCount < W * 0.45) {
        poleInSkyHits += rowDarkInSkyCount;
      }
    }
  }

  const upperSkyRatio = upperPixels > 0 ? upperSkyCount / upperPixels : 0;
  const upperBrightRatio = upperPixels > 0 ? upperBrightCount / upperPixels : 0;
  const skyBracketedDarkFrac = poleInSkyHits / Math.max(1, upperRowsWithSky * W);
  const thinDarkInBrightSkyRatio =
    upperSkyRatio > 0.32 && upperRowsWithSky >= 6
      ? Math.min(1, skyBracketedDarkFrac * 7.5 + (silhouetteEdge / Math.max(1, upperEdgeCount)) * 0.6)
      : 0;

  const centerDarkFrac = centerPixels > 0 ? centerDarkCount / centerPixels : 0;
  const outerLowerDarkFrac = outerLowerPixels > 0 ? outerLowerDarkCount / outerLowerPixels : 0;
  const centerCraterContrast = Math.max(0, Math.min(1, centerDarkFrac - outerLowerDarkFrac + centerDarkFrac * 0.45));

  return [
    meanR,
    meanG,
    meanB,
    std(rArr, meanR),
    std(gArr, meanG),
    std(bArr, meanB),
    meanHue,
    std(hArr, meanHue),
    meanSat,
    std(sArr, meanSat),
    meanVal,
    std(vArr, meanVal),
    darkCount / N,
    brightCount / N,
    upperSkyRatio,
    upperBrightRatio,
    lowerPixels > 0 ? lowerDarkCount / lowerPixels : 0,
    lowerPixels > 0 ? lowerAsphaltCount / lowerPixels : 0,
    lowerPixels > 0 ? lowerWaterCyanCount / lowerPixels : 0,
    lowerPixels > 0 ? lowerSpecularWetCount / lowerPixels : 0,
    garbageWarmCount / N,
    edgeCount > 0 ? totalEdge / edgeCount : 0,
    upperEdgeCount > 0 ? upperEdge / upperEdgeCount : 0,
    lowerEdgeCount > 0 ? lowerEdge / lowerEdgeCount : 0,
    centerEdgeCount > 0 ? centerEdge / centerEdgeCount : 0,
    thinDarkInBrightSkyRatio,
    centerCraterContrast,
    upperPixels > 0 ? upperWarmGlowCount / upperPixels : 0,
    patchColorVariance,
    colorEntropy,
  ];
}

export function explainVisualFeatures(features: number[], predictedCategory: string): string {
  const fMap = new Map<string, number>();
  FEATURE_NAMES.forEach((name, idx) => fMap.set(name, features[idx] ?? 0));

  const upperSky = fMap.get('upperSkyRatio') ?? 0;
  const thinDarkSky = fMap.get('thinDarkInBrightSkyRatio') ?? 0;
  const upperEdge = fMap.get('upperEdgeDensity') ?? 0;
  const darkRatio = fMap.get('darkRatio') ?? 0;
  const lowerWater = fMap.get('lowerWaterCyanRatio') ?? 0;
  const lowerSpecular = fMap.get('lowerSpecularWetRatio') ?? 0;
  const crater = fMap.get('centerCraterContrast') ?? 0;
  const asphalt = fMap.get('lowerAsphaltRatio') ?? 0;
  const garbageWarm = fMap.get('garbageWarmRatio') ?? 0;
  const entropy = fMap.get('colorEntropy') ?? 0;

  switch (predictedCategory) {
    case 'Broken streetlights':
      if (upperSky > 0.35 && thinDarkSky > 0.12) {
        return `Detected pole/fixture silhouette (${Math.round(upperEdge * 100)}% upper edge contrast) against bright sky (${Math.round(upperSky * 100)}% sky coverage).`;
      }
      return `Detected dark/low-illumination street scene (${Math.round(darkRatio * 100)}% dark area) with overhead fixture contrast.`;
    case 'Water leakage':
      return `Detected ground-level pooling/wet sheen (${Math.round(lowerWater * 100)}% water hue, ${Math.round(lowerSpecular * 100)}% lower specular reflection).`;
    case 'Potholes':
      return `Detected asphalt surface (${Math.round(asphalt * 100)}%) with central dark cavity contrast (${Math.round(crater * 100)}%).`;
    case 'Garbage accumulation':
      return `Detected multi-color roadside clutter (${Math.round(garbageWarm * 100)}% warm/mixed debris, ${Math.round(entropy * 100)}% hue entropy).`;
    default:
      return 'Classified via 30-feature Spatial CV + Softmax MLP.';
  }
}

export function computePerceptualHash(raster: DecodedRaster): string {
  // 9x8 grayscale dHash -> 64-bit binary string
  const px = resizeRgba(raster, 9, 8);
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i1 = (y * 9 + x) * 4;
      const i2 = (y * 9 + x + 1) * 4;
      const l1 = 0.299 * px[i1] + 0.587 * px[i1 + 1] + 0.114 * px[i1 + 2];
      const l2 = 0.299 * px[i2] + 0.587 * px[i2 + 1] + 0.114 * px[i2 + 2];
      bits += l1 > l2 ? '1' : '0';
    }
  }
  return bits;
}

export function computeRgbHistogram(raster: DecodedRaster): number[] {
  const px = resizeRgba(raster, 32, 32);
  const hist = new Array<number>(24).fill(0);
  for (let i = 0; i < px.length; i += 4) {
    hist[Math.min(7, Math.floor(px[i] / 32))] += 1;
    hist[8 + Math.min(7, Math.floor(px[i + 1] / 32))] += 1;
    hist[16 + Math.min(7, Math.floor(px[i + 2] / 32))] += 1;
  }
  const norm = Math.sqrt(hist.reduce((acc, v) => acc + v * v, 0)) || 1;
  return hist.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : Math.max(0, Math.min(1, dot / denom));
}

export function compareImagesForVerification(
  beforeBase64: string,
  afterBase64: string
): {
  imageSimilarity: number;
  ssimScore: number;
  edgeAlignment: number;
  luminanceDelta: number;
  decoded: boolean;
} {
  const rBefore = decodeBase64Image(beforeBase64);
  const rAfter = decodeBase64Image(afterBase64);

  if (!rBefore || !rAfter) {
    const identical = beforeBase64.trim() !== '' && beforeBase64 === afterBase64;
    return {
      imageSimilarity: identical ? 1.0 : 0.0,
      ssimScore: identical ? 1.0 : 0.0,
      edgeAlignment: identical ? 1.0 : 0.0,
      luminanceDelta: 0,
      decoded: false,
    };
  }

  const W = 64;
  const H = 64;
  const p1 = resizeRgba(rBefore, W, H);
  const p2 = resizeRgba(rAfter, W, H);
  const N = W * H;

  const g1 = new Float64Array(N);
  const g2 = new Float64Array(N);
  let mean1 = 0;
  let mean2 = 0;

  for (let i = 0; i < N; i++) {
    const idx = i * 4;
    const l1 = 0.299 * p1[idx] + 0.587 * p1[idx + 1] + 0.114 * p1[idx + 2];
    const l2 = 0.299 * p2[idx] + 0.587 * p2[idx + 1] + 0.114 * p2[idx + 2];
    g1[i] = l1;
    g2[i] = l2;
    mean1 += l1;
    mean2 += l2;
  }
  mean1 /= N;
  mean2 /= N;

  let var1 = 0;
  let var2 = 0;
  let cov12 = 0;
  for (let i = 0; i < N; i++) {
    const d1 = g1[i] - mean1;
    const d2 = g2[i] - mean2;
    var1 += d1 * d1;
    var2 += d2 * d2;
    cov12 += d1 * d2;
  }
  var1 /= N;
  var2 /= N;
  cov12 /= N;

  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const ssim =
    ((2 * mean1 * mean2 + C1) * (2 * cov12 + C2)) /
    ((mean1 * mean1 + mean2 * mean2 + C1) * (var1 + var2 + C2));

  const h1 = computePerceptualHash(rBefore);
  const h2 = computePerceptualHash(rAfter);
  let matchingBits = 0;
  for (let i = 0; i < 64; i++) {
    if (h1[i] === h2[i]) matchingBits += 1;
  }
  const dHashSim = matchingBits / 64;
  const histSim = cosineSimilarity(computeRgbHistogram(rBefore), computeRgbHistogram(rAfter));
  const combinedSim = 0.55 * histSim + 0.45 * dHashSim;

  // Spatial structure border alignment (top 30% + left/right borders represent surrounding street context)
  let borderMatch = 0;
  let borderTotal = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y < 18 || x < 12 || x >= W - 12) {
        const diff = Math.abs(g1[y * W + x] - g2[y * W + x]) / 255;
        borderMatch += 1 - diff;
        borderTotal += 1;
      }
    }
  }
  const edgeAlignment = borderTotal > 0 ? borderMatch / borderTotal : dHashSim;

  return {
    imageSimilarity: Math.round(combinedSim * 10000) / 10000,
    ssimScore: Math.round(Math.max(-1, Math.min(1, ssim)) * 10000) / 10000,
    edgeAlignment: Math.round(edgeAlignment * 10000) / 10000,
    luminanceDelta: Math.round((Math.abs(mean1 - mean2) / 255) * 10000) / 10000,
    decoded: true,
  };
}

export function compareImagesForDuplicate(base64A?: string, base64B?: string): number {
  const rA = decodeBase64Image(base64A);
  const rB = decodeBase64Image(base64B);
  if (!rA || !rB) return 0;
  const hA = computePerceptualHash(rA);
  const hB = computePerceptualHash(rB);
  let match = 0;
  for (let i = 0; i < 64; i++) if (hA[i] === hB[i]) match += 1;
  const dHashSim = match / 64;
  const histSim = cosineSimilarity(computeRgbHistogram(rA), computeRgbHistogram(rB));
  return Math.round((0.5 * dHashSim + 0.5 * histSim) * 10000) / 10000;
}
