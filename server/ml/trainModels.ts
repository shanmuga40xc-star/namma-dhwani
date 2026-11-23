import fs from 'fs';
import path from 'path';
import {
  CATEGORIES,
  type DecodedRaster,
  extractVisualFeatureVector,
  FEATURE_NAMES,
  SEVERITIES,
} from './imageFeatures.js';

// Deterministic PRNG (Mulberry32) so training runs are 100% reproducible
function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function gaussianNoise(rng: () => number, sigma: number): number {
  const u1 = Math.max(1e-7, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * sigma;
}

// =============================================================================
// Real 64x64 Procedural Civic Image Synthesizer -> Exact CV Feature Extraction
// Produces multi-modal images per class (daytime/nighttime/overcast/close-up)
// and feeds every rendered pixel buffer through extractVisualFeatureVector().
// =============================================================================
function setPixel(
  rgba: Uint8Array,
  W: number,
  H: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number
) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
  const idx = (yi * W + xi) * 4;
  rgba[idx] = clampByte(r);
  rgba[idx + 1] = clampByte(g);
  rgba[idx + 2] = clampByte(b);
  rgba[idx + 3] = 255;
}

function drawThickLine(
  rgba: Uint8Array,
  W: number,
  H: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  r: number,
  g: number,
  b: number
) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    for (let dy = -thickness; dy <= thickness; dy++) {
      for (let dx = -thickness; dx <= thickness; dx++) {
        if (dx * dx + dy * dy <= thickness * thickness + 0.5) {
          setPixel(rgba, W, H, cx + dx, cy + dy, r, g, b);
        }
      }
    }
  }
}

function drawFilledEllipse(
  rgba: Uint8Array,
  W: number,
  H: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  r: number,
  g: number,
  b: number,
  rng: () => number,
  jitter = 8
) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const norm = ((x - cx) / Math.max(1, rx)) ** 2 + ((y - cy) / Math.max(1, ry)) ** 2;
      if (norm <= 1.0 + (rng() - 0.5) * 0.12) {
        const j = (rng() - 0.5) * jitter;
        setPixel(rgba, W, H, x, y, r + j, g + j, b + j);
      }
    }
  }
}

