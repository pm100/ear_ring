// Persists fetched piano samples in IndexedDB so a restarted (or offline) desktop
// app doesn't re-fetch them from Salamander every launch (issue #29) — the in-memory
// Map in useAudioPlayback.ts only survives the current session. Every call here is
// best-effort: a failure (private browsing, quota, unsupported) just falls back to
// network-only behavior instead of breaking playback.

const DB_NAME = 'ear-ring-samples';
const STORE_NAME = 'samples';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** Returns the cached sample's raw bytes, or null on a cache miss or any failure. */
export async function getCachedSample(name: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDb();
    return await new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(name);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Sample cache read failed', name, e);
    return null;
  }
}

/** Stores a sample's raw bytes for reuse on the next launch. Swallows failures. */
export async function putCachedSample(name: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(data, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Sample cache write failed', name, e);
  }
}
