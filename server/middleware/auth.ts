import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import fs from 'fs';
import * as OTPAuth from 'otpauth';
import path from 'path';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const cfgPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
  const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as FirebaseAppletConfig;
  return raw;
}

export const firebaseAppletConfig = loadFirebaseConfig();

const adminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: firebaseAppletConfig.projectId });

const adminAuth = getAuth(adminApp);

const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length >= 16
    ? process.env.ADMIN_SESSION_SECRET
    : crypto.createHmac('sha256', firebaseAppletConfig.projectId).update('nagrik-local-totp').digest('hex');

const TOTP_VAULT_PATH = path.join(ROOT_DIR, '.nagrik-totp-vault.json');

interface TotpEntry {
  uid: string;
  email: string;
  encryptedSecret: string;
  enrolled: boolean;
  updatedAt: string;
}

function deriveAesKey(): Buffer {
  return crypto.createHash('sha256').update(SESSION_SECRET).digest();
}

function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveAesKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

function decryptSecret(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split('.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveAesKey(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
  return plain.toString('utf-8');
}

function readTotpVault(): Record<string, TotpEntry> {
  try {
    if (!fs.existsSync(TOTP_VAULT_PATH)) return {};
    return JSON.parse(fs.readFileSync(TOTP_VAULT_PATH, 'utf-8')) as Record<string, TotpEntry>;
  } catch {
    return {};
  }
}

function writeTotpVault(vault: Record<string, TotpEntry>): void {
  fs.writeFileSync(TOTP_VAULT_PATH, JSON.stringify(vault, null, 2), 'utf-8');
}

export function getTotpStatus(uid: string): { enrolled: boolean } {
  const vault = readTotpVault();
  const entry = vault[uid];
  return { enrolled: Boolean(entry && entry.enrolled) };
}

export async function createOrGetTotpSetup(
  uid: string,
  email: string
): Promise<{ secretBase32: string; otpauthUri: string; qrDataUrl: string; alreadyEnrolled: boolean }> {
  const vault = readTotpVault();
  let secretBase32: string;
  const existing = vault[uid];

  if (existing) {
    secretBase32 = decryptSecret(existing.encryptedSecret);
  } else {
    const secret = new OTPAuth.Secret({ size: 20 });
    secretBase32 = secret.base32;
    vault[uid] = {
      uid,
      email,
      encryptedSecret: encryptSecret(secretBase32),
      enrolled: false,
      updatedAt: new Date().toISOString(),
    };
    writeTotpVault(vault);
  }

  const totp = new OTPAuth.TOTP({
    issuer: 'Namma Dhwani Admin Portal',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const otpauthUri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });

  return {
    secretBase32,
    otpauthUri,
    qrDataUrl,
    alreadyEnrolled: Boolean(existing?.enrolled),
  };
}

export function verifyTotpCode(
  uid: string,
  code: string
): { valid: boolean; step2Token?: string } {
  const cleanCode = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return { valid: false };
  }
  const vault = readTotpVault();
  const entry = vault[uid];
  if (!entry) return { valid: false };

  const secretBase32 = decryptSecret(entry.encryptedSecret);
  const totp = new OTPAuth.TOTP({
    issuer: 'Namma Dhwani Admin Portal',
    label: entry.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token: cleanCode, window: 1 });
  if (delta === null) {
    return { valid: false };
  }

  if (!entry.enrolled) {
    entry.enrolled = true;
    entry.updatedAt = new Date().toISOString();
    writeTotpVault(vault);
  }

  return {
    valid: true,
    step2Token: signAdminStep2Token(uid, entry.email),
  };
}

export function signAdminStep2Token(uid: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      uid,
      email,
      exp: Date.now() + 8 * 60 * 60 * 1000,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminStep2Token(token: string, expectedUid: string): boolean {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  if (sig.length !== expectedSig.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      uid: string;
      exp: number;
    };
    return parsed.uid === expectedUid && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export interface AuthenticatedRequest extends Request {
  firebaseUser?: DecodedIdToken;
}

export async function verifyFirebaseBearer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    res.status(401).json({ error: 'Authentication required (missing Bearer token).' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    req.firebaseUser = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired Firebase session token.' });
  }
}

export function requireVerifiedEmailOrDemo(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const user = req.firebaseUser;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  const demoMode = process.env.DEMO_MODE === 'true';
  const isDemoExample = Boolean(user.email && /@example\.com$/i.test(user.email));
  if (user.email_verified === true || (demoMode && isDemoExample)) {
    next();
    return;
  }
  res.status(403).json({ error: 'Please verify your email address before performing this action.' });
}

export function requireAdminStep2(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const user = req.firebaseUser;
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const step2Token = String(req.headers['x-admin-step2-token'] || '');
  if (!verifyAdminStep2Token(step2Token, user.uid)) {
    res.status(403).json({ error: '2-step authenticator verification is required.' });
    return;
  }
  next();
}

export function getConfiguredSuperAdminEmails(): string[] {
  const raw = (process.env.SUPER_ADMIN_EMAIL || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/^["']+|["']+$/g, '').trim().toLowerCase())
    .filter((s) => s.length > 0 && s.includes('@') && !s.startsWith('my_'));
}

export function isSuperAdminEnvConfigured(): boolean {
  return getConfiguredSuperAdminEmails().length > 0;
}

export function isConfiguredSuperAdminEmail(email?: string): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return getConfiguredSuperAdminEmails().includes(clean);
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(maxRequests: number, windowMs: number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const key = `${req.path}:${req.firebaseUser?.uid || req.ip || 'anon'}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({
        error: 'Rate limit reached. Please wait a few moments before trying again.',
      });
      return;
    }
    bucket.count += 1;
    next();
  };
}

export function corsAllowlistMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  const allowed = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...envOrigins,
    ...(appUrl ? [appUrl] : []),
  ]);

  if (allowed.has(origin) || origin.endsWith('.run.app') || origin.endsWith('.googleusercontent.com')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Step2-Token');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}