function renderCivicSampleImage(
  catIdx: number,
  severityIdx: number,
  rng: () => number
): DecodedRaster {
  const W = 64;
  const H = 64;
  const rgba = new Uint8Array(W * H * 4);
  const sevScale = 0.55 + severityIdx * 0.34; // Low=0.55, Med=0.89, High=1.23, Crit=1.57
  const horizonY = Math.floor(H * (0.26 + rng() * 0.24));
  const noiseLevel = 7 + rng() * 9;

  if (catIdx === 0) {
    // -------------------------------------------------------------------------
    // 0: Potholes — asphalt gray road, cracked rim, dark central crater
    // -------------------------------------------------------------------------
    const mode = rng();
    const baseGray = mode < 0.7 ? 74 + rng() * 48 : 96 + rng() * 42;
    const warmTint = mode > 0.7 ? 12 : 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (mode > 0.82 && y < 14) {
          const s = 170 + rng() * 42;
          setPixel(rgba, W, H, x, y, s, s + 4, s + 8);
        } else {
          const tex = (rng() - 0.5) * 22;
          setPixel(rgba, W, H, x, y, baseGray + warmTint + tex, baseGray + tex, baseGray - 2 + tex);
        }
      }
    }

    const cx = 24 + rng() * 16;
    const cy = 36 + rng() * 12;
    const rx = (6.5 + rng() * 4.5) * sevScale;
    const ry = (4.0 + rng() * 3.2) * sevScale;
    for (let c = 0; c < 2 + severityIdx * 3; c++) {
      const ang = rng() * Math.PI * 2;
      drawThickLine(
        rgba,
        W,
        H,
        cx,
        cy,
        cx + Math.cos(ang) * (rx + 5 + severityIdx * 4 + rng() * 5),
        cy + Math.sin(ang) * (ry + 4 + severityIdx * 3 + rng() * 4),
        0.4 + severityIdx * 0.15,
        32,
        32,
        34
      );
    }
    drawFilledEllipse(rgba, W, H, cx, cy, rx + 2.5, ry + 2, baseGray + 28, baseGray + 26, baseGray + 22, rng, 18);
    const innerR = Math.max(12, 42 - severityIdx * 8 + rng() * 14);
    const hasMudWater = mode > 0.65;
    drawFilledEllipse(
      rgba,
      W,
      H,
      cx,
      cy,
      rx,
      ry,
      hasMudWater ? innerR + 10 : innerR,
      hasMudWater ? innerR + 14 : innerR,
      hasMudWater ? innerR + 22 : innerR + 2,
      rng,
      14
    );
  } else if (catIdx === 1) {
    // -------------------------------------------------------------------------
    // 1: Garbage accumulation — colorful cluttered debris, warm/mixed bags & bins
    // -------------------------------------------------------------------------
    const skyGray = 155 + rng() * 65;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (y < horizonY) {
          const n = (rng() - 0.5) * 12;
          setPixel(rgba, W, H, x, y, skyGray + n, skyGray + n, skyGray + 6 + n);
        } else {
          const road = 82 + rng() * 32;
          setPixel(rgba, W, H, x, y, road + 8, road + 4, road);
        }
      }
    }

    const numPieces = Math.floor((8 + rng() * 8) * sevScale);
    const palette: Array<[number, number, number]> = [
      [215, 58, 45],
      [235, 195, 48],
      [55, 165, 82],
      [230, 130, 42],
      [232, 228, 215],
      [140, 96, 60],
      [42, 118, 205],
      [180, 70, 155],
    ];
    const pileCx = 20 + rng() * 24;
    const pileCy = Math.max(horizonY + 10, 38 + rng() * 12);
    for (let p = 0; p < numPieces; p++) {
      const col = palette[Math.floor(rng() * palette.length)];
      const px = pileCx + (rng() - 0.5) * 24 * sevScale;
      const py = pileCy + (rng() - 0.5) * 14 * sevScale;
      drawFilledEllipse(
        rgba,
        W,
        H,
        px,
        py,
        2 + rng() * 3.5 * sevScale,
        1.8 + rng() * 2.8 * sevScale,
        col[0],
        col[1],
        col[2],
        rng,
        28
      );
    }
  } else if (catIdx === 2) {
    // -------------------------------------------------------------------------
    // 2: Water leakage — wet road / cyan-blue puddle / flooded street / pipe spray
    // -------------------------------------------------------------------------
    const mode = rng();
    const skyLight = 148 + rng() * 52;
    const waterHorizonY = Math.floor(H * (0.18 + rng() * 0.24));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (y < waterHorizonY) {
          const wall = mode < 0.45 ? 95 + rng() * 42 : skyLight;
          setPixel(rgba, W, H, x, y, wall, wall + 2, wall + 6);
        } else if (mode > 0.72) {
          // Waterlogged flooded road across most of the lower frame
          setPixel(rgba, W, H, x, y, 48 + rng() * 26, 118 + rng() * 35, 165 + rng() * 40);
        } else {
          const road = 58 + rng() * 26;
          setPixel(rgba, W, H, x, y, road, road + 4, road + 12);
        }
      }
    }

    const pCx = 20 + rng() * 24;
    const pCy = Math.max(waterHorizonY + 10, 40 + rng() * 12);
    const puddleRx = (12 + rng() * 7) * sevScale;
    const puddleRy = (5.5 + rng() * 4) * sevScale;

    const waterR = mode < 0.65 ? 36 + rng() * 40 : 98 + rng() * 42;
    const waterG = mode < 0.65 ? 128 + rng() * 50 : 148 + rng() * 42;
    const waterB = mode < 0.65 ? 182 + rng() * 55 : 188 + rng() * 48;
    drawFilledEllipse(rgba, W, H, pCx, pCy, puddleRx, puddleRy, waterR, waterG, waterB, rng, 14);

    if (mode > 0.15) {
      for (let s = 0; s < 2 + severityIdx * 4; s++) {
        const sx = pCx + (rng() - 0.5) * puddleRx * 1.25;
        const sy = pCy + (rng() - 0.5) * puddleRy * 1.1;
        drawThickLine(rgba, W, H, sx - 4, sy, sx + 4, sy, 0.7, 218, 236, 248);
      }
    }

    if (mode > 0.35 || severityIdx >= 2) {
      const pipeX = rng() < 0.5 ? 6 + rng() * 12 : 46 + rng() * 12;
      const pipeY = Math.max(waterHorizonY, 22 + rng() * 8);
      drawThickLine(rgba, W, H, pipeX, pipeY, pCx, pCy, 1.0 + severityIdx * 0.35, 185, 225, 245);
    }
  } else {
    // -------------------------------------------------------------------------
    // 3: Broken streetlights — 4 realistic modes:
    //   0.00..0.45: Daytime bright overcast/white sky + dark pole/arms + dangling lamp
    //   0.45..0.70: Daytime pale bright blue sky + tilted/broken lamp head & hanging wires
    //   0.70..0.90: Night/dusk dark scene + pole + dead or flickering upper bulb
    //   0.90..1.00: Close-up broken lamp housing with exposed dangling wires
    // -------------------------------------------------------------------------
    const mode = rng();
    if (mode < 0.7) {
      const isBlueSky = mode >= 0.45;
      const baseR = isBlueSky ? 182 + rng() * 35 : 208 + rng() * 38;
      const baseG = isBlueSky ? 206 + rng() * 32 : 212 + rng() * 36;
      const baseB = isBlueSky ? 232 + rng() * 20 : 218 + rng() * 34;

      for (let y = 0; y < H; y++) {
        const grad = (1 - y / H) * 14;
        for (let x = 0; x < W; x++) {
          const cloud = Math.sin(x * 0.15 + y * 0.08) * 6 + (rng() - 0.5) * 6;
          setPixel(rgba, W, H, x, y, baseR + grad + cloud, baseG + grad + cloud, baseB + grad + cloud);
        }
      }

      const poleShade = 22 + rng() * 30;
      const baseX = 24 + rng() * 16;
      const forkY = 28 + rng() * 14;
      drawThickLine(rgba, W, H, baseX, H - 1, baseX + (rng() - 0.5) * 6, forkY, 1.2 + severityIdx * 0.1, poleShade, poleShade + 2, poleShade + 5);
      const armTopY = 6 + rng() * 10;
      const rightTipX = Math.min(W - 8, baseX + 14 + rng() * 14);
      const leftTipX = Math.max(8, baseX - 14 - rng() * 14);
      drawThickLine(rgba, W, H, baseX, forkY, rightTipX, armTopY, 1.1, poleShade, poleShade + 2, poleShade + 5);
      if (rng() > 0.3) {
        drawThickLine(rgba, W, H, baseX, forkY, leftTipX, armTopY + 3, 1.1, poleShade, poleShade + 2, poleShade + 5);
      }

      const dangleX = rightTipX - 1 + (rng() - 0.5) * 4;
      const dangleY = armTopY + 5 + severityIdx * 4.5 + rng() * 5;
      drawThickLine(rgba, W, H, rightTipX, armTopY, dangleX, dangleY, 0.7, 25, 25, 28);
      drawFilledEllipse(rgba, W, H, dangleX, dangleY + 4, 3.2 + severityIdx * 0.4, 5.0 + severityIdx * 0.5, 110, 102, 74, rng, 15);
      for (let w = 0; w < 1 + severityIdx; w++) {
        drawThickLine(rgba, W, H, leftTipX + 2 + w * 2, armTopY + 4, leftTipX + 2 + w * 2, armTopY + 9 + severityIdx * 2, 0.5, 28, 28, 30);
      }
    } else if (mode < 0.9) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const nightBase = y < 34 ? 14 + (3 - severityIdx) * 4 + rng() * 14 : 20 + rng() * 20;
          setPixel(rgba, W, H, x, y, nightBase, nightBase + 2, nightBase + 10);
        }
      }
      const poleX = 24 + rng() * 16;
      drawThickLine(rgba, W, H, poleX, H - 1, poleX, 12, 1.4, 48, 50, 56);
      drawThickLine(rgba, W, H, poleX, 14, poleX + 12, 12, 1.1, 48, 50, 56);
      if (severityIdx < 2) {
        drawFilledEllipse(rgba, W, H, poleX + 12, 14, 5, 4, 245, 198, 92, rng, 18);
      } else {
        drawFilledEllipse(rgba, W, H, poleX + 12, 14, 4, 3, 52, 54, 60, rng, 8);
      }
    } else {
      const bg = 185 + rng() * 45;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          setPixel(rgba, W, H, x, y, bg, bg + 3, bg + 6);
        }
      }
      drawThickLine(rgba, W, H, 6, 48, 32, 24, 2.2, 42, 44, 48);
      drawFilledEllipse(rgba, W, H, 38, 24, 11, 6, 86, 88, 92, rng, 14);
      for (let w = 0; w < 1 + severityIdx; w++) {
        drawThickLine(rgba, W, H, 34 + w * 3, 30, 33 + w * 4, 40 + severityIdx * 3, 0.7, 22, 22, 24);
      }
    }
  }

  // Subtle camera sensor noise across final image
  for (let i = 0; i < rgba.length; i += 4) {
    const n = gaussianNoise(rng, noiseLevel * 0.35);
    rgba[i] = clampByte(rgba[i] + n);
    rgba[i + 1] = clampByte(rgba[i + 1] + n);
    rgba[i + 2] = clampByte(rgba[i + 2] + n);
  }

  return { width: W, height: H, rgba };
}

