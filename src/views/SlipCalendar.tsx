// 伝票のカレンダー表示(家計簿のカレンダーと同じ作り)。週は月曜始まり
// - 年: 12か月の小さなカレンダー。買取金額の多い日ほど濃い色。日を押すとその日、月を押すとその月へ
// - 月: 日ごとの買取金額と伝票の枚数。日を押すと横(スマホは下)にその日の伝票
// - 週: 7日分の伝票を並べる
import type { CSSProperties } from 'react'
import { WEEKDAYS, monthGrid, ymd } from '../lib/dates'
import { holidayName } from '../lib/holidays'
import { vendorName, yen, type Book, type Slip } from '../lib/model'
import SlipList from './SlipList'

export const WEEK_START = 1 // 月曜始まり

export interface DayTotal {
  total: number
  count: number
}

/** 日ごとの買取金額と枚数 */
export function dayTotals(slips: Slip[]): Map<string, DayTotal> {
  const m = new Map<string, DayTotal>()
  for (const s of slips) {
    const t = m.get(s.date) ?? { total: 0, count: 0 }
    t.total += s.total
    t.count++
    m.set(s.date, t)
  }
  return m
}

/** マスの中の短い金額(1万以上は「万」) */
const shortYen = (n: number) => (n >= 10_000 ? `${(Math.round(n / 1000) / 10).toLocaleString('ja-JP')}万` : n.toLocaleString('ja-JP'))

const heads = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + WEEK_START) % 7)
const tone = (d: Date) => (holidayName(d.getFullYear(), d.getMonth() + 1, d.getDate()) || d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : '')

