import type { PaymentMethod } from '@/types';

/** Exactly 13 completed washes make up the monthly service milestone. */
export const WASH_TARGET_PER_CYCLE = 13;

/** Minimum retention for after-wash photos. */
export const PHOTO_RETENTION_DAYS = 60;

/** Lifetime of a signed photo URL (view and upload): 15 minutes. */
export const SIGNED_URL_TTL_SECONDS = 900;

/** Largest original image accepted from the camera/file picker. */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

/**
 * Client-side compression budget (capacity plan: 1,500 vehicles on R2's 10 GB
 * free tier with 60-day retention ≈ 150 KB per photo).
 */
export const PHOTO_COMPRESSION = {
  maxDimension: 1280,
  quality: 0.8,
  /** Re-encode at lower quality until under this size. */
  targetBytes: 150 * 1024,
  /** Hard ceiling after compression; the photo gateway rejects anything larger. */
  maxCompressedBytes: 150 * 1024,
  /** Smallest longest-side the compressor will shrink to before giving up. */
  minDimension: 720,
  minQuality: 0.45,
} as const;

/** Invoices are issued on the 1st and fall due this many days later. */
export const INVOICE_DUE_AFTER_DAYS = 9;

/** Methods a resident can choose online. CASH exists for admin overrides only. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['UPI', 'CARD', 'NET_BANKING'];

/** Default and maximum page sizes for list queries. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