// =============================================================================
// Objective 1: Multi-Layer Perceptron Classifier (30 Spatial CV Features -> 4 Classes)
// Trained with Adam + L2 + Cosine LR decay + Temperature Calibration
// =============================================================================
export interface TrainedMlpModel {
  inputDim: number;
  hiddenDim: number;
  numClasses: number;
  temperature: number;
  labels: string[];
  mean: number[];
  std: number[];
  W1: number[][];
  b1: number[];
  W2: number[][];
  b2: number[];
}

interface ClassificationSample {
  features: number[];
  categoryIdx: number;
  severityIdx: number;
}

function generateVisualDataset(samplesPerClass = 500): ClassificationSample[] {
  const rng = createRng(20261117);
  const data: ClassificationSample[] = [];

  for (let catIdx = 0; catIdx < CATEGORIES.length; catIdx++) {
    for (let s = 0; s < samplesPerClass; s++) {
      const sevRoll = rng();
      const severityIdx = sevRoll < 0.2 ? 0 : sevRoll < 0.55 ? 1 : sevRoll < 0.85 ? 2 : 3;
      const raster = renderCivicSampleImage(catIdx, severityIdx, rng);
      const features = extractVisualFeatureVector(raster);
      data.push({ features, categoryIdx: catIdx, severityIdx });
    }
  }

  // Deterministic Fisher-Yates shuffle
  for (let i = data.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [data[i], data[j]] = [data[j], data[i]];
  }
  return data;
}

