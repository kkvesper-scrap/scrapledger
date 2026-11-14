// グラフの部品(外部のライブラリを使わず SVG で描く)
// - 棒は細めで、上の角だけ 4px 丸め、下は基準線に接する。隣の棒との間は 2px 以上あける
// - 目盛り線・軸は控えめな色。縦の目盛りは 1 本だけ(2 種類の目盛りは使わない)
// - 触れた(PC はマウスを乗せた)棒の値を吹き出しで表示。触れる範囲は棒より広く(その月の帯全体)
import { useEffect, useRef, useState, type ReactNode } from 'react'

/** 親の幅に合わせて描くための幅(px) */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** 目盛り用の金額表示(1万以上は「万」) */
export const axisYen = (n: number) => {
  if (n === 0) return '0'
  if (Math.abs(n) >= 10_000) {
    const v = n / 10_000
    return `${Number.isInteger(v) ? v : v.toFixed(1)}万`
  }
  return n.toLocaleString('ja-JP')
}

/** 0 から max までを、きりの良い間隔(1・2・5 × 10 の n 乗)で 4 つ前後に分けた目盛り */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0]
  const raw = max / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v))
  return ticks
}

/** 上の角だけを丸めた棒(下は基準線に接する) */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export interface Series {
  key: string
  name: string
  color: string
  values: number[]
}

interface BarChartProps {
  labels: string[] // 横軸(例 1月〜12月)
  series: Series[]
  /** 吹き出しの中身(i 番目の帯) */
  tooltip: (i: number) => ReactNode
  /** 帯を押したとき(その月を開くなど) */
  onPick?: (i: number) => void
  height?: number
  /** 強調する帯(今月など) */
  highlight?: number
}

export function BarChart({ labels, series, tooltip, onPick, height = 220, highlight }: BarChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(0, ...series.flatMap((s) => s.values))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1] || 1
  const padL = 44
  const padR = 6
  const padT = 10
  const padB = 24
  const plotW = Math.max(0, width - padL - padR)
  const plotH = height - padT - padB
  const band = labels.length ? plotW / labels.length : 0
  const groupW = band * (series.length > 1 ? 0.78 : 0.62)
  const gap = 2
  const barW = Math.max(2, (groupW - gap * (series.length - 1)) / series.length)
  const y = (v: number) => padT + plotH - (v / top) * plotH
  // 横軸の文字が混み合うときは間引く
  const every = band < 26 ? Math.ceil(26 / Math.max(band, 1)) : 1

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.name).join('と') + 'の棒グラフ'}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis-base' : 'grid'} />
              <text x={padL - 6} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {axisYen(t)}
              </text>
            </g>
          ))}
          {labels.map((lab, i) => {
            const x0 = padL + band * i
            const gx = x0 + (band - groupW) / 2
            return (
              <g key={lab + i}>
                {(highlight === i || active === i) && <rect x={x0} y={padT} width={band} height={plotH} className={active === i ? 'band-active' : 'band-highlight'} />}
                {series.map((s, k) => {
                  const v = s.values[i] ?? 0
                  const h = (v / top) * plotH
                  return <path key={s.key} d={barPath(gx + k * (barW + gap), y(v), barW, h)} fill={s.color} />
                })}
                {i % every === 0 && (
                  <text x={x0 + band / 2} y={height - 6} className={`tick ${highlight === i ? 'tick-strong' : ''}`} textAnchor="middle">
                    {lab}
                  </text>
                )}
                {/* 触れる範囲は帯全体(棒より広く) */}
                <rect
                  x={x0}
                  y={0}
                  width={band}
                  height={height}
                  fill="transparent"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => (active === i && onPick ? onPick(i) : setActive(i))}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            )
          })}
        </svg>
      )}
      {active !== null && width > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(padL + band * active + band / 2, 90), width - 90) }}>
          {tooltip(active)}
          {onPick && <div className="chart-tip-hint">もう一度押すと開きます</div>}
        </div>
      )}
    </div>
  )
}

export interface Slice {
  key: string
  name: string
  color: string
  value: number
}

/** ドーナツグラフ(全体に対する割合。6 区分まで) */
export function Donut({ slices, center, size = 190 }: { slices: Slice[]; center: ReactNode; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const r = size / 2 - 16
  const c = size / 2
  const sw = 26
  let a = -Math.PI / 2
  const arcs = slices.map((s) => {
    const frac = total ? s.value / total : 0
    const a0 = a
    const a1 = a + frac * Math.PI * 2
    a = a1
    return { ...s, a0, a1, frac }
  })
  const pt = (ang: number) => [c + r * Math.cos(ang), c + r * Math.sin(ang)]
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label="割合のグラフ">
        <circle cx={c} cy={c} r={r} fill="none" className="donut-track" strokeWidth={sw} />
        {arcs.map((s) => {
          if (s.frac <= 0) return null
          if (s.frac >= 0.9999) return <circle key={s.key} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={sw} />
          const [x0, y0] = pt(s.a0)
          const [x1, y1] = pt(s.a1)
          const large = s.a1 - s.a0 > Math.PI ? 1 : 0
          return <path key={s.key} d={`M${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}`} fill="none" stroke={s.color} strokeWidth={sw} />
        })}
        {/* 区分の境目に背景色の細い線(2px)を入れて見分けやすく */}
        {arcs.length > 1 &&
          arcs.map((s) => {
            if (s.frac <= 0) return null
            const [xi, yi] = [c + (r - sw / 2 - 1) * Math.cos(s.a0), c + (r - sw / 2 - 1) * Math.sin(s.a0)]
            const [xo, yo] = [c + (r + sw / 2 + 1) * Math.cos(s.a0), c + (r + sw / 2 + 1) * Math.sin(s.a0)]
            return <line key={`g${s.key}`} x1={xi} y1={yi} x2={xo} y2={yo} className="donut-gap" />
          })}
      </svg>
      <div className="donut-center">{center}</div>
    </div>
  )
}

