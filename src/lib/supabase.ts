import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const forceMock = String(import.meta.env.VITE_FORCE_MOCK ?? '').toLowerCase() === 'true'

export const BUCKET = (import.meta.env.VITE_SUPABASE_BUCKET as string | undefined) || 'materials'

/** Есть ли рабочая конфигурация Supabase */
export const hasSupabase = Boolean(url && anonKey) && !forceMock

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) throw new Error('Supabase не сконфигурирован — приложение работает в mock-режиме')
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}