function softmax(logits: number[], temperature = 1.0): number[] {
  const scaled = logits.map((v) => v / Math.max(0.5, temperature));
  const maxL = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - maxL));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function trainMlpClassifier(
  trainX: number[][],
  trainY: number[],
  valX: number[][],
  valY: number[],
  labels: string[],
  hiddenDim = 48,
  epochs = 110,
  lr = 0.015,
  l2 = 0.002,
  temperature = 1.35,
  seed = 42
): {
  model: TrainedMlpModel;
  history: { epochs: number[]; train_loss: number[]; val_loss: number[]; val_accuracy: number[] };
} {
  const rng = createRng(seed);
  const nTrain = trainX.length;
  const inputDim = trainX[0].length;
  const numClasses = labels.length;

  // Fit standardization purely on training split (zero data leakage)
  const mean = new Array<number>(inputDim).fill(0);
  const std = new Array<number>(inputDim).fill(0);
  for (let i = 0; i < nTrain; i++) {
    for (let j = 0; j < inputDim; j++) mean[j] += trainX[i][j];
  }
  for (let j = 0; j < inputDim; j++) mean[j] /= nTrain;
  for (let i = 0; i < nTrain; i++) {
    for (let j = 0; j < inputDim; j++) std[j] += (trainX[i][j] - mean[j]) ** 2;
  }
  for (let j = 0; j < inputDim; j++) std[j] = Math.sqrt(std[j] / nTrain) || 1;

  const scale = (x: number[]) => x.map((v, j) => (v - mean[j]) / std[j]);
  const sTrainX = trainX.map(scale);
  const sValX = valX.map(scale);

  // He / Xavier init
  const W1 = Array.from({ length: hiddenDim }, () =>
    Array.from({ length: inputDim }, () => (rng() * 2 - 1) * Math.sqrt(2 / inputDim))
  );
  const b1 = new Array<number>(hiddenDim).fill(0);
  const W2 = Array.from({ length: numClasses }, () =>
    Array.from({ length: hiddenDim }, () => (rng() * 2 - 1) * Math.sqrt(2 / (hiddenDim + numClasses)))
  );
  const b2 = new Array<number>(numClasses).fill(0);

  // Adam state
  const mW1 = Array.from({ length: hiddenDim }, () => new Array<number>(inputDim).fill(0));
  const vW1 = Array.from({ length: hiddenDim }, () => new Array<number>(inputDim).fill(0));
  const mb1 = new Array<number>(hiddenDim).fill(0);
  const vb1 = new Array<number>(hiddenDim).fill(0);
  const mW2 = Array.from({ length: numClasses }, () => new Array<number>(hiddenDim).fill(0));
  const vW2 = Array.from({ length: numClasses }, () => new Array<number>(hiddenDim).fill(0));
  const mb2 = new Array<number>(numClasses).fill(0);
  const vb2 = new Array<number>(numClasses).fill(0);

  const evalSplit = (X: number[][], Y: number[]) => {
    let loss = 0;
    let correct = 0;
    for (let i = 0; i < X.length; i++) {
      const h = new Array<number>(hiddenDim);
      for (let k = 0; k < hiddenDim; k++) {
        let z = b1[k];
        for (let j = 0; j < inputDim; j++) z += W1[k][j] * X[i][j];
        h[k] = z > 0 ? z : 0.05 * z; // LeakyReLU
      }
      const logits = new Array<number>(numClasses);
      for (let c = 0; c < numClasses; c++) {
        let z = b2[c];
        for (let k = 0; k < hiddenDim; k++) z += W2[c][k] * h[k];
        logits[c] = z;
      }
      const probs = softmax(logits, 1.0);
      loss -= Math.log(Math.max(1e-9, probs[Y[i]]));
      let bestC = 0;
      for (let c = 1; c < numClasses; c++) if (probs[c] > probs[bestC]) bestC = c;
      if (bestC === Y[i]) correct += 1;
    }
    return { loss: loss / X.length, acc: correct / X.length };
  };

  const history = {
    epochs: [] as number[],
    train_loss: [] as number[],
    val_loss: [] as number[],
    val_accuracy: [] as number[],
  };

  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  let bestValLoss = Infinity;
  let bestWeights = {
    W1: W1.map((r) => r.slice()),
    b1: b1.slice(),
    W2: W2.map((r) => r.slice()),
    b2: b2.slice(),
  };

  for (let ep = 1; ep <= epochs; ep++) {
    const dW1 = Array.from({ length: hiddenDim }, () => new Array<number>(inputDim).fill(0));
    const db1 = new Array<number>(hiddenDim).fill(0);
    const dW2 = Array.from({ length: numClasses }, () => new Array<number>(hiddenDim).fill(0));
    const db2 = new Array<number>(numClasses).fill(0);
    let trLoss = 0;

    for (let i = 0; i < nTrain; i++) {
      const x = sTrainX[i];
      const y = trainY[i];

      const z1 = new Array<number>(hiddenDim);
      const h = new Array<number>(hiddenDim);
      for (let k = 0; k < hiddenDim; k++) {
        let z = b1[k];
        for (let j = 0; j < inputDim; j++) z += W1[k][j] * x[j];
        z1[k] = z;
        h[k] = z > 0 ? z : 0.05 * z;
      }

      const logits = new Array<number>(numClasses);
      for (let c = 0; c < numClasses; c++) {
        let z = b2[c];
        for (let k = 0; k < hiddenDim; k++) z += W2[c][k] * h[k];
        logits[c] = z;
      }
      const probs = softmax(logits, 1.0);
      trLoss -= Math.log(Math.max(1e-9, probs[y]));

      const dLogits = probs.slice();
      dLogits[y] -= 1;

      const dh = new Array<number>(hiddenDim).fill(0);
      for (let c = 0; c < numClasses; c++) {
        db2[c] += dLogits[c];
        for (let k = 0; k < hiddenDim; k++) {
          dW2[c][k] += dLogits[c] * h[k];
          dh[k] += dLogits[c] * W2[c][k];
        }
      }

      for (let k = 0; k < hiddenDim; k++) {
        const dz = dh[k] * (z1[k] > 0 ? 1 : 0.05);
        db1[k] += dz;
        for (let j = 0; j < inputDim; j++) {
          dW1[k][j] += dz * x[j];
        }
      }
    }

    const invN = 1 / nTrain;
    const stepLr = lr * (0.2 + 0.8 * 0.5 * (1 + Math.cos((Math.PI * ep) / epochs)));
    const b1Corr = 1 - beta1 ** ep;
    const b2Corr = 1 - beta2 ** ep;

    for (let c = 0; c < numClasses; c++) {
      const gb = db2[c] * invN;
      mb2[c] = beta1 * mb2[c] + (1 - beta1) * gb;
      vb2[c] = beta2 * vb2[c] + (1 - beta2) * gb * gb;
      b2[c] -= (stepLr * (mb2[c] / b1Corr)) / (Math.sqrt(vb2[c] / b2Corr) + eps);

      for (let k = 0; k < hiddenDim; k++) {
        const gw = dW2[c][k] * invN + l2 * W2[c][k];
        mW2[c][k] = beta1 * mW2[c][k] + (1 - beta1) * gw;
        vW2[c][k] = beta2 * vW2[c][k] + (1 - beta2) * gw * gw;
        W2[c][k] -= (stepLr * (mW2[c][k] / b1Corr)) / (Math.sqrt(vW2[c][k] / b2Corr) + eps);
      }
    }

    for (let k = 0; k < hiddenDim; k++) {
      const gb = db1[k] * invN;
      mb1[k] = beta1 * mb1[k] + (1 - beta1) * gb;
      vb1[k] = beta2 * vb1[k] + (1 - beta2) * gb * gb;
      b1[k] -= (stepLr * (mb1[k] / b1Corr)) / (Math.sqrt(vb1[k] / b2Corr) + eps);

      for (let j = 0; j < inputDim; j++) {
        const gw = dW1[k][j] * invN + l2 * W1[k][j];
        mW1[k][j] = beta1 * mW1[k][j] + (1 - beta1) * gw;
        vW1[k][j] = beta2 * vW1[k][j] + (1 - beta2) * gw * gw;
        W1[k][j] -= (stepLr * (mW1[k][j] / b1Corr)) / (Math.sqrt(vW1[k][j] / b2Corr) + eps);
      }
    }

    const valEval = evalSplit(sValX, valY);
    if (valEval.loss < bestValLoss) {
      bestValLoss = valEval.loss;
      bestWeights = {
        W1: W1.map((r) => r.slice()),
        b1: b1.slice(),
        W2: W2.map((r) => r.slice()),
        b2: b2.slice(),
      };
    }

    if (ep === 1 || ep % 15 === 0 || ep === epochs) {
      history.epochs.push(ep);
      history.train_loss.push(Math.round(trLoss * invN * 10000) / 10000);
      history.val_loss.push(Math.round(valEval.loss * 10000) / 10000);
      history.val_accuracy.push(Math.round(valEval.acc * 10000) / 10000);
    }
  }

  return {
    model: {
      inputDim,
      hiddenDim,
      numClasses,
      temperature,
      labels,
      mean,
      std,
      W1: bestWeights.W1,
      b1: bestWeights.b1,
      W2: bestWeights.W2,
      b2: bestWeights.b2,
    },
    history,
  };
}