// ---- 年 ----
export function YearCalendar({ year, slips, onPickDay, onPickMonth }: { year: number; slips: Slip[]; onPickDay: (d: string) => void; onPickMonth: (ym: string) => void }) {
  const today = ymd(new Date())
  const totals = dayTotals(slips)
  // 色の濃さの基準: その年の1日の金額の多い順で上から5%目あたり(飛び抜けた日に引っぱられないように)
  const vals = [...totals.values()].map((t) => t.total).sort((a, b) => b - a)
  const base = vals.length ? vals[Math.floor(vals.length * 0.05)] || 1 : 1
  return (
    <div className="cal-year">
      {Array.from({ length: 12 }, (_, month0) => {
        const ym = `${year}-${String(month0 + 1).padStart(2, '0')}`
        const grid = monthGrid(year, month0, WEEK_START).days
        const shown = grid[35].getMonth() !== month0 ? grid.slice(0, 35) : grid
        let sum = 0
        for (const [d, t] of totals) if (d.startsWith(ym)) sum += t.total
        return (
          <section key={ym} className="mini card">
            <button type="button" className="mini-title" onClick={() => onPickMonth(ym)} title="この月のカレンダーを開く">
              <b>{month0 + 1}月</b>
              <span className="mini-sum">{sum ? <span className="buy-amt">{shortYen(sum)}</span> : null}</span>
            </button>
            <div className="mini-grid">
              {heads.map((i) => (
                <div key={i} className={`mini-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
                  {WEEKDAYS[i]}
                </div>
              ))}
              {shown.map((d) => {
                const key = ymd(d)
                if (d.getMonth() !== month0) return <div key={key} />
                const t = totals.get(key)
                const hol = holidayName(d.getFullYear(), d.getMonth() + 1, d.getDate())
                const level = t ? Math.min(1, 0.25 + (0.75 * Math.sqrt(t.total)) / Math.sqrt(base)) : 0
                const cls = ['mini-day', tone(d), key === today && 'today', level && 'bought'].filter(Boolean).join(' ')
                const tip = [hol, t && `${t.count}枚 ${yen(t.total)}`].filter(Boolean).join('・')
                return (
                  <button key={key} type="button" className={cls} style={level ? ({ '--lv': `${Math.round(level * 75)}%` } as CSSProperties) : undefined} onClick={() => onPickDay(key)} title={tip}>
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      <p className="muted small-note cal-year-note">買取金額の多い日ほど色が濃くなります。日を押すとその日、月を押すとその月のカレンダーを開きます。</p>
    </div>
  )
}

// ---- 月 ----
export function MonthCalendar({
  book,
  year,
  month0,
  slips,
  selected,
  onSelect,
  onEdit,
  onAdd,
}: {
  book: Book
  year: number
  month0: number
  slips: Slip[]
  selected: string
  onSelect: (d: string) => void
  onEdit: (s: Slip) => void
  onAdd: (d: string) => void
}) {
  const grid = monthGrid(year, month0, WEEK_START).days
  const today = ymd(new Date())
  const totals = dayTotals(slips)
  const daySlips = slips.filter((s) => s.date === selected)
  const [sy, sm, sd] = selected.split('-').map(Number)
  const selDate = new Date(sy, sm - 1, sd)
  const selT = totals.get(selected)
  const hol = holidayName(sy, sm, sd)
  return (
    <div className="cal-layout">
      <div className="month">
        <div className="month-head">
          {heads.map((i) => (
            <div key={i} className={`wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
              {WEEKDAYS[i]}
            </div>
          ))}
        </div>
        <div className="month-grid">
          {grid.map((d) => {
            const key = ymd(d)
            const t = totals.get(key)
            const cls = ['cell', d.getMonth() !== month0 && 'other', key === today && 'today', key === selected && 'selected', tone(d)].filter(Boolean).join(' ')
            return (
              <button key={key} type="button" className={cls} onClick={() => onSelect(key)} onDoubleClick={() => onAdd(key)} title={holidayName(d.getFullYear(), d.getMonth() + 1, d.getDate())}>
                <span className="daynum">{d.getDate()}</span>
                {t && (
                  <>
                    <span className="amt buy-amt">{shortYen(t.total)}</span>
                    {t.count > 1 && <span className="amt muted">{t.count}枚</span>}
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <section className="day-panel card">
        <div className="day-head">
          <h2>
            {sm}月{sd}日({WEEKDAYS[selDate.getDay()]}){hol && <span className="hol-name">{hol}</span>}
          </h2>
          <button type="button" className="small" onClick={() => onAdd(selected)}>
            ＋ この日の伝票
          </button>
        </div>
        {selT && (
          <div className="day-sum">
            {selT.count}枚 <span className="buy-amt">{yen(selT.total)}</span>
          </div>
        )}
        {daySlips.length ? <SlipList key={selected} book={book} slips={daySlips} onEdit={onEdit} compact /> : <p className="muted">この日の伝票はありません</p>}
      </section>
    </div>
  )
}

// ---- 週 ----
export function WeekCalendar({ book, dates, slips, selected, onPickDay, onEdit, onAdd }: { book: Book; dates: Date[]; slips: Slip[]; selected: string; onPickDay: (d: string) => void; onEdit: (s: Slip) => void; onAdd: (d: string) => void }) {
  const today = ymd(new Date())
  const totals = dayTotals(slips)
  return (
    <div className="week">
      {dates.map((d) => {
        const key = ymd(d)
        const hol = holidayName(d.getFullYear(), d.getMonth() + 1, d.getDate())
        const t = totals.get(key)
        const list = slips.filter((s) => s.date === key)
        return (
          <section key={key} className={`week-day card ${key === today ? 'today' : ''} ${key === selected ? 'selected' : ''}`}>
            <button type="button" className={`week-head ${tone(d)}`} onClick={() => onPickDay(key)} title="この日を開く">
              <span className="week-date">
                <span className="daynum">{d.getDate()}</span>
                <span className="week-wd">
                  {d.getMonth() + 1}月・{WEEKDAYS[d.getDay()]}
                </span>
              </span>
              {hol && <span className="hol-name">{hol}</span>}
            </button>
            <div className="week-sum">{t ? <span className="buy-amt">{yen(t.total)}</span> : null}</div>
            <ul className="week-entries">
              {list.map((s) => (
                <li key={s.id}>
                  <button type="button" className="week-entry" onClick={() => onEdit(s)} title={`${vendorName(book, s)}・${s.lines.length}品目\n押すと伝票を直せます`}>
                    <span className="week-entry-cat">
                      <span className="week-entry-name">{vendorName(book, s)}</span>
                    </span>
                    <span className="week-entry-memo">{s.lines.length}品目</span>
                    <span className="week-entry-amt">{yen(s.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="ghost small week-add" onClick={() => onAdd(key)} title="この日の伝票を入力">
              ＋
            </button>
          </section>
        )
      })}
    </div>
  )
}
