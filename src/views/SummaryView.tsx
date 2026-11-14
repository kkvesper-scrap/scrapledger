// 集計(年): 月ごとの買取金額の棒グラフと、品目別・業者別の重量・金額・平均単価
import { useMemo } from 'react'
import { kg, liveItems, num, yen, type Book } from '../lib/model'
import { BarChart } from './charts'
import { slipsOf, slipWeight } from './SlipList'

interface Props {
  book: Book
  year: number
  vendor: string
  onOpenMonth: (ym: string) => void
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

export default function SummaryView({ book, year, vendor, onOpenMonth }: Props) {
  const slips = useMemo(() => slipsOf(book, `${year}-`, vendor), [book, year, vendor])
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    const list = slips.filter((s) => s.date.startsWith(key))
    return { key, total: list.reduce((t, s) => t + s.total, 0), weight: round3(list.reduce((t, s) => t + slipWeight(s), 0)), count: list.length }
  })
  const total = slips.reduce((t, s) => t + s.total, 0)

  const byItem = useMemo(() => {
    const m = new Map<string, { weight: number; amount: number; n: number }>()
    for (const s of slips)
      for (const l of s.lines) {
        const x = m.get(l.itemId) ?? { weight: 0, amount: 0, n: 0 }
        x.weight += l.weight
        x.amount += l.amount
        x.n++
        m.set(l.itemId, x)
      }
    const order = new Map(liveItems(book).map((it, i) => [it.id, i]))
    return [...m].sort((a, b) => b[1].amount - a[1].amount || (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
  }, [book, slips])

  const byVendor = useMemo(() => {
    const m = new Map<string, { amount: number; n: number; name: string }>()
    for (const s of slips) {
      const x = m.get(s.vendorId) ?? { amount: 0, n: 0, name: book.vendors[s.vendorId]?.name ?? s.vendorName }
      x.amount += s.total
      x.n++
      m.set(s.vendorId, x)
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount)
  }, [book, slips])

  const thisMonth = new Date().getFullYear() === year ? new Date().getMonth() : undefined

  return (
    <div className="graph-layout">
      <div className="month-sum">
        <div>
          <span className="muted">{year}年の買取金額</span>
          <b>{yen(total)}</b>
        </div>
        <div>
          <span className="muted">重量</span>
          <b>{kg(round3(months.reduce((t, m) => t + m.weight, 0)))}</b>
        </div>
        <div>
          <span className="muted">伝票</span>
          <b>{slips.length}枚</b>
        </div>
      </div>

      <section className="card">
        <h2>月ごとの買取金額</h2>
        <BarChart
          labels={months.map((_, i) => `${i + 1}月`)}
          series={[{ key: 'total', name: '買取金額', color: '#2fa89a', values: months.map((m) => m.total) }]}
          highlight={thisMonth}
          tooltip={(i) => (
            <>
              <div>
                <b>{i + 1}月</b> {yen(months[i].total)}
              </div>
              <div className="muted">
                {kg(months[i].weight)}・伝票{months[i].count}枚
              </div>
            </>
          )}
          onPick={(i) => onOpenMonth(months[i].key)}
        />
      </section>

      <section className="card">
        <h2>品目別</h2>
        {byItem.length ? (
          <table className="price-table">
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
                    <td className="ct-name">
                      <span className="cat-dot" style={{ background: it?.color ?? '#888' }} /> {it?.name ?? '(消した品目)'}
                    </td>
                    <td className="st-num">{kg(round3(x.weight))}</td>
                    <td className="st-num">{yen(x.amount)}</td>
                    <td className="st-num">{x.weight > 0 ? `${num(Math.round((x.amount / x.weight) * 100) / 100)}円` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">この年の伝票はありません。</p>
        )}
        <p className="muted small-note">平均単価 = 金額の合計 ÷ 重量の合計</p>
      </section>

      {byVendor.length > 1 && (
        <section className="card">
          <h2>業者別</h2>
          <table className="price-table">
            <tbody>
              {byVendor.map((v) => (
                <tr key={v.name}>
                  <td>{v.name}</td>
                  <td className="st-num">{v.n}枚</td>
                  <td className="st-num">{yen(v.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