/** 最小〜最大を、きりの良い間隔で 4 つ前後に分けた目盛り(0 から始めない。単価の変化を見やすく) */
function niceRange(lo: number, hi: number): number[] {
  if (hi <= lo) {
    const pad = Math.max(1, Math.abs(hi) * 0.1)
    lo -= pad
    hi += pad
  }
  const raw = (hi - lo) / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw
  const start = Math.floor(lo / step) * step
  const ticks: number[] = []
  for (let v = start; v < hi + step * 0.999; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return ticks
}

export interface LinePoint {
  t: number // 時刻(ms)
  v: number
  /** 吹き出しに足す説明(業者名など) */
  note?: string
}
export interface LineSeries {
  key: string
  name: string
  color: string
  points: LinePoint[] // 古い順
}

const DAY = 86_400_000

/** 折れ線グラフ(単価の推移)。横軸は日付。触れた(マウスを乗せた)ところに近い点の値を吹き出しで表示 */
export function LineChart({ series, height = 260, unit = '円' }: { series: LineSeries[]; height?: number; unit?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<{ s: number; p: number } | null>(null)
  const all = series.flatMap((s) => s.points)
  if (!all.length) return <div className="chart" ref={ref} />
  let t0 = Math.min(...all.map((p) => p.t))
  let t1 = Math.max(...all.map((p) => p.t))
  if (t1 - t0 < DAY * 14) {
    t0 -= DAY * 7
    t1 += DAY * 7
  }
  const ticks = niceRange(Math.min(...all.map((p) => p.v)), Math.max(...all.map((p) => p.v)))
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const padL = 44
  const padR = 12
  const padT = 10
  const padB = 24
  const plotW = Math.max(0, width - padL - padR)
  const plotH = height - padT - padB
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * plotW
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH

  // 横軸の目盛り: 月の初めに。多ければ間引く
  const span = (t1 - t0) / DAY
  const xt: { t: number; label: string }[] = []
  const d0 = new Date(t0)
  for (let d = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    xt.push({ t: d.getTime(), label: d.getMonth() === 0 || span > 400 ? `${d.getFullYear()}/${d.getMonth() + 1}` : `${d.getMonth() + 1}月` })
  }
  const maxTicks = Math.max(2, Math.floor(plotW / 56))
  const every = Math.ceil(xt.length / maxTicks)
  const xTicks = xt.filter((_, i) => i % every === 0)

  const pick = (mx: number, my: number) => {
    let best: { s: number; p: number; d: number } | null = null
    series.forEach((s, si) =>
      s.points.forEach((p, pi) => {
        const d = Math.hypot(x(p.t) - mx, (y(p.v) - my) * 0.5)
        if (!best || d < best.d) best = { s: si, p: pi, d }
      }),
    )
    setActive(best ? { s: (best as { s: number }).s, p: (best as { p: number }).p } : null)
  }
  const ap = active && series[active.s]?.points[active.p]
  const fmtV = (v: number) => `${v.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}${unit}`

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setActive(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={series.map((s) => s.name).join('・') + 'の単価の推移'}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            pick(e.clientX - r.left, e.clientY - r.top)
          }}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            pick(e.clientX - r.left, e.clientY - r.top)
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className={t === lo ? 'axis-base' : 'grid'} />
              <text x={padL - 6} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {axisYen(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t.t} x={x(t.t)} y={height - 6} className="tick" textAnchor="middle">
              {t.label}
            </text>
          ))}
          {ap && <line x1={x(ap.t)} x2={x(ap.t)} y1={padT} y2={padT + plotH} className="grid guide" />}
          {series.map((s) => (
            <g key={s.key}>
              {s.points.length > 1 && <polyline points={s.points.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />}
              {s.points.map((p, i) => (
                <circle key={i} cx={x(p.t)} cy={y(p.v)} r={s.points.length > 40 ? 2 : 3.5} fill={s.color} className="dot" />
              ))}
            </g>
          ))}
          {ap && active && <circle cx={x(ap.t)} cy={y(ap.v)} r={6} fill="none" stroke={series[active.s].color} strokeWidth={2} />}
        </svg>
      )}
      {ap && active && width > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(ap.t), 90), width - 90) }}>
          <div>
            <span className="cat-dot" style={{ background: series[active.s].color }} /> {series[active.s].name}
          </div>
          <div>
            {new Date(ap.t).toLocaleDateString('ja-JP')} <b>{fmtV(ap.v)}</b>
          </div>
          {ap.note && <div className="muted">{ap.note}</div>}
        </div>
      )}
    </div>
  )
}
