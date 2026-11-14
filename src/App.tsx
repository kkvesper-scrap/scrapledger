import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBook } from './lib/useBook'
import { kg, liveVendors, stamp, yen, type Slip } from './lib/model'
import { addDays, jpDate, parseYmd, ymd } from './lib/dates'
import { buildInfo, useNewerVersion, versionLabel } from './lib/version'
import { useSwipe } from './lib/useSwipe'
import SlipList, { slipsBetween, slipWeight } from './views/SlipList'
import SlipForm from './views/SlipForm'
import { MonthCalendar, WeekCalendar, YearCalendar } from './views/SlipCalendar'
import PriceView from './views/PriceView'
import SummaryView from './views/SummaryView'
import SettingsView, { type Theme } from './views/SettingsView'

type Tab = 'slips' | 'price' | 'summary' | 'settings'
const TABS: [Tab, string][] = [
  ['slips', '伝票'],
  ['price', '単価推移'],
  ['summary', '集計'],
  ['settings', '設定'],
]
const THEME = 'scrap.theme'
const TAB = 'scrap.tab'
const VENDOR = 'scrap.vendorFilter'
const VIEW = 'scrap.view'
const MODE = 'scrap.mode' // 一覧 / カレンダー
// 伝票の表示の範囲(家計簿のカレンダーと同じ 年・月・週・日)
type View = 'year' | 'month' | 'week' | 'day'
const VIEWS: [View, string][] = [
  ['year', '年'],
  ['month', '月'],
  ['week', '週'],
  ['day', '日'],
]

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

