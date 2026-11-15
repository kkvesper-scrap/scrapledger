// 集計: 年(月ごとの棒グラフ)と月(日ごとの棒グラフ・伝票の明細)。品目別・業者別の重量・金額・平均単価
import { useMemo } from 'react'
import { kg, liveItems, num, yen, type Book, type Slip } from '../lib/model'
import { BarChart } from './charts'
import SlipList, { slipsBetween, slipsOf, slipWeight } from './SlipList'
import NameCell from './NameCell'

interface Props {
  book: Book
  year: number
  /** 1〜12 を渡すとその月の集計(詳細)、無ければ年の集計 */
  month?: number
  vendor: string
  /** 年の棒グラフで月を押したとき */
  onPickMonth: (ym: string) => void
  /** 月の集計で「伝票の画面で見る」 */
  onOpenSlips: (ym: string) => void
  onEdit: (s: Slip) => void
}

const round3 = (n: number) => Math.round(n * 1000) / 1000
const pad2 = (n: number) => String(n).padStart(2, '0')

export default function SummaryView({ book, year, month, vendor, onPickMonth, onOpenSlips, onEdit }: Props) {
  const ym = month ? `${year}-${pad2(month)}` : ''
  const days = month ? new Date(year, month, 0).getDate() : 0
  const slips = useMemo(
    () => (month ? slipsBetween(book, `${ym}-01`, `${ym}-31`, vendor) : slipsOf(book, `${year}-`, vendor)),
    [book, year, month, ym, vendor],
  )
  // 年: 12か月、月: その月の日ごと
  const buckets = month
    ? Array.from({ length: days }, (_, i) => `${ym}-${pad2(i + 1)}`)
    : Array.from({ length: 12 }, (_, i) => `${year}-${pad2(i + 1)}`)
  const bars = buckets.map((key) => {
    const list = slips.filter((s) => s.date.startsWith(key))
    return { key, total: list.reduce((t, s) => t + s.total, 0), weight: round3(list.reduce((t, s) => t + slipWeight(s), 0)), count: list.length }
  })
  const total = slips.reduce((t, s) => t + s.total, 0)
  const weight = round3(slips.reduce((t, s) => t + slipWeight(s), 0))

  // 前の月(月の集計で比べる)
  const prevTotal = useMemo(() => {
    if (!month) return null
    const d = new Date(year, month - 2, 1)
    const p = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
    return slipsBetween(book, `${p}-01`, `${p}-31`, vendor).reduce((t, s) => t + s.total, 0)
  }, [book, year, month, vendor])

  const byItem = useMemo(() => {
    const m = new Map<string, { weight: number; amount: number; n: number; min: number; max: number }>()
    for (const s of slips)
      for (const l of s.lines) {
        const x = m.get(l.itemId) ?? { weight: 0, amount: 0, n: 0, min: Infinity, max: -Infinity }
        x.weight += l.weight
        x.amount += l.amount
        x.n++
        if (l.weight > 0) {
          x.min = Math.min(x.min, l.price)
          x.max = Math.max(x.max, l.price)
        }
        m.set(l.itemId, x)
      }
    const order = new Map(liveItems(book).map((it, i) => [it.id, i]))
    return [...m].sort((a, b) => b[1].amount - a[1].amount || (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
  }, [book, slips])

  const byVendor = useMemo(() => {
    const m = new Map<string, { amount: number; weight: number; n: number; name: string }>()
    for (const s of slips) {
      const x = m.get(s.vendorId) ?? { amount: 0, weight: 0, n: 0, name: book.vendors[s.vendorId]?.name ?? s.vendorName }
      x.amount += s.total
      x.weight += slipWeight(s)
      x.n++
      m.set(s.vendorId, x)
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount)
  }, [book, slips])

  const now = new Date()
  const highlight = month
    ? now.getFullYear() === year && now.getMonth() + 1 === month
      ? now.getDate() - 1
      : undefined
    : now.getFullYear() === year
      ? now.getMonth()
      : undefined
  const label = month ? `${month}月` : `${year}年`
  const diff = prevTotal === null ? null : total - prevTotal

  return (
    <div className="graph-layout">
      <div className="month-sum">
        <div>
          <span className="muted">{label}の買取金額</span>
          <b>{yen(total)}</b>
          {diff !== null && prevTotal! > 0 && (
            <span className={`tiny-note ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'muted'}`}>
              前月比 {diff > 0 ? '▲' : diff < 0 ? '▼' : '±'}
              {yen(Math.abs(diff))}
            </span>
          )}
        </div>
        <div>
          <span className="muted">重量</span>
          <b>{kg(weight)}</b>
        </div>
        <div>
          <span className="muted">伝票</span>
          <b>{slips.length}枚</b>
        </div>
      </div>

      <section className="card">
        <h2>{month ? '日ごとの買取金額' : '月ごとの買取金額'}</h2>
        <BarChart
          labels={bars.map((_, i) => (month ? String(i + 1) : `${i + 1}月`))}
          series={[{ key: 'total', name: '買取金額', color: '#2fa89a', values: bars.map((b) => b.total) }]}
          highlight={highlight}
          tooltip={(i) => (
            <>
              <div>
                <b>{month ? `${month}月${i + 1}日` : `${i + 1}月`}</b> {yen(bars[i].total)}
              </div>
              <div className="muted">
                {kg(bars[i].weight)}・伝票{bars[i].count}枚
              </div>
              {!month && <div className="chart-tip-hint">押すとこの月の集計</div>}
            </>
          )}
          onPick={month ? undefined : (i) => onPickMonth(bars[i].key)}
        />
        {!month && <p className="muted small-note">棒を押すと、その月の集計(詳細)を開きます。</p>}
      </section>

      <section className="card">
        <h2>品目別</h2>
        {byItem.length ? (
          <table className="price-table sum-table">
            <thead>
              <tr className="muted">
                <th>品目</th>
                <th>重量</th>
                <th>金額</th>
                <th>平均単価</th>
              </tr>
            </thead>
            <tbody>
              {byItem.map(([id, x]) => {
                const it = book.items[id]
                return (
                  <tr key={id}>
                    <NameCell name={it?.name ?? '(消した品目)'} color={it?.color ?? '#888'} />
                    <td className="st-num">{kg(round3(x.weight))}</td>
                    <td className="st-num">{yen(x.amount)}</td>
                    <td className="st-num">
                      {x.weight > 0 ? `${num(Math.round((x.amount / x.weight) * 100) / 100)}円` : '—'}
                      {month && x.min < x.max && (
                        <div className="muted tiny-note">
                          {num(x.min)}〜{num(x.max)}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">この{month ? '月' : '年'}の伝票はありません。</p>
        )}
        <p className="muted small-note">
          平均単価 = 金額の合計 ÷ 重量の合計{month ? '。下の小さい数字は、この月の単価の最安〜最高' : ''}
        </p>
      </section>

      {(byVendor.length > 1 || (month && byVendor.length > 0)) && (
        <section className="card">
          <h2>業者別</h2>
          <table className="price-table sum-table">
            <tbody>
              {byVendor.map((v) => (
                <tr key={v.name}>
                  <NameCell name={v.name} />
                  <td className="st-num">{v.n}枚</td>
                  {month && <td className="st-num">{kg(round3(v.weight))}</td>}
                  <td className="st-num">{yen(v.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {month && slips.length > 0 && (
        <section className="card sum-slips">
          <div className="graph-head">
            <h2>伝票の明細({slips.length}枚)</h2>
            <button type="button" className="ghost small" onClick={() => onOpenSlips(ym)}>
              伝票の画面で見る
            </button>
          </div>
          <SlipList book={book} slips={slips} onEdit={onEdit} />
        </section>
      )}
    </div>
  )
}
