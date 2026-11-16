import { openDatabase, requestValue, transactionDone } from './database.ts';

interface WheelDraft {
  id: string;
  text: string;
  updatedAt: string;
}

const legacyDraftId = 'default';

export async function loadWheelDraft(id = legacyDraftId): Promise<string | null> {
  const database = await openDatabase();
  try {
    const saved = await new Promise<WheelDraft | undefined>((resolve, reject) => {
      const transaction = database.transaction('wheelDrafts', 'readonly');
      void requestValue(transaction.objectStore('wheelDrafts').get(id) as IDBRequest<WheelDraft | undefined>).then(resolve, reject);
    });
    if (saved) return saved.text;

    if (id !== legacyDraftId) return null;
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

export async function saveWheelDraft(text: string, id = legacyDraftId): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('wheelDrafts', 'readwrite');
      const draft: WheelDraft = { id, text, updatedAt: new Date().toISOString() };
      transaction.objectStore('wheelDrafts').put(draft);
      void transactionDone(transaction).then(resolve, reject);
    });
  } finally {
    database.close();
  }
}
