import { useEffect, useRef, type CSSProperties } from 'react'
import { useInView } from '@/hooks/useInView'
import { cx } from '@/lib/utils'

/**
 * Фоновое видео секции: играет только когда секция видна, уважает
 * prefers-reduced-motion, до загрузки показывает постер.
 */
export function VideoPanel({
  src,
  poster,
  className,
  style,
  overlay,
  objectPosition = 'center',
  videoStyle,
}: {
  src: string
  poster: string
  className?: string
  style?: CSSProperties
  /** Слой поверх видео — заливка/градиент, покрывающий секцию */
  overlay?: CSSProperties
  objectPosition?: string
  /** Правки самого кадра: яркость, контраст, масштаб */
  videoStyle?: CSSProperties
}) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.1, once: false })
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    if (inView) void video.play().catch(() => undefined)
    else video.pause()
  }, [inView])

  return (
    <div ref={ref} className={cx('absolute inset-0 overflow-hidden', className)} style={style} aria-hidden>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
        style={{ objectPosition, ...videoStyle }}
      />
      {overlay && <div className="absolute inset-0" style={overlay} />}
    </div>
  )
}
