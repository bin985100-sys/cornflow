/**
 * Ссылки на файлы из хранилища (фото профиля) сохраняются в базе целиком,
 * вместе с адресом сервера. Если приложение ходит к Supabase через свой
 * прокси (например https://api.cornflow.me, потому что *.supabase.co
 * у части провайдеров недоступен), старые ссылки всё ещё указывают на
 * supabase.co и не открываются. Подменяем адрес на тот, через который
 * работает приложение.
 */
const apiUrl = (
  (import.meta.env.VITE_SUPABASE_PROXY_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)
)?.replace(/\/+$/, '')
const SUPABASE_ORIGIN = /^https:\/\/[a-z0-9]+\.supabase\.co(?=\/)/i

export function assetUrl(src: string | null | undefined): string | null {
  if (!src) return null
  if (!apiUrl || /\.supabase\.co$/i.test(new URL(apiUrl).hostname)) return src
  return src.replace(SUPABASE_ORIGIN, apiUrl)
}
