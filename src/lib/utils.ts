import type { CardColor, MaterialType, TagColor } from './types'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix ? `${prefix}_${rnd}` : rnd
}

export function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

export function nowIso(): string {
  return new Date().toISOString()
}

/* ---------------------------- Палитра ------------------------------------ */

export const CARD_COLORS: CardColor[] = ['red', 'yellow', 'green', 'blue', 'purple']

export const cardPalette: Record<CardColor, { bg: string; accent: string; label: string }> = {
  red: { bg: 'var(--cf-red-bg)', accent: 'var(--cf-red-acc)', label: 'Красный' },
  yellow: { bg: 'var(--cf-yellow-bg)', accent: 'var(--cf-yellow-acc)', label: 'Жёлтый' },
  green: { bg: 'var(--cf-green-bg)', accent: 'var(--cf-green-acc)', label: 'Зелёный' },
  blue: { bg: 'var(--cf-blue-bg)', accent: 'var(--cf-blue-acc)', label: 'Голубой' },
  purple: { bg: 'var(--cf-purple-bg)', accent: 'var(--cf-purple-acc)', label: 'Фиолетовый' },
}

export const tagPalette: Record<TagColor, { bg: string; fg: string; label: string }> = {
  blue: { bg: 'var(--cf-tag-blue-bg)', fg: 'var(--cf-tag-blue-fg)', label: 'Синий' },
  green: { bg: 'var(--cf-tag-green-bg)', fg: 'var(--cf-tag-green-fg)', label: 'Зелёный' },
  purple: { bg: 'var(--cf-tag-purple-bg)', fg: 'var(--cf-tag-purple-fg)', label: 'Фиолетовый' },
  orange: { bg: 'var(--cf-tag-orange-bg)', fg: 'var(--cf-tag-orange-fg)', label: 'Оранжевый' },
  navy: { bg: 'var(--cf-tag-navy-bg)', fg: 'var(--cf-tag-navy-fg)', label: 'Тёмно-синий' },
  teal: { bg: 'var(--cf-tag-teal-bg)', fg: 'var(--cf-tag-teal-fg)', label: 'Бирюзовый' },
  red: { bg: 'var(--cf-tag-red-bg)', fg: 'var(--cf-tag-red-fg)', label: 'Красный' },
}

export const TAG_COLORS = Object.keys(tagPalette) as TagColor[]

/** Стабильный цвет карточки по строке — чтобы сетка выглядела разноцветной */
export function colorFromString(seed: string): CardColor {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return CARD_COLORS[h % CARD_COLORS.length]
}

/* ---------------------------- Файлы -------------------------------------- */

export const MATERIAL_TYPE_LABEL: Record<MaterialType, string> = {
  document: 'Документ',
  pdf: 'PDF',
  presentation: 'Презентация',
  video: 'Видео',
  link: 'Ссылка',
  image: 'Изображение',
  audio: 'Аудио',
  note: 'Конспект',
  assignment: 'Задание',
}

export function detectType(file: { name: string; type?: string }): MaterialType {
  const mime = (file.type || '').toLowerCase()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (['ppt', 'pptx', 'key', 'odp'].includes(ext)) return 'presentation'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'heic'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio'
  return 'document'
}

/**
 * MIME по расширению. Браузеры не всегда проставляют `File.type`
 * (особенно на Windows и при перетаскивании), а без правильного типа
 * PDF и офисные файлы не открываются во встроенном просмотрщике.
 */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  txt: 'text/plain;charset=utf-8',
  md: 'text/plain;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
  html: 'text/html;charset=utf-8',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
}

export function mimeByName(name: string, fallback = 'application/octet-stream'): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? fallback
}

/** Достоверный MIME файла: свой, если браузер его знает, иначе по расширению */
export function resolveMime(file: { name: string; type?: string }): string {
  const own = (file.type || '').toLowerCase()
  if (own && own !== 'application/octet-stream') return own
  return mimeByName(file.name)
}

/** Типы, которые браузер умеет показать во встроенном просмотрщике */
export function isInlineViewable(mime: string): boolean {
  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime.startsWith('text/') ||
    mime === 'application/pdf' ||
    mime === 'application/json'
  )
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} Б`
  const units = ['КБ', 'МБ', 'ГБ']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

/* ---------------------------- Даты --------------------------------------- */

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
export const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function formatDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function formatDateFull(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function formatTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.round(hours / 24)
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} дн назад`
  return formatDate(iso)
}

/** «Осталось 3 дня» / «Просрочено на 2 дня» */
export function dueLabel(iso?: string | null): { text: string; tone: 'ok' | 'soon' | 'late' } {
  if (!iso) return { text: 'Без срока', tone: 'ok' }
  const target = startOfDay(new Date(iso)).getTime()
  const today = startOfDay(new Date()).getTime()
  const days = Math.round((target - today) / 86400000)
  if (days < 0) return { text: `Просрочено на ${plural(-days, 'день', 'дня', 'дней')}`, tone: 'late' }
  if (days === 0) return { text: 'Сегодня', tone: 'soon' }
  if (days === 1) return { text: 'Завтра', tone: 'soon' }
  if (days <= 3) return { text: `Через ${plural(days, 'день', 'дня', 'дней')}`, tone: 'soon' }
  if (days <= 30) return { text: `Через ${plural(days, 'день', 'дня', 'дней')}`, tone: 'ok' }
  return { text: `Через ${plural(Math.round(days / 7), 'неделю', 'недели', 'недель')}`, tone: 'ok' }
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  let word = many
  if (mod10 === 1 && mod100 !== 11) word = one
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = few
  return `${n} ${word}`
}

export function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

export function sameDay(a: Date | string, b: Date | string): boolean {
  const x = new Date(a)
  const y = new Date(b)
  return (
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  )
}

/** Понедельник недели, содержащей дату */
export function startOfWeek(d: Date): Date {
  const c = startOfDay(d)
  const day = (c.getDay() + 6) % 7
  c.setDate(c.getDate() - day)
  return c
}

/** 6×7 сетка месяца, начиная с понедельника */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export function toDateInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* ---------------------------- Разное ------------------------------------- */

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** Простой транслит-независимый поиск: без регистра и лишних пробелов */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim()
}

export function stripHtml(html?: string | null): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function excerpt(text: string, max = 140): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  wrapped.cancel = () => timer && clearTimeout(timer)
  return wrapped
}

export function isExternalUrl(v: string): boolean {
  return /^https?:\/\//i.test(v.trim())
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Безопасное имя объекта в Storage: только латиница, цифры, точка,
 * дефис и подчёркивание. Кириллица транслитерируется — иначе часть
 * прокси и CDN ломают ссылки на файл.
 */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

export function safeFileKey(name: string): string {
  const lower = name.trim().toLowerCase()
  let out = ''
  for (const ch of lower) out += TRANSLIT[ch] ?? ch
  out = out.replace(/[^a-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
  return out.slice(0, 96) || 'file'
}

export function download(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
