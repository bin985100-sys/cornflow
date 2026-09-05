import { hasSupabase } from '../supabase'
import { MockProvider } from './mock'
import type { DataProvider } from './provider'
import { SupabaseProvider } from './supabase-provider'

/**
 * Единая точка доступа к данным.
 * Если в .env заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — работает
 * реальный Supabase; иначе приложение поднимается в mock-режиме
 * (localStorage + IndexedDB) с демо-данными.
 */
export const db: DataProvider = hasSupabase ? new SupabaseProvider() : new MockProvider()

export const IS_MOCK = db.kind === 'mock'

export * from './provider'
