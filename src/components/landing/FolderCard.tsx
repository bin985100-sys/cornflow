import type { LucideIcon } from 'lucide-react'

export type FolderCardProps = {
  icon: LucideIcon
  title: string
  text: string
  /** основной цвет папки */
  accent: string
  /** тёмный край градиента — с ним белый текст читается на любом оттенке */
  deep: string
}

/**
 * Объёмная папка-карточка для лендинга: язычок и «спинка» сзади,
 * пара торчащих листов, спереди — цветная створка с текстом.
 */
export function FolderCard({ icon: Icon, title, text, accent, deep }: FolderCardProps) {
  return (
    <article className="group relative h-full select-none pb-[10px] pt-[54px]">
      {/* спинка папки */}
      <div
        className="pointer-events-none absolute inset-x-[-5px] bottom-0 top-[16px] rounded-[26px] transition-transform duration-300 group-hover:-translate-y-1"
        style={{
          background: `linear-gradient(165deg, color-mix(in srgb, ${accent} 55%, white) 0%, color-mix(in srgb, ${accent} 80%, white) 100%)`,
        }}
        aria-hidden
      />
      {/* язычок */}
      <div
        className="pointer-events-none absolute left-[16px] top-0 h-[34px] w-[44%] rounded-t-[14px] transition-transform duration-300 group-hover:-translate-y-1"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 48%, white) 0%, color-mix(in srgb, ${accent} 62%, white) 100%)`,
        }}
        aria-hidden
      />

      {/* листы внутри */}
      <div
        className="pointer-events-none absolute left-1/2 top-[30px] h-[92px] w-[62%] -translate-x-1/2 -rotate-[3deg] rounded-[9px] bg-white/70 shadow-[0_6px_14px_-8px_rgba(16,24,40,.5)] transition-transform duration-300 group-hover:-translate-y-[6px] group-hover:-rotate-[5deg]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[24px] h-[100px] w-[72%] -translate-x-1/2 rotate-[2deg] rounded-[9px] bg-white shadow-[0_8px_18px_-10px_rgba(16,24,40,.55)] transition-transform duration-300 group-hover:-translate-y-[10px] group-hover:rotate-[4deg]"
        aria-hidden
      >
        <span className="absolute left-3 right-6 top-3 block h-[5px] rounded-full bg-black/[0.09]" />
        <span className="absolute left-3 right-10 top-[22px] block h-[5px] rounded-full bg-black/[0.07]" />
        <span className="absolute left-3 right-14 top-[34px] block h-[5px] rounded-full bg-black/[0.05]" />
      </div>

      {/* передняя створка */}
      <div
        className="relative flex h-full flex-col overflow-hidden rounded-[24px] p-5 shadow-[0_2px_6px_rgba(16,24,40,.12),0_22px_44px_-24px_rgba(16,24,40,.55)] transition-transform duration-300 group-hover:-translate-y-1"
        style={{ background: `linear-gradient(152deg, ${accent} 0%, ${deep} 100%)` }}
      >
        {/* стеклянный блик */}
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0))' }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,.28), rgba(255,255,255,0) 70%)' }}
          aria-hidden
        />

        <span className="relative flex h-10 w-10 items-center justify-center rounded-[13px] bg-white/20 text-white backdrop-blur-sm">
          <Icon size={19} />
        </span>
        <h3 className="relative mt-3.5 text-[16.5px] font-semibold text-white">{title}</h3>
        <p className="relative mt-1.5 text-[13.5px] leading-relaxed text-white/85">{text}</p>
      </div>
    </article>
  )
}
