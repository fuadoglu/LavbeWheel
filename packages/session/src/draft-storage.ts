interface WheelDraft {
  id: 'default';
  text: string;
  updatedAt: string;
}

const databaseName = 'lavbe-wheel';
const databaseVersion = 1;
const objectStoreName = 'wheelDrafts';
const draftId = 'default';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(objectStoreName)) {
        database.createObjectStore(objectStoreName, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local database'));
    request.onblocked = () => reject(new Error('Local database upgrade is blocked by another tab'));
  });
}

export async function loadWheelDraft(): Promise<string | null> {
  const database = await openDatabase();
  try {
    const saved = await new Promise<WheelDraft | undefined>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, 'readonly');
      const request = transaction.objectStore(objectStoreName).get(draftId) as IDBRequest<WheelDraft | undefined>;
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not read local wheel draft'));
    });
    if (saved) return saved.text;

    let legacy: string | null = null;
    try { legacy = localStorage.getItem('lavbe.entries'); } catch { /* The prior storage may be unavailable. */ }
    if (legacy !== null) {
      await saveWheelDraft(legacy);
      try { localStorage.removeItem('lavbe.entries'); } catch { /* Keep migrated data even if legacy cleanup is denied. */ }
      return legacy;
    }
    return null;
  } finally {
    database.close();
  }
}

export async function saveWheelDraft(text: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, 'readwrite');
      const draft: WheelDraft = { id: draftId, text, updatedAt: new Date().toISOString() };
      transaction.objectStore(objectStoreName).put(draft);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save local wheel draft'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Local wheel draft save was aborted'));
    });
  } finally {
    database.close();
  }
}
