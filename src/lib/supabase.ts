import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const forceMock = String(import.meta.env.VITE_FORCE_MOCK ?? '').toLowerCase() === 'true'

export const BUCKET = (import.meta.env.VITE_SUPABASE_BUCKET as string | undefined) || 'materials'

/** Есть ли рабочая конфигурация Supabase */
export const hasSupabase = Boolean(url && anonKey) && !forceMock

let client: SupabaseClient | null = null

/**
 * Запросы с ограничением по времени. На медленной или «прореженной» сети
 * запрос может не закончиться никогда, и интерфейс висит без объяснений.
 * Чтение повторяем один раз; запись не повторяем, чтобы не задвоить данные.
 * Загрузку файлов не обрываем — большой файл по медленной сети идёт долго.
 */
const TIMEOUT_MS = 25_000
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (url.includes('/storage/v1/object') && method !== 'GET') return fetch(input, init)
  const idempotent = method === 'GET' || method === 'HEAD'
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const outer = init.signal
    const relay = () => ctrl.abort()
    outer?.addEventListener('abort', relay)
    try {
      return await fetch(input, { ...init, signal: ctrl.signal })
    } catch (e) {
      if (outer?.aborted) throw e
      if (!idempotent || attempt >= 1) throw new TypeError('Failed to fetch: сервер не ответил вовремя')
    } finally {
      window.clearTimeout(timer)
      outer?.removeEventListener('abort', relay)
    }
  }
}

export function supabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) throw new Error('Supabase не сконфигурирован — приложение работает в mock-режиме')
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: fetchWithTimeout },
    })
  }
  return client
}
