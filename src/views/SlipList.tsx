// 伝票の一覧(月ごと)。伝票ごとに折りたたみ(日付・業者・品目数・合計の1行)、押すと開く。
// 開いた中の「この伝票を直す」で入力画面へ
import { Fragment, useState } from 'react'
import { itemName, kg, liveSlips, num, vendorName, yen, type Book, type Slip } from '../lib/model'
import { WEEKDAYS, parseYmd } from '../lib/dates'

interface Props {
  book: Book
  /** 表示する伝票(新しい順) */
  slips: Slip[]
  /** 年の表示のときは月ごとに見出しを付ける */
  showYear?: boolean
  /** カレンダーの横に出すとき(上の「すべて開く」を出さない) */
  compact?: boolean
  onEdit: (s: Slip) => void
}

export const slipWeight = (s: Slip) => Math.round(s.lines.reduce((t, l) => t + l.weight, 0) * 1000) / 1000

/** from〜to(2026-11-01 の形、両端を含む)の伝票。vendor '' はすべての業者 */
export function slipsBetween(book: Book, from: string, to: string, vendor: string) {
  return liveSlips(book).filter((s) => s.date >= from && s.date <= to && (!vendor || s.vendorId === vendor))
}

export function slipsOf(book: Book, prefix: string, vendor: string) {
  return liveSlips(book).filter((s) => s.date.startsWith(prefix) && (!vendor || s.vendorId === vendor))
}

const shortDate = (ymd: string) => {
  const d = parseYmd(ymd)
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`
}

export default function SlipList({ book, slips, showYear, compact, onEdit }: Props) {
  // 開いている伝票(最初はすべて閉じる。月を移すと閉じた状態から)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  if (!slips.length) return <p className="muted empty-note">この期間の伝票はありません。下の「＋ 新しい伝票」から入力してください。</p>
  const allOpen = slips.every((s) => open.has(s.id))

  return (
    <div className="slip-list">
      {!compact && (
      <div className="slip-list-tools">
        <span className="muted">伝票を押すと中身が開きます</span>
        <span className="spacer" />
        <button type="button" className="ghost small" onClick={() => setOpen(allOpen ? new Set() : new Set(slips.map((s) => s.id)))}>
          {allOpen ? 'すべて閉じる' : 'すべて開く'}
        </button>
      </div>
      )}
      {slips.map((s, i) => {
        const isOpen = open.has(s.id)
        const ymKey = s.date.slice(0, 7)
        const monthHead = showYear && (i === 0 || slips[i - 1].date.slice(0, 7) !== ymKey)
        const monthList = monthHead ? slips.filter((x) => x.date.slice(0, 7) === ymKey) : []
        return (
          <Fragment key={s.id}>
          {monthHead && (
            <div className="slip-month-head">
              <b>{Number(s.date.slice(5, 7))}月</b>
              <span className="muted">
                {monthList.length}枚・{yen(monthList.reduce((t, x) => t + x.total, 0))}
              </span>
            </div>
          )}
          <div className={`slip-item ${isOpen ? 'open' : ''}`}>
            <button type="button" className="slip-row" onClick={() => toggle(s.id)} aria-expanded={isOpen}>
              <span className="slip-caret" aria-hidden="true">
                {isOpen ? '▾' : '▸'}
              </span>
              <span className="slip-date">{shortDate(s.date)}</span>
              <span className="slip-vendor">{vendorName(book, s)}</span>
              <span className="slip-count muted">{s.lines.length}品目</span>
              <b className="slip-total-yen">{yen(s.total)}</b>
            </button>
            {isOpen && (
              <div className="slip-body">
                <table className="slip-table">
                  <thead>
                    <tr className="muted">
                      <th>品目</th>
                      <th>重量</th>
                      <th>単価</th>
                      <th>金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="st-name">
                          <span className="cat-dot" style={{ background: book.items[l.itemId]?.color ?? '#888' }} />
                          {itemName(book, l)}
                        </td>
                        <td className="st-num">{kg(l.weight)}</td>
                        <td className="st-num">{num(l.price)}円</td>
                        <td className="st-num st-amt">{yen(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="muted">合計</td>
                      <td className="st-num">{kg(slipWeight(s))}</td>
                      <td></td>
                      <td className="st-num st-amt">{yen(s.total)}</td>
                    </tr>
                  </tfoot>
                </table>
                {s.firstWeight !== undefined && <div className="muted slip-note">初回計量重量 {kg(s.firstWeight)}</div>}
                {s.memo && <div className="slip-note slip-memo">{s.memo}</div>}
                <div className="btn-row slip-actions">
                  <button type="button" className="ghost small" onClick={() => onEdit(s)}>
                    ✎ この伝票を直す
                  </button>
                </div>
              </div>
            )}
          </div>
          </Fragment>
        )
      })}
    </div>
  )
}
