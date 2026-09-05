import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'cornflow.theme'

function initial(): Theme {
  const saved = localStorage.getItem(KEY) as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Тёмная тема: переключаем data-theme на <html>, значения берутся из токенов. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial)

  useEffect(() => {
    const root = document.documentElement
    // на время смены темы включаем переходы цвета, потом снимаем,
    // чтобы они не тормозили обычную работу интерфейса
    root.classList.add('cf-theme-switching')
    root.dataset.theme = theme
    localStorage.setItem(KEY, theme)
    const timer = window.setTimeout(() => root.classList.remove('cf-theme-switching'), 320)
    return () => window.clearTimeout(timer)
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  return { theme, setTheme, toggle }
}
