// Encrypts the viewer's own API keys before they are stored. The AES-GCM key is generated on this computer as a
// non-extractable CryptoKey and kept in the extension's IndexedDB, so chrome.storage only ever holds ciphertext,
// nothing is synced to other devices, and no page or content script can read the key back out. Only the service
// worker decrypts, right before calling the provider.
const DB = "twinsub-vault", STORE = "keys", MASTER = "master";

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

let master;
async function masterKey() {
  if (master) return master;
  const db = await idb();
  let key = await tx(db, "readonly", s => s.get(MASTER));
  if (!key) {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await tx(db, "readwrite", s => s.put(key, MASTER));
  }
  db.close();
  return (master = key);
}

const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function seal(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await masterKey(), new TextEncoder().encode(text));
  return { v: 1, iv: b64(iv), data: b64(data) };
}

export async function open(box) {
  if (!box?.iv || !box?.data) return "";
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, await masterKey(), unb64(box.data));
  return new TextDecoder().decode(plain);
}
