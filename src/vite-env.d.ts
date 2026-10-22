/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPABASE_BUCKET?: string
  readonly VITE_FORCE_MOCK?: string
  readonly VITE_SUPABASE_PROJECT_REF?: string
  readonly VITE_SUPABASE_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
