/**
 * IndexedDB cache for generated images.
 *
 * DB:    game-image-cache
 * Store: images
 * Key:   `${caseId}-${entityType}-${entityId}`
 * Value: { blob: Blob, promptHash: string, createdAt: number }
 */

const DB_NAME = 'game-image-cache';
const STORE_NAME = 'images';
const DB_VERSION = 1;

export interface CachedImage {
  blob: Blob;
  promptHash: string;
  sourcePromptHash?: string;
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

function cacheKey(caseId: string, entityType: string, entityId: string): string {
  return `${caseId}-${entityType}-${entityId}`;
}

/** Simple non-cryptographic hash — good enough for prompt change detection. */
export function hashPrompt(prompt: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export async function getCachedImage(
  caseId: string,
  entityType: string,
  entityId: string,
): Promise<CachedImage | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(cacheKey(caseId, entityType, entityId));
    req.onsuccess = () => resolve((req.result as CachedImage) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function setCachedImage(
  caseId: string,
  entityType: string,
  entityId: string,
  entry: CachedImage,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(entry, cacheKey(caseId, entityType, entityId));
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

export async function deleteCaseImages(caseId: string): Promise<void> {
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
