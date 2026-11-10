/**
 * In-memory mock database with localStorage persistence.
 *
 * Seeded wash history and archived rollups are regenerated deterministically
 * from the anchor date rather than persisted; only records created during the
 * session are stored. Photos live in the PhotoVault (IndexedDB).
 */
import { buildSeed, type SeedData } from '@/mock-data';
import type { ISODate, Session, WashRecord } from '@/types';
import { PhotoVault } from './photoVault';

const STATE_KEY = 'carcare.mock.state.v3';
const SESSION_KEY = 'carcare.session.v2';
const LEGACY_KEYS = ['carcare.mock.state.v1', 'carcare.mock.state.v2', 'carcare.mock.photos.v1', 'carcare.session.v1'];

type Tables = Omit<SeedData, 'washRecords' | 'rollups'>;

interface PersistedState {
  version: 3;
  anchor: ISODate;
  tables: Tables;
  extraRecords: WashRecord[];
  seq: number;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): boolean {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export class MockStore {
  anchor!: ISODate;
  data!: SeedData;
  readonly photos: PhotoVault;
  private extraRecords: WashRecord[] = [];
  private seq = 1;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private recordIndex: Map<string, WashRecord> | null = null;
  private vehicleRecordIndex: Map<string, WashRecord[]> | null = null;
  private memorySession: Session | null = null;

  constructor(
    private readonly today: () => ISODate,
    private readonly persistence: boolean = true,
  ) {
    this.photos = new PhotoVault(persistence);
    if (persistence) LEGACY_KEYS.forEach(remove);
    this.load();
    // Write any pending change before a refresh or tab close, so nothing done
    // in the last 50 ms is lost.
    if (persistence && typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => {
        if (this.persistTimer) {
          clearTimeout(this.persistTimer);
          this.persistTimer = null;
          this.flush();
        }
      });
    }
  }

  /* ------------------------------------------------------------ lifecycle */

  private load(): void {
    const saved = this.persistence ? readJSON<PersistedState>(STATE_KEY) : null;
    if (saved && saved.version === 3) {
      const seeded = buildSeed(saved.anchor);
      this.anchor = saved.anchor;
      this.data = { ...saved.tables, washRecords: [...seeded.washRecords, ...saved.extraRecords], rollups: seeded.rollups };
      this.extraRecords = saved.extraRecords;
      this.seq = saved.seq;
    } else {
      this.anchor = this.today();
      this.data = buildSeed(this.anchor);
      this.extraRecords = [];
      this.seq = 1;
      this.flush();
    }
    this.invalidate();
  }

  /** Discards all session changes and re-seeds anchored to today. */
  async reset(): Promise<void> {
    if (this.persistence) {
      remove(STATE_KEY);
      remove(SESSION_KEY);
    }
    this.memorySession = null;
    await this.photos.clear();
    this.load();
  }

  /** Schedules a write of mutable tables. Call after every mutation. */
  commit(): void {
    this.invalidate();
    if (!this.persistence) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.flush(), 50);
  }

  private flush(): void {
    if (!this.persistence) return;
    const { washRecords: _records, rollups: _rollups, ...tables } = this.data;
    void _records;
    void _rollups;
    const state: PersistedState = { version: 3, anchor: this.anchor, tables, extraRecords: this.extraRecords, seq: this.seq };
    writeJSON(STATE_KEY, state);
  }

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_x${this.seq}`;
  }

  /* -------------------------------------------------------------- records */

  private invalidate(): void {
    this.recordIndex = null;
    this.vehicleRecordIndex = null;
  }

  addRecord(record: WashRecord): void {
    this.data.washRecords.push(record);
    this.extraRecords.push(record);
    this.commit();
  }

  recordForJob(jobId: string): WashRecord | null {
    if (!this.recordIndex) this.recordIndex = new Map(this.data.washRecords.map((r) => [r.jobId, r]));
    return this.recordIndex.get(jobId) ?? null;
  }

  recordsForVehicle(vehicleId: string): WashRecord[] {
    if (!this.vehicleRecordIndex) {
      const idx = new Map<string, WashRecord[]>();
      for (const r of this.data.washRecords) {
        const list = idx.get(r.vehicleId);
        if (list) list.push(r);
        else idx.set(r.vehicleId, [r]);
      }
      this.vehicleRecordIndex = idx;
    }
    return this.vehicleRecordIndex.get(vehicleId) ?? [];
  }

  /* -------------------------------------------------------------- session */

  getSession(): Session | null {
    return this.persistence ? readJSON<Session>(SESSION_KEY) : this.memorySession;
  }

  setSession(session: Session | null): void {
    this.memorySession = session;
    if (!this.persistence) return;
    if (session) writeJSON(SESSION_KEY, session);
    else remove(SESSION_KEY);
  }
}
