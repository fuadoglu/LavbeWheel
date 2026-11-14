const databaseName = 'lavbe-wheel';
const databaseVersion = 2;

export interface StoredSession {
  sessionId: string;
  envelope: import('@lavbe/contracts').SessionEnvelope;
  revision: number;
  updatedAt: string;
}

export interface WriterLease {
  wheelId: string;
  ownerId: string;
  expiresAt: number;
  revision: number;
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('wheelDrafts')) database.createObjectStore('wheelDrafts', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('sessions')) database.createObjectStore('sessions', { keyPath: 'sessionId' });
      if (!database.objectStoreNames.contains('leases')) database.createObjectStore('leases', { keyPath: 'wheelId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local database'));
    request.onblocked = () => reject(new Error('Local database upgrade is blocked by another tab'));
  });
}

export function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local database request failed'));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Local database transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local database transaction was aborted'));
  });
}
