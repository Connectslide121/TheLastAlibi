import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { CasePackage } from '../models';

interface SavedCaseSummary {
  id: string;
  title: string;
  savedAt: string;
}

const DB_NAME = 'tla_case_store';
const DB_VERSION = 1;
const STORE_NAME = 'cases';

@Injectable({ providedIn: 'root' })
export class CaseStoreService {
  private dbPromise: Promise<IDBDatabase> = this.openDb();

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  storeCase(casePackage: CasePackage): Observable<void> {
    return from(
      this.dbPromise.then((db) =>
        this.runTransaction(db, 'readwrite', (store) =>
          store.put({ ...casePackage, _savedAt: new Date().toISOString() }),
        ),
      ),
    ).pipe(
      map(() => void 0),
      catchError((err) => {
        console.error('CaseStoreService.storeCase failed', err);
        return of(void 0);
      }),
    );
  }

  loadCase(sessionId: string): Observable<CasePackage | null> {
    return from(
      this.dbPromise.then((db) =>
        this.runTransaction<CasePackage | undefined>(db, 'readonly', (store) =>
          store.get(sessionId),
        ),
      ),
    ).pipe(
      map((result) => result ?? null),
      catchError(() => of(null)),
    );
  }

  deleteCase(sessionId: string): Observable<void> {
    return from(
      this.dbPromise.then((db) =>
        this.runTransaction(db, 'readwrite', (store) => store.delete(sessionId)),
      ),
    ).pipe(
      map(() => void 0),
      catchError(() => of(void 0)),
    );
  }

  listSavedCases(): Observable<SavedCaseSummary[]> {
    return from(
      this.dbPromise.then(
        (db) =>
          new Promise<SavedCaseSummary[]>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.openCursor();
            const results: SavedCaseSummary[] = [];

            request.onsuccess = (event) => {
              const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
              if (cursor) {
                const record = cursor.value as CasePackage & { _savedAt: string };
                results.push({
                  id: record.id,
                  title: record.metadata?.title ?? record.id,
                  savedAt: record._savedAt ?? '',
                });
                cursor.continue();
              } else {
                resolve(results);
              }
            };
            request.onerror = () => reject(request.error);
          }),
      ),
    ).pipe(catchError(() => of([])));
  }

  // ---------------------------------------------------------------------------
  // Private – IndexedDB helpers
  // ---------------------------------------------------------------------------

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
      request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    });
  }

  private runTransaction<T = void>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
