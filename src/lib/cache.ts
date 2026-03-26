/**
 * IndexedDB cache for messages and nodes.
 * Keyed by connection key (transport:address) so data survives reconnects.
 */

import type { MeshMessage, MeshNode } from "@/stores/types";

const DB_NAME = "meshymesh-cache";
const DB_VERSION = 1;
const MESSAGES_STORE = "messages";
const NODES_STORE = "nodes";

function connectionKey(transport: string, address: string): string {
  return `${transport}:${address}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        db.createObjectStore(MESSAGES_STORE);
      }
      if (!db.objectStoreNames.contains(NODES_STORE)) {
        db.createObjectStore(NODES_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getFromStore<T>(storeName: string, key: string): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function putToStore<T>(storeName: string, key: string, value: T): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function deleteFromStore(storeName: string, key: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function clearStore(storeName: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

// --- Messages ---

export async function loadCachedMessages(
  transport: string,
  address: string,
): Promise<MeshMessage[]> {
  const key = connectionKey(transport, address);
  return (await getFromStore<MeshMessage[]>(MESSAGES_STORE, key)) ?? [];
}

export async function saveCachedMessages(
  transport: string,
  address: string,
  messages: MeshMessage[],
): Promise<void> {
  const key = connectionKey(transport, address);
  await putToStore(MESSAGES_STORE, key, messages);
}

export async function appendCachedMessage(
  transport: string,
  address: string,
  message: MeshMessage,
): Promise<void> {
  const existing = await loadCachedMessages(transport, address);
  // Deduplicate by ID
  if (!existing.some((m) => m.id === message.id)) {
    existing.push(message);
    await saveCachedMessages(transport, address, existing);
  }
}

// --- Nodes ---

export async function loadCachedNodes(
  transport: string,
  address: string,
): Promise<Record<number, MeshNode>> {
  const key = connectionKey(transport, address);
  return (await getFromStore<Record<number, MeshNode>>(NODES_STORE, key)) ?? {};
}

export async function saveCachedNodes(
  transport: string,
  address: string,
  nodes: Record<number, MeshNode>,
): Promise<void> {
  const key = connectionKey(transport, address);
  await putToStore(NODES_STORE, key, nodes);
}

export async function cleanStaleNodes(
  transport: string,
  address: string,
  staleNodeDays: number,
): Promise<Record<number, MeshNode>> {
  const nodes = await loadCachedNodes(transport, address);
  const cutoff = Math.floor(Date.now() / 1000) - staleNodeDays * 86400;
  const cleaned: Record<number, MeshNode> = {};
  for (const [num, node] of Object.entries(nodes)) {
    if (node.lastHeard >= cutoff) {
      cleaned[Number(num)] = node;
    }
  }
  await saveCachedNodes(transport, address, cleaned);
  return cleaned;
}

// --- Bulk ---

export async function clearAllCache(): Promise<void> {
  await clearStore(MESSAGES_STORE);
  await clearStore(NODES_STORE);
}

export async function clearCacheForConnection(
  transport: string,
  address: string,
): Promise<void> {
  const key = connectionKey(transport, address);
  await deleteFromStore(MESSAGES_STORE, key);
  await deleteFromStore(NODES_STORE, key);
}