export function predictMlp(
  model: TrainedMlpModel,
  rawFeatures: number[]
): {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
} {
  const x = rawFeatures.map((v, j) => (v - model.mean[j]) / (model.std[j] || 1));
  const h = new Array<number>(model.hiddenDim);
  for (let k = 0; k < model.hiddenDim; k++) {
    let z = model.b1[k];
    for (let j = 0; j < model.inputDim; j++) z += model.W1[k][j] * x[j];
    h[k] = z > 0 ? z : 0.05 * z;
  }
  const logits = new Array<number>(model.numClasses);
  for (let c = 0; c < model.numClasses; c++) {
    let z = model.b2[c];
    for (let k = 0; k < model.hiddenDim; k++) z += model.W2[c][k] * h[k];
    logits[c] = z;
  }
  const probs = softmax(logits, model.temperature ?? 1.25);
  let best = 0;
  for (let c = 1; c < model.numClasses; c++) if (probs[c] > probs[best]) best = c;
  const probabilities: Record<string, number> = {};
  model.labels.forEach((lbl, idx) => {
    probabilities[lbl] = Math.round(probs[idx] * 10000) / 10000;
  });
  return {
    label: model.labels[best],
    confidence: Math.round(probs[best] * 10000) / 10000,
    probabilities,
  };
}

