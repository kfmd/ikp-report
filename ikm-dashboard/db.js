// db.js — IndexedDB local database for IKM Dashboard
// Stores fetched sheet data per (sheetName) key with timestamp

window.IKMApp = window.IKMApp || {};

window.IKMApp.DB = (function () {
  const DB_NAME = 'IKMDashboardDB';
  const DB_VERSION = 1;
  const STORE_CACHE = 'cache';
  let db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_CACHE)) {
          const store = database.createObjectStore(STORE_CACHE, { keyPath: 'key' });
          store.createIndex('ts', 'ts', { unique: false });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function tx(storeName, mode, fn) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getCache(key) {
    try { return (await tx(STORE_CACHE, 'readonly', s => s.get(key))) || null; }
    catch (e) { console.warn('DB getCache failed', e); return null; }
  }

  async function setCache(key, data) {
    try {
      await tx(STORE_CACHE, 'readwrite', s => s.put({ key, ts: new Date().toISOString(), data }));
      return true;
    } catch (e) { console.warn('DB setCache failed', e); return false; }
  }

  async function getAllCacheKeys() {
    try {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_CACHE, 'readonly');
        const store = transaction.objectStore(STORE_CACHE);
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return []; }
  }

  async function clearAll() {
    try {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_CACHE, 'readwrite');
        const req = transaction.objectStore(STORE_CACHE).clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return false; }
  }

  return { getCache, setCache, getAllCacheKeys, clearAll };
})();
