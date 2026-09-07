/* Мини-обёртка над IndexedDB: в mock-режиме сюда кладутся сами файлы,
   чтобы просмотрщик и скачивание работали без бэкенда (localStorage для
   бинарников не годится — лимит ~5 МБ). */

import { mimeByName } from '../utils'

const DB_NAME = 'cornflow-files'
const STORE = 'blobs'
const VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function putBlob(key: string, blob: Blob, mime?: string): Promise<void> {
  const db = await open()
  // Без корректного типа PDF и офисные файлы не открываются в просмотрщике,
  // поэтому при сохранении MIME восстанавливается по расширению.
  const type = mime || blob.type || mimeByName(key)
  const payload = blob.type === type ? blob : new Blob([blob], { type })
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(payload, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () =>
      reject(
        tx.error ??
          new Error('Не удалось сохранить файл: в браузере закончилось место для хранилища'),
      )
  })
}

export async function getBlob(key: string): Promise<Blob | null> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteBlob(key: string): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/* Кэш object-URL: один и тот же файл не должен плодить ссылки */
const urlCache = new Map<string, string>()

export async function blobUrl(key: string): Promise<string | null> {
  const cached = urlCache.get(key)
  if (cached) return cached
  const blob = await getBlob(key)
  if (!blob) return null
  // Файл мог быть сохранён без типа (старые записи) — чиним на лету
  const expected = mimeByName(key)
  const typed =
    blob.type && blob.type !== 'application/octet-stream' ? blob : new Blob([blob], { type: expected })
  const url = URL.createObjectURL(typed)
  urlCache.set(key, url)
  return url
}

/** Есть ли файл в локальном хранилище — просмотрщик отличает «нет файла» от «файл потерян» */
export async function hasBlob(key: string): Promise<boolean> {
  return (await getBlob(key)) !== null
}

export function revokeAll() {
  urlCache.forEach((url) => URL.revokeObjectURL(url))
  urlCache.clear()
}
