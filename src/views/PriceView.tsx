// 単価の推移: 品目ごとの最新の単価・前回との差・期間内の最安/最高と、折れ線グラフ
import { useMemo, useState } from 'react'
import { liveItems, num, priceHistory, type Book } from '../lib/model'
import { parseYmd } from '../lib/dates'
import { LineChart, type LineSeries } from './charts'
import { itemUse } from '../lib/usage'

type Period = '3m' | '6m' | '1y' | 'all'
const PERIODS: [Period, string][] = [
  ['3m', '3か月'],
  ['6m', '半年'],
  ['1y', '1年'],
  ['all', '全期間'],
]
const PERIOD_KEY = 'scrap.pricePeriod'
const PICK_KEY = 'scrap.priceItems'

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* 無視 */
  }
}

const sinceOf = (p: Period) => {
  const d = new Date()
  if (p === '3m') d.setMonth(d.getMonth() - 3)
  else if (p === '6m') d.setMonth(d.getMonth() - 6)
  else if (p === '1y') d.setFullYear(d.getFullYear() - 1)
  else return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function PriceView({ book, vendor }: { book: Book; vendor: string }) {
  const [period, setPeriodState] = useState<Period>(() => (PERIODS.some(([k]) => k === lsGet(PERIOD_KEY)) ? (lsGet(PERIOD_KEY) as Period) : '1y'))
  const setPeriod = (p: Period) => (setPeriodState(p), lsSet(PERIOD_KEY, p))
  const hist = useMemo(() => priceHistory(book, vendor || undefined), [book, vendor])
  const since = sinceOf(period)
  const use = useMemo(() => itemUse(book), [book])

  // 単価の記録がある品目(よく使う順)
  const rows = useMemo(
    () =>
      liveItems(book)
        .filter((it) => hist.has(it.id))
        .sort((a, b) => (use.get(b.id)?.count ?? 0) - (use.get(a.id)?.count ?? 0))
        .map((it) => {
          const all = hist.get(it.id)!
          const inPeriod = all.filter((p) => p.date >= since)
          const last = all[all.length - 1]
          const prev = all[all.length - 2]
          const prices = inPeriod.map((p) => p.price)
          return { it, all, inPeriod, last, prev, min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null }
        }),
    [book, hist, since, use],
  )

  const [picked, setPickedState] = useState<string[]>(() => {
    try {
      const v = JSON.parse(lsGet(PICK_KEY) ?? 'null')
      if (Array.isArray(v)) return v
    } catch {
      /* 無視 */
    }
    return []
  })
  // 選んでいなければ、よく使う上位3品目
  const shown = picked.filter((id) => rows.some((r) => r.it.id === id))
  const active = shown.length ? shown : rows.slice(0, 3).map((r) => r.it.id)
  const toggle = (id: string) => {
    const next = active.includes(id) ? active.filter((x) => x !== id) : [...active, id]
    setPickedState(next)
    lsSet(PICK_KEY, JSON.stringify(next))
  }

  const series: LineSeries[] = rows
    .filter((r) => active.includes(r.it.id))
    .map((r) => ({
      key: r.it.id,
      name: r.it.name,
      color: r.it.color,
      points: r.inPeriod.map((p) => ({ t: parseYmd(p.date).getTime(), v: p.price, note: `${book.vendors[p.vendorId]?.name ?? ''}・${num(p.weight)}kg` })),
    }))
    .filter((s) => s.points.length)

  if (!rows.length) return <p className="muted empty-note">単価の記録はまだありません。伝票を入力すると、品目ごとの単価の推移がここに出ます。</p>

  return (
    <div className="graph-layout">
      <section className="card">
        <div className="graph-head">
          <h2>単価の推移(円/kg)</h2>
          <div className="seg" role="tablist" aria-label="期間">
            {PERIODS.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={period === k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {series.length ? <LineChart series={series} /> : <p className="muted">この期間に選んだ品目の記録はありません。</p>}
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <span className="cat-dot" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
        <p className="muted small-note">下の表で品目を押すと、グラフに出す・出さないを切り替えられます。</p>
      </section>

      <section className="card">
        <h2>品目ごとの単価</h2>
        <table className="price-table">
          <thead>
            <tr className="muted">
              <th></th>
              <th>品目</th>
              <th>最新</th>
              <th>前回比</th>
              <th>期間の最安〜最高</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.prev ? Math.round((r.last.price - r.prev.price) * 100) / 100 : null
              const on = active.includes(r.it.id)
              return (
                <tr key={r.it.id} className={on ? 'on' : ''} onClick={() => toggle(r.it.id)}>
                  <td>
                    <input type="checkbox" checked={on} readOnly aria-label={`${r.it.name}をグラフに出す`} />
                  </td>
                  <td className="pt-name">
                    <span className="cat-dot" style={{ background: r.it.color }} />
                    <span className="pt-name-text">{r.it.name}</span>
                  </td>
                  <td className="st-num">
                    <b>{num(r.last.price)}円</b>
                    <div className="muted tiny-note">{r.last.date.replaceAll('-', '/')}</div>
                  </td>
                  <td className="st-num">{diff === null ? '—' : diff === 0 ? '±0' : <span className={diff > 0 ? 'up' : 'down'}>{diff > 0 ? `▲${num(diff)}` : `▼${num(-diff)}`}</span>}</td>
                  <td className="st-num">
                    {r.min === null ? '—' : r.min === r.max ? `${num(r.min)}円` : (
                      <>
                        <span className="pt-range">{num(r.min)}〜</span>
                        <span className="pt-range">{num(r.max!)}円</span>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
