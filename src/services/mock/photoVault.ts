/**
 * Mock stand-in for private R2 photo storage. Compressed photo blobs live in
 * IndexedDB (far more room than localStorage's ~5 MB), with an in-memory
 * fallback when IndexedDB is unavailable (private mode, tests).
 */
const DB_NAME = 'carcare-mock-photos';
const STORE = 'photos';

export class PhotoVault {
  private memory = new Map<string, Blob>();
  private urls = new Map<string, string>();
  private db: Promise<IDBDatabase | null>;

  constructor(persist: boolean) {
    this.db = persist ? this.open() : Promise.resolve(null);
  }

  private open(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async put(id: string, blob: Blob): Promise<void> {
    this.memory.set(id, blob);
    const db = await this.db;
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save photo'));
    });
  }

  private async getBlob(id: string): Promise<Blob | null> {
    const cached = this.memory.get(id);
    if (cached) return cached;
    const db = await this.db;
    if (!db) return null;
    return new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    });
  }

  /** Object URL for a stored photo, or null when it does not exist. */
  async url(id: string): Promise<string | null> {
    const existing = this.urls.get(id);
    if (existing) return existing;
    const blob = await this.getBlob(id);
    if (!blob) return null;
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : `blob:${id}`;
    this.urls.set(id, url);
    return url;
  }

  async clear(): Promise<void> {
    this.memory.clear();
    for (const u of this.urls.values()) if (u.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(u);
    this.urls.clear();
    const db = await this.db;
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}
