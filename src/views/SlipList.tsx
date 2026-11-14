// 伝票の一覧(月ごと)。押すと修正できる
import { itemName, kg, liveSlips, memoLine, num, vendorName, yen, type Book, type Slip } from '../lib/model'
import { jpDate, parseYmd } from '../lib/dates'

interface Props {
  book: Book
  /** 2026-11 の形。'' なら全期間 */
  ym: string
  vendor: string // '' = すべて
  onEdit: (s: Slip) => void
}

export const slipWeight = (s: Slip) => Math.round(s.lines.reduce((t, l) => t + l.weight, 0) * 1000) / 1000

export function slipsOf(book: Book, prefix: string, vendor: string) {
  return liveSlips(book).filter((s) => s.date.startsWith(prefix) && (!vendor || s.vendorId === vendor))
}

export default function SlipList({ book, ym, vendor, onEdit }: Props) {
  const slips = slipsOf(book, ym, vendor)
  if (!slips.length) return <p className="muted empty-note">この月の伝票はありません。下の「＋ 新しい伝票」から入力してください。</p>
  return (
    <div className="slip-list">
      {slips.map((s) => (
        <button key={s.id} type="button" className="slip-card card" onClick={() => onEdit(s)}>
          <div className="slip-card-head">
            <span className="slip-date">{jpDate(parseYmd(s.date))}</span>
            <span className="slip-vendor">{vendorName(book, s)}</span>
            <span className="spacer" />
            <b className="slip-total-yen">{yen(s.total)}</b>
          </div>
          <table className="slip-table">
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.id}>
                  <td className="st-name">
                    <span className="cat-dot" style={{ background: book.items[l.itemId]?.color ?? '#888' }} />
                    {itemName(book, l)}
                  </td>
                  <td className="st-num">{kg(l.weight)}</td>
                  <td className="st-num">×{num(l.price)}円</td>
                  <td className="st-num st-amt">{yen(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="slip-card-foot muted">
            {s.lines.length}品目・{kg(slipWeight(s))}
            {s.firstWeight !== undefined && `・初回計量 ${kg(s.firstWeight)}`}
            {s.memo && <span className="slip-memo">・{memoLine(s.memo)}</span>}
          </div>
        </button>
      ))}
    </div>
  )
}