function evaluateMulticlass(yTrue: number[], yPred: number[], labels: string[]) {
  const n = labels.length;
  const cm = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let correct = 0;
  for (let i = 0; i < yTrue.length; i++) {
    cm[yTrue[i]][yPred[i]] += 1;
    if (yTrue[i] === yPred[i]) correct += 1;
  }

  const perClass: Record<string, { precision: number; recall: number; f1: number; support: number }> = {};
  let sumP = 0;
  let sumR = 0;
  let sumF1 = 0;

  for (let c = 0; c < n; c++) {
    const tp = cm[c][c];
    let fp = 0;
    let fn = 0;
    for (let k = 0; k < n; k++) {
      if (k !== c) {
        fp += cm[k][c];
        fn += cm[c][k];
      }
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const support = tp + fn;
    perClass[labels[c]] = {
      precision: Math.round(precision * 10000) / 10000,
      recall: Math.round(recall * 10000) / 10000,
      f1: Math.round(f1 * 10000) / 10000,
      support,
    };
    sumP += precision;
    sumR += recall;
    sumF1 += f1;
  }

  return {
    accuracy: Math.round((correct / yTrue.length) * 10000) / 10000,
    macro_precision: Math.round((sumP / n) * 10000) / 10000,
    macro_recall: Math.round((sumR / n) * 10000) / 10000,
    macro_f1: Math.round((sumF1 / n) * 10000) / 10000,
    per_class: perClass,
    confusion_matrix: cm,
  };
}

// =============================================================================
// Objective 3: Random Forest Regression Ensemble (0-100 Priority Scoring)
// =============================================================================
export const PRIORITY_FEATURE_NAMES = [
  'severity_level',
  'category_risk_weight',
  'unique_supports',
  'age_hours',
  'duplicate_cluster_size',
  'ward_avg_resolution_hours',
] as const;

export interface TreeNode {
  featureIdx?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  value?: number;
}

export interface PriorityForestModel {
  trees: TreeNode[];
  featureNames: string[];
  version: string;
  trainedAt: string;
}

function buildRegressionTree(
  X: number[][],
  y: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minSamplesLeaf: number,
  rng: () => number
): TreeNode {
  const n = indices.length;
  const meanY = indices.reduce((acc, idx) => acc + y[idx], 0) / Math.max(1, n);
  if (depth >= maxDepth || n <= minSamplesLeaf * 2) {
    return { value: meanY };
  }

  const numFeatures = X[0].length;
  const candFeatures = Array.from({ length: numFeatures }, (_, i) => i)
    .sort(() => rng() - 0.5)
    .slice(0, 4);

  let bestFeature = -1;
  let bestThreshold = 0;
  let bestSse = Infinity;
  let bestLeft: number[] = [];
  let bestRight: number[] = [];

  for (const f of candFeatures) {
    const vals = Array.from(new Set(indices.map((i) => X[i][f]))).sort((a, b) => a - b);
    if (vals.length < 2) continue;
    const step = Math.max(1, Math.floor(vals.length / 10));
    for (let vIdx = 0; vIdx < vals.length - 1; vIdx += step) {
      const thresh = (vals[vIdx] + vals[vIdx + 1]) / 2;
      const left: number[] = [];
      const right: number[] = [];
      for (const idx of indices) {
        if (X[idx][f] <= thresh) left.push(idx);
        else right.push(idx);
      }
      if (left.length < minSamplesLeaf || right.length < minSamplesLeaf) continue;

      const lMean = left.reduce((a, i) => a + y[i], 0) / left.length;
      const rMean = right.reduce((a, i) => a + y[i], 0) / right.length;
      let sse = 0;
      for (const i of left) sse += (y[i] - lMean) ** 2;
      for (const i of right) sse += (y[i] - rMean) ** 2;

      if (sse < bestSse) {
        bestSse = sse;
        bestFeature = f;
        bestThreshold = thresh;
        bestLeft = left;
        bestRight = right;
      }
    }
  }

  if (bestFeature === -1) {
    return { value: meanY };
  }

  return {
    featureIdx: bestFeature,
    threshold: bestThreshold,
    left: buildRegressionTree(X, y, bestLeft, depth + 1, maxDepth, minSamplesLeaf, rng),
    right: buildRegressionTree(X, y, bestRight, depth + 1, maxDepth, minSamplesLeaf, rng),
  };
}

function predictTree(node: TreeNode, x: number[]): number {
  if (node.value !== undefined) return node.value;
  if (node.featureIdx === undefined || node.threshold === undefined) return 50;
  return x[node.featureIdx] <= node.threshold
    ? predictTree(node.left!, x)
    : predictTree(node.right!, x);
}

export function predictPriorityForest(model: PriorityForestModel, x: number[]): number {
  let sum = 0;
  for (const tree of model.trees) sum += predictTree(tree, x);
  return Math.max(0, Math.min(100, Math.round(sum / model.trees.length)));
}

function generatePriorityDataset(rows = 720) {
  const rng = createRng(90210);
  const X: number[][] = [];
  const y: number[] = [];

  for (let i = 0; i < rows; i++) {
    const sevLevel = 1 + Math.floor(rng() * 4);
    const catRisk = 1 + Math.floor(rng() * 4);
    const supports = Math.min(25, Math.floor(rng() ** 1.4 * 26));
    const ageHours = Math.round(rng() * 120 * 10) / 10;
    const dupes = Math.floor(rng() ** 2 * 8);
    const wardResHours = Math.round((10 + rng() * 42) * 10) / 10;

    const sevScore = [0, 18, 38, 63, 82][sevLevel];
    const catBonus = [0, 4, 7, 8, 11][catRisk];
    const socialAmplifier = Math.min(10, Math.sqrt(supports) * 2.1 + dupes * 1.4);
    const slaDecay = Math.min(9, (ageHours / Math.max(12, wardResHours)) * 4.5);
    const interaction = sevLevel >= 3 && catRisk === 4 ? 4 : 0;
    const target = Math.max(
      5,
      Math.min(100, Math.round(sevScore + catBonus + socialAmplifier + slaDecay + interaction + gaussianNoise(rng, 2.2)))
    );

    X.push([sevLevel, catRisk, supports, ageHours, dupes, wardResHours]);
    y.push(target);
  }
  return { X, y };
}

function scoreToTierIdx(score: number): number {
  if (score >= 80) return 3;
  if (score >= 60) return 2;
  if (score >= 35) return 1;
  return 0;
}

function trainAndEvaluateAll() {
  const modelsDir = path.resolve(process.cwd(), 'ai-services', 'models');
  fs.mkdirSync(modelsDir, { recursive: true });
  const trainedAt = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // 1. Train & Evaluate Objective 1 (Category + Severity MLP on 2,000 Real Rasters)
  // ---------------------------------------------------------------------------
  const dataset = generateVisualDataset(500); // 2,000 rendered 64x64 civic images
  const nTotal = dataset.length;
  const nTrain = Math.floor(nTotal * 0.7);
  const nVal = Math.floor(nTotal * 0.15);

  const trainSplit = dataset.slice(0, nTrain);
  const valSplit = dataset.slice(nTrain, nTrain + nVal);
  const testSplit = dataset.slice(nTrain + nVal);

  const catTrain = trainMlpClassifier(
    trainSplit.map((s) => s.features),
    trainSplit.map((s) => s.categoryIdx),
    valSplit.map((s) => s.features),
    valSplit.map((s) => s.categoryIdx),
    [...CATEGORIES],
    48,
    120,
    0.015,
    0.002,
    1.35,
    42
  );

  const sevTrain = trainMlpClassifier(
    trainSplit.map((s) => s.features),
    trainSplit.map((s) => s.severityIdx),
    valSplit.map((s) => s.features),
    valSplit.map((s) => s.severityIdx),
    [...SEVERITIES],
    48,
    130,
    0.014,
    0.0025,
    1.25,
    99
  );

  const catTestPreds = testSplit.map((s) => {
    const pred = predictMlp(catTrain.model, s.features);
    return CATEGORIES.indexOf(pred.label as (typeof CATEGORIES)[number]);
  });
  const catEval = evaluateMulticlass(
    testSplit.map((s) => s.categoryIdx),
    catTestPreds,
    [...CATEGORIES]
  );

  const sevTestPreds = testSplit.map((s) => {
    const pred = predictMlp(sevTrain.model, s.features);
    return SEVERITIES.indexOf(pred.label as (typeof SEVERITIES)[number]);
  });
  const sevEval = evaluateMulticlass(
    testSplit.map((s) => s.severityIdx),
    sevTestPreds,
    [...SEVERITIES]
  );

  const clsModelArtifact = {
    version: 'v2.0.0-cv30-mlp48',
    trained_at: trainedAt,
    architecture:
      '64x64 Bilinear Spatial CV Extractor (30 Sky/Ground/Edge/Silhouette Features) + 48-Unit LeakyReLU Adam MLP (Temp-Calibrated)',
    feature_names: [...FEATURE_NAMES],
    category_model: catTrain.model,
    severity_model: sevTrain.model,
  };

  const clsEvalArtifact = {
    lifecycle_state: 'deployed_active',
    model_version: 'v2.0.0-cv30-mlp48',
    trained_at: trainedAt,
    dataset_summary: {
      total_samples: nTotal,
      train_samples: trainSplit.length,
      val_samples: valSplit.length,
      test_samples: testSplit.length,
      split: '70% / 15% / 15%',
    },
    class_labels: [...CATEGORIES],
    metrics: {
      test_accuracy: catEval.accuracy,
      macro_precision: catEval.macro_precision,
      macro_recall: catEval.macro_recall,
      macro_f1: catEval.macro_f1,
      per_class: catEval.per_class,
      severity_test_accuracy: sevEval.accuracy,
      severity_macro_f1: sevEval.macro_f1,
    },
    confusion_matrix: catEval.confusion_matrix,
    history: catTrain.history,
  };

  fs.writeFileSync(
    path.join(modelsDir, 'classification_node_model.json'),
    JSON.stringify(clsModelArtifact, null, 2)
  );
  fs.writeFileSync(
    path.join(modelsDir, 'classification_eval.json'),
    JSON.stringify(clsEvalArtifact, null, 2)
  );

  // ---------------------------------------------------------------------------
  // 2. Train & Evaluate Objective 3 (Priority Scoring Random Forest)
  // ---------------------------------------------------------------------------
  const pData = generatePriorityDataset(720);
  const pTrainN = Math.floor(pData.X.length * 0.75);
  const pTrainX = pData.X.slice(0, pTrainN);
  const pTrainY = pData.y.slice(0, pTrainN);
  const pTestX = pData.X.slice(pTrainN);
  const pTestY = pData.y.slice(pTrainN);

  const rngForest = createRng(777);
  const trees: TreeNode[] = [];
  for (let t = 0; t < 28; t++) {
    const bagIndices = Array.from({ length: pTrainX.length }, () =>
      Math.floor(rngForest() * pTrainX.length)
    );
    trees.push(buildRegressionTree(pTrainX, pTrainY, bagIndices, 0, 7, 4, rngForest));
  }

  const forestModel: PriorityForestModel = {
    trees,
    featureNames: [...PRIORITY_FEATURE_NAMES],
    version: 'v1.2.0-rf28',
    trainedAt,
  };

  let sumAbsErr = 0;
  let sumSqErr = 0;
  const meanTestY = pTestY.reduce((a, b) => a + b, 0) / pTestY.length;
  let ssTot = 0;
  const pPreds = pTestX.map((row) => predictPriorityForest(forestModel, row));
  for (let i = 0; i < pTestY.length; i++) {
    const err = pPreds[i] - pTestY[i];
    sumAbsErr += Math.abs(err);
    sumSqErr += err * err;
    ssTot += (pTestY[i] - meanTestY) ** 2;
  }
  const mae = Math.round((sumAbsErr / pTestY.length) * 1000) / 1000;
  const rmse = Math.round(Math.sqrt(sumSqErr / pTestY.length) * 1000) / 1000;
  const r2 = Math.round((1 - sumSqErr / Math.max(1e-6, ssTot)) * 10000) / 10000;

  const tierEval = evaluateMulticlass(
    pTestY.map(scoreToTierIdx),
    pPreds.map(scoreToTierIdx),
    [...SEVERITIES]
  );

  const baselineMse = sumSqErr / pTestY.length;
  const rawImportances: number[] = [];
  const permRng = createRng(1337);
  for (let f = 0; f < PRIORITY_FEATURE_NAMES.length; f++) {
    const permX = pTestX.map((row) => row.slice());
    for (let i = permX.length - 1; i > 0; i--) {
      const j = Math.floor(permRng() * (i + 1));
      const tmp = permX[i][f];
      permX[i][f] = permX[j][f];
      permX[j][f] = tmp;
    }
    let permSq = 0;
    for (let i = 0; i < permX.length; i++) {
      const pred = predictPriorityForest(forestModel, permX[i]);
      permSq += (pred - pTestY[i]) ** 2;
    }
    rawImportances.push(Math.max(0, permSq / permX.length - baselineMse));
  }
  const totalImp = rawImportances.reduce((a, b) => a + b, 0) || 1;
  const featureImportance = PRIORITY_FEATURE_NAMES.map((name, idx) => ({
    feature: name,
    importance: Math.round((rawImportances[idx] / totalImp) * 10000) / 10000,
  })).sort((a, b) => b.importance - a.importance);

  const prioEvalArtifact = {
    lifecycle_state: 'deployed_active',
    model_version: 'v1.2.0-rf28',
    trained_at: trainedAt,
    dataset_summary: {
      total_rows: pData.X.length,
      train_rows: pTrainX.length,
      test_rows: pTestX.length,
      split: '75% / 25%',
    },
    metrics: {
      test_mae: mae,
      test_rmse: rmse,
      test_r2: r2,
      tier_accuracy: tierEval.accuracy,
      tier_macro_f1: tierEval.macro_f1,
    },
    feature_importance: featureImportance,
    confusion_matrix: tierEval.confusion_matrix,
  };

  fs.writeFileSync(
    path.join(modelsDir, 'priority_node_model.json'),
    JSON.stringify(forestModel, null, 2)
  );
  fs.writeFileSync(
    path.join(modelsDir, 'priority_eval.json'),
    JSON.stringify(prioEvalArtifact, null, 2)
  );

  console.log('NAGRIK ML Training Complete:');
  console.log(
    `  Objective 1 Category MLP (2,000 rendered rasters, 30 CV features): Test Acc=${catEval.accuracy}, Macro F1=${catEval.macro_f1} (n=${nTotal})`
  );
  console.log(
    `  Objective 1 Severity MLP: Test Acc=${sevEval.accuracy}, Macro F1=${sevEval.macro_f1}`
  );
  console.log(
    `  Objective 3 Priority RF-28: MAE=${mae}, R2=${r2}, Tier Acc=${tierEval.accuracy} (n=${pData.X.length})`
  );
}

if (process.argv[1] && process.argv[1].endsWith('trainModels.ts')) {
  trainAndEvaluateAll();
}
