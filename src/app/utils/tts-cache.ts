/**
 * IndexedDB cache for pre-generated TTS narration audio.
 *
 * DB:    game-tts-cache
 * Store: narrations
 * Key:   `${caseId}-${key}`  (key is 'briefing' | 'act1' | 'act2' | 'act3')
 * Value: { blob: Blob, createdAt: number }
 */

const DB_NAME = 'game-tts-cache';
const STORE_NAME = 'narrations';
const DB_VERSION = 1;

export interface CachedNarration {
  blob: Blob;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function narrationKey(caseId: string, key: string): string {
  return `${caseId}-${key}`;
}

export async function getCachedNarration(
  caseId: string,
  key: string,
): Promise<CachedNarration | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(narrationKey(caseId, key));
    req.onsuccess = () => resolve((req.result as CachedNarration) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function setCachedNarration(
  caseId: string,
  key: string,
  entry: CachedNarration,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(entry, narrationKey(caseId, key));
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

export async function deleteCaseNarrations(caseId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      if (cursor) {
        if ((cursor.key as string).startsWith(caseId + '-')) cursor.delete();
        cursor.continue();
      }
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}
