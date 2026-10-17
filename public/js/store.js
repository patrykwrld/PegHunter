// Album storage: IndexedDB on this device (photos are too big for localStorage).
// Same add/remove/list surface a cloud store will implement later.

const DB_NAME = 'peghunter';
const STORE = 'album';
const LEGACY_LS = 'peghunter.album.v1';

const open = () => new Promise((res, rej) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
};

const idbStore = {
  kind: 'device',
  list: () => tx('readonly', (s) => s.getAll()),
  add: (it) => tx('readwrite', (s) => s.put(it)),
  remove: (id) => tx('readwrite', (s) => s.delete(id)),
  replaceAll: (arr) => tx('readwrite', (s) => { s.clear(); arr.forEach((it) => s.put(it)); }),
};

// Fallback when IndexedDB is blocked (some private windows): keep it in memory for the session.
const memoryStore = (() => {
  let mem = [];
  return {
    kind: 'memory',
    list: async () => [...mem],
    add: async (it) => { mem = mem.filter((x) => x.id !== it.id).concat(it); },
    remove: async (id) => { mem = mem.filter((x) => x.id !== id); },
    replaceAll: async (arr) => { mem = [...arr]; },
  };
})();

// Move albums saved by the first prototype (localStorage) into IndexedDB once.
const migrateLegacy = async (store) => {
  let legacy;
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_LS) || 'null'); } catch { legacy = null; }
  if (!Array.isArray(legacy) || !legacy.length) return;
  for (const it of legacy) if (it && it.id) await store.add(it);
  try { localStorage.removeItem(LEGACY_LS); } catch {}
};

export const openStore = async () => {
  try {
    await idbStore.list();
    await migrateLegacy(idbStore);
    return idbStore;
  } catch {
    return memoryStore;
  }
};