export default function App() {
  const api = useBook()
  const { book } = api
  const today = ymd(new Date())
  // 選んでいる日(年・月・週・日の表示の基準)
  const [sel, setSel] = useState(today)
  const [view, setViewState] = useState<View>(() => (VIEWS.some(([v]) => v === lsGet(VIEW)) ? (lsGet(VIEW) as View) : 'month'))
  const [mode, setModeState] = useState<'list' | 'calendar'>(() => (lsGet(MODE) === 'calendar' ? 'calendar' : 'list'))
  const setMode = (v: 'list' | 'calendar') => {
    setModeState(v)
    lsSet(MODE, v)
    setSlide('')
  }
  const setView = (v: View) => {
    setViewState(v)
    lsSet(VIEW, v)
    setSlide('')
  }
  const [tab, setTab] = useState<Tab>(() => (TABS.some(([t]) => t === lsGet(TAB)) ? (lsGet(TAB) as Tab) : 'slips'))
  const [form, setForm] = useState<{ date: string } | Slip | null>(null)
  // 画面は最初から暗い表示(ユーザーの希望)。設定で変えられる
  const [theme, setThemeState] = useState<Theme>(() => (lsGet(THEME) as Theme) || 'dark')
  const newer = useNewerVersion()
  const [vendorPick, setVendorPick] = useState(() => lsGet(VENDOR) ?? '')
  const vendors = useMemo(() => (book ? liveVendors(book) : []), [book])
  const vendor = vendors.some((v) => v.id === vendorPick) ? vendorPick : ''
  const pickVendor = (id: string) => {
    setVendorPick(id)
    lsSet(VENDOR, id)
  }

  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  const setTheme = (t: Theme) => {
    setThemeState(t)
    lsSet(THEME, t)
  }
  const go = (t: Tab) => {
    setTab(t)
    setSlide('')
    lsSet(TAB, t)
  }

  const ym = sel.slice(0, 7)
  const [y, m] = ym.split('-').map(Number)
  const selDate = parseYmd(sel)
  // 集計は年で見る。伝票は 年・月・週・日 を切り替える
  const pv: View = tab === 'summary' ? 'year' : view
  const weekStart = addDays(selDate, -((selDate.getDay() + 6) % 7)) // 週は月曜始まり
  const weekEnd = addDays(weekStart, 6)
  const range: [string, string] =
    pv === 'year' ? [`${y}-01-01`, `${y}-12-31`] : pv === 'month' ? [`${ym}-01`, `${ym}-31`] : pv === 'week' ? [ymd(weekStart), ymd(weekEnd)] : [sel, sel]
  const thisOr = (d: string) => (d.slice(0, 7) === today.slice(0, 7) ? today : d)
  const shift = (d: number) => {
    if (pv === 'year') setSel(thisOr(ymd(new Date(y + d, m - 1, 1))))
    else if (pv === 'month') setSel(thisOr(ymd(new Date(y, m - 1 + d, 1))))
    else setSel(ymd(addDays(selDate, d * (pv === 'week' ? 7 : 1))))
    setSlide(d > 0 ? 'next' : 'prev')
  }
  const goToday = () => {
    setSlide(sel < today ? 'next' : sel > today ? 'prev' : '')
    setSel(today)
  }
  const unit = { year: '年', month: '月', week: '週', day: '日' }[pv]
  const md = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`
  const navLabel =
    pv === 'year'
      ? `${y}年`
      : pv === 'month'
        ? `${y}年${m}月`
        : pv === 'week'
          ? // 短く: 今年なら年を省き、同じ月なら終わりは日だけ(例 11月9日〜15日)
            `${weekStart.getFullYear() !== Number(today.slice(0, 4)) || weekEnd.getFullYear() !== weekStart.getFullYear() ? `${weekStart.getFullYear()}年` : ''}${md(weekStart)}〜${
              weekEnd.getFullYear() !== weekStart.getFullYear() ? `${weekEnd.getFullYear()}年${md(weekEnd)}` : weekEnd.getMonth() === weekStart.getMonth() ? `${weekEnd.getDate()}日` : md(weekEnd)
            }`
          : jpDate(selDate)
  const periodName = { year: `${y}年`, month: `${m}月`, week: 'この週', day: 'この日' }[pv]
  const [slide, setSlide] = useState<'next' | 'prev' | ''>('')
  const hasNav = tab === 'slips' || tab === 'summary'
  // スマホ: 左右にスワイプで前後の期間へ
  const swipe = useSwipe((dir) => hasNav && shift(dir === 'left' ? 1 : -1))

  const periodSlips = useMemo(() => (book ? slipsBetween(book, range[0], range[1], vendor) : []), [book, range[0], range[1], vendor])
  const periodTotal = periodSlips.reduce((t, s) => t + s.total, 0)
  const periodWeight = Math.round(periodSlips.reduce((t, s) => t + slipWeight(s), 0) * 1000) / 1000

  const save = useCallback(
    (s: Slip) => {
      api.ensureLogin()
      api.update((b) => ({ ...b, slips: { ...b.slips, [s.id]: s } }))
      setSel(s.date)
    },
    [api],
  )
  const remove = useCallback(
    (s: Slip) => {
      api.ensureLogin()
      api.update((b) => ({ ...b, slips: { ...b.slips, [s.id]: { ...s, deleted: true, updatedAt: stamp() } } }))
    },
    [api],
  )

  // キーボード: N で新しい伝票(入力欄にいないとき)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (form || ev.ctrlKey || ev.metaKey || ev.altKey) return
      const t = ev.target as HTMLElement
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return
      if (ev.key === 'n' || ev.key === 'N') {
        ev.preventDefault()
        setForm({ date: today })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [form, today])

  if (!book) return <div className="loading">読み込み中…</div>

  const syncLabel =
    api.status === 'syncing'
      ? '同期中…'
      : api.status === 'error'
        ? '同期エラー'
        : !api.token
          ? api.dirty
            ? '未同期の変更あり'
            : api.status === 'idle'
              ? '同期する'
              : '未ログイン'
          : api.dirty
            ? '送信待ち'
            : '同期済み'

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">スクラップ買取帳</div>
        {hasNav && (
          <div className="month-nav">
            <button type="button" className="ghost small" onClick={() => shift(-1)} aria-label={`前の${unit}`}>
              ‹
            </button>
            <button type="button" className="ghost small month-label" onClick={goToday} title="今日に戻る">
              {navLabel}
            </button>
            <button type="button" className="ghost small" onClick={() => shift(1)} aria-label={`次の${unit}`}>
              ›
            </button>
          </div>
        )}
        {vendors.length > 1 && tab !== 'settings' && (
          <select className="ledger-select" value={vendor} onChange={(e) => pickVendor(e.target.value)} aria-label="業者で絞り込む">
            <option value="">全業者</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        <span className="spacer" />
        <button
          type="button"
          className={`sync-badge ${api.status} ${api.dirty ? 'dirty' : ''}`}
          onClick={() => (api.token ? api.sync() : api.login())}
          title={api.error || (api.syncedAt ? `最後の同期 ${new Date(api.syncedAt).toLocaleString('ja-JP')}` : '')}
        >
          {syncLabel}
        </button>
        <span className="version" title="ヴァージョン">
          {versionLabel}
        </span>
      </header>

      {newer && (
        <div className="banner">
          新しい版(ver {newer.version})が出ています。
          <button type="button" className="small" onClick={() => location.reload()}>
            再読み込み
          </button>
        </div>
      )}
      {!api.token && api.status === 'login' && (
        <div className="banner">
          入力はこのままできます(この端末に保存)。PC とスマホで同じデータを使うには Google にログインしてください。
          <button type="button" className="small" onClick={() => void api.login()}>
            ログイン
          </button>
        </div>
      )}
      {!api.token && api.status === 'idle' && (
        <div className="banner">
          ほかの端末で入力した分を読み込むには「同期」を押してください(伝票を保存したときも自動で同期します)。
          <button type="button" className="small" onClick={() => void api.login()}>
            同期
          </button>
        </div>
      )}
      {api.error && tab !== 'settings' && <div className="banner error">{api.error}</div>}
      {api.folder && api.folder.permission !== 'granted' && (
        <div className="banner">
          バックアップフォルダ「{api.folder.handle.name}」への保存が止まっています。
          <button type="button" className="small" onClick={api.resumeFolder}>
            許可して再開
          </button>
        </div>
      )}

      {tab === 'slips' && (
        <div className="cal-switch view-switch">
          <button type="button" className={`ghost small today-btn ${sel === today ? 'is-today' : ''}`} onClick={goToday}>
            今日
          </button>
          <div className="seg" role="tablist" aria-label="一覧かカレンダーか">
            {(
              [
                ['list', '一覧'],
                ['calendar', 'カレンダー'],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={mode === v} className={mode === v ? 'on' : ''} onClick={() => setMode(v)}>
                {label}
              </button>
            ))}
          </div>
          <div className="seg" role="tablist" aria-label="表示の範囲">
            {VIEWS.map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === 'slips' && (
        <div className="month-sum">
          <div>
            <span className="muted">{periodName}の買取金額</span>
            <b>{yen(periodTotal)}</b>
          </div>
          <div>
            <span className="muted">重量</span>
            <b>{kg(periodWeight)}</b>
          </div>
          <div>
            <span className="muted">伝票</span>
            <b>{periodSlips.length}枚</b>
          </div>
        </div>
      )}

      <main className="main" {...(hasNav ? swipe : {})}>
        <div key={hasNav ? `${tab}-${pv}-${range[0]}-${mode}` : tab} className={`slide ${slide}`}>
          {tab === 'slips' && (mode === 'list' || pv === 'day') && <SlipList book={book} slips={periodSlips} showYear={pv === 'year'} onEdit={setForm} />}
          {tab === 'slips' && mode === 'calendar' && pv === 'year' && (
            <YearCalendar
              year={y}
              slips={periodSlips}
              onPickDay={(d) => {
                setSel(d)
                setView('day')
              }}
              onPickMonth={(nym) => {
                setSel(thisOr(`${nym}-01`))
                setView('month')
              }}
            />
          )}
          {tab === 'slips' && mode === 'calendar' && pv === 'month' && (
            <MonthCalendar book={book} year={y} month0={m - 1} slips={periodSlips} selected={sel} onSelect={setSel} onEdit={setForm} onAdd={(date) => setForm({ date })} />
          )}
          {tab === 'slips' && mode === 'calendar' && pv === 'week' && (
            <WeekCalendar
              book={book}
              dates={Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))}
              slips={periodSlips}
              selected={sel}
              onPickDay={(d) => {
                setSel(d)
                setView('day')
              }}
              onEdit={setForm}
              onAdd={(date) => setForm({ date })}
            />
          )}
          {tab === 'price' && <PriceView book={book} vendor={vendor} />}
          {tab === 'summary' && (
            <SummaryView
              book={book}
              year={y}
              vendor={vendor}
              onOpenMonth={(nym) => {
                setSel(thisOr(`${nym}-01`))
                setView('month')
                go('slips')
              }}
            />
          )}
          {tab === 'settings' && <SettingsView api={api} book={book} theme={theme} setTheme={setTheme} />}
        </div>
        <p className="app-version">
          スクラップ買取帳 {versionLabel}({buildInfo.built} 公開)
        </p>
      </main>

      {tab === 'slips' && (
        <button type="button" className="fab" onClick={() => setForm({ date: pv === 'day' || (mode === 'calendar' && pv === 'month') ? sel : today })} title="新しい伝票(N キー)">
          ＋ 新しい伝票
        </button>
      )}

      <nav className="tabbar">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => go(t)}>
            {label}
          </button>
        ))}
      </nav>

      {form && <SlipForm key={'id' in form ? form.id : 'new'} book={book} initial={form} onSave={save} onDelete={remove} onClose={() => setForm(null)} update={api.update} />}
    </div>
  )
}
