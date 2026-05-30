const DB_NAME = 'gpt-image-local-db';
const DB_VERSION = 2;
const LEGACY_CONFIG_KEY = 'gpt-image-local-config';

export const STORE_NAMES = {
  history: 'history',
  imageBlobs: 'imageBlobs',
  settings: 'settings',
};

export const defaultConfig = {
  website: '',
  baseUrl: '',
  imagePath: '/v1/images/generations',
  model: 'gpt-image-2',
  apiKey: '',
};

let dbPromise = null;
let legacyConfigMigrationChecked = false;

export function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function normalizeImagePath(value) {
  const imagePath = String(value || defaultConfig.imagePath).trim() || defaultConfig.imagePath;
  return `/${imagePath.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

export function maskApiKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.length <= 10) return `${apiKey.slice(0, 3)}...`;
  return `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}`;
}

export async function readStoredConfig() {
  await migrateLegacyConfig();
  const record = await getFromStore(STORE_NAMES.settings, 'config');
  const config = normalizeStoredConfig({ ...defaultConfig, ...(record?.value || {}) });
  const apiKey = config.apiKey || '';

  return {
    ...config,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    imagePath: normalizeImagePath(config.imagePath),
    model: String(config.model || defaultConfig.model).trim() || defaultConfig.model,
    apiKey,
    hasApiKey: Boolean(apiKey),
    maskedApiKey: maskApiKey(apiKey),
  };
}

export async function saveStoredConfig(config) {
  const next = normalizeStoredConfig({
    website: normalizeBaseUrl(config.website),
    baseUrl: normalizeBaseUrl(config.baseUrl),
    imagePath: normalizeImagePath(config.imagePath),
    model: String(config.model || defaultConfig.model).trim() || defaultConfig.model,
    apiKey: config.apiKey,
  });

  await putInStore(STORE_NAMES.settings, {
    key: 'config',
    value: next,
    updatedAt: new Date().toISOString(),
  });

  return {
    ...next,
    hasApiKey: Boolean(next.apiKey),
    maskedApiKey: maskApiKey(next.apiKey),
  };
}

export async function listHistory() {
  await migrateLegacyConfig();
  const items = await getAllFromStore(STORE_NAMES.history);
  const hydrated = await Promise.all(
    items.map(async (item) => ({
      ...item,
      date: item.date || dateFromTimestamp(item.id),
      images: await hydrateImages(item.images || []),
    }))
  );

  return hydrated.sort((a, b) => b.id - a.id);
}

export async function saveHistoryItem(item, blobs) {
  const db = await getDb();
  const transaction = db.transaction([STORE_NAMES.history, STORE_NAMES.imageBlobs], 'readwrite');
  const historyStore = transaction.objectStore(STORE_NAMES.history);
  const blobStore = transaction.objectStore(STORE_NAMES.imageBlobs);

  blobs.forEach((record) => blobStore.put(record));
  historyStore.put(item);

  await transactionDone(transaction);
  return listHistory();
}

export function createId(prefix) {
  const random = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

async function hydrateImages(images) {
  return Promise.all(
    images.map(async (image) => {
      if (!image.blobKey) return image;
      const record = await getFromStore(STORE_NAMES.imageBlobs, image.blobKey);
      if (!record?.blob) return image;

      return {
        ...image,
        previewUrl: URL.createObjectURL(record.blob),
      };
    })
  );
}

async function migrateLegacyConfig() {
  if (legacyConfigMigrationChecked) return;
  legacyConfigMigrationChecked = true;

  const stored = await getFromStore(STORE_NAMES.settings, 'config');
  if (stored) {
    localStorage.removeItem(LEGACY_CONFIG_KEY);
    return;
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_CONFIG_KEY) || '{}');
    if (!legacy || Object.keys(legacy).length === 0) return;

    await saveStoredConfig({
      ...defaultConfig,
      ...legacy,
      imagePath: legacy.imagePath === '/images/generations' ? '/v1/images/generations' : legacy.imagePath,
      baseUrl: normalizeLegacyBaseUrl(legacy.baseUrl),
    });
    localStorage.removeItem(LEGACY_CONFIG_KEY);
  } catch {
    localStorage.removeItem(LEGACY_CONFIG_KEY);
  }
}

function normalizeLegacyBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith('/v1/images')) return normalized.slice(0, -10);
  if (normalized.endsWith('/v1')) return normalized.slice(0, -3);
  return normalized;
}

function normalizeStoredConfig(config) {
  let baseUrl = normalizeBaseUrl(config.baseUrl);
  let imagePath = normalizeImagePath(config.imagePath);

  if (baseUrl.endsWith('/v1/images')) {
    baseUrl = baseUrl.slice(0, -10);
    imagePath = normalizeImagesPath(imagePath);
  } else if (baseUrl.endsWith('/v1')) {
    baseUrl = baseUrl.slice(0, -3);
    imagePath = normalizeImagesPath(imagePath);
  } else {
    imagePath = normalizeImagesPath(imagePath);
  }

  return {
    ...config,
    baseUrl,
    imagePath,
    model: String(config.model || defaultConfig.model).trim() || defaultConfig.model,
  };
}

function normalizeImagesPath(imagePath) {
  if (imagePath === '/generations' || imagePath === '/images/generations') {
    return '/v1/images/generations';
  }

  if (imagePath.startsWith('/v1/')) return imagePath;
  if (imagePath.startsWith('/images/')) return `/v1${imagePath}`;

  return imagePath;
}

function dateFromTimestamp(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAMES.history)) {
          db.createObjectStore(STORE_NAMES.history, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.imageBlobs)) {
          db.createObjectStore(STORE_NAMES.imageBlobs, { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.settings)) {
          db.createObjectStore(STORE_NAMES.settings, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

async function getAllFromStore(storeName) {
  const db = await getDb();
  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.getAll());
}

async function getFromStore(storeName, key) {
  const db = await getDb();
  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.get(key));
}

async function putInStore(storeName, value) {
  const db = await getDb();
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  store.put(value);
  await transactionDone(transaction);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
