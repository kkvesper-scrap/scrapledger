import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBook } from './lib/useBook'
import { kg, liveVendors, stamp, yen, type Slip } from './lib/model'
import { ymd } from './lib/dates'
import { buildInfo, useNewerVersion, versionLabel } from './lib/version'
import { useSwipe } from './lib/useSwipe'
import SlipList, { slipsOf, slipWeight } from './views/SlipList'
import SlipForm from './views/SlipForm'
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
  const [ym, setYm] = useState(today.slice(0, 7))
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

  const [y, m] = ym.split('-').map(Number)
  const byYear = tab === 'summary'
  const shift = (d: number) => {
    const nd = byYear ? new Date(y + d, m - 1, 1) : new Date(y, m - 1 + d, 1)
    setYm(ymd(nd).slice(0, 7))
    setSlide(d > 0 ? 'next' : 'prev')
  }
  const [slide, setSlide] = useState<'next' | 'prev' | ''>('')
  const hasNav = tab === 'slips' || tab === 'summary'
  // スマホ: 左右にスワイプで月(集計では年)を移す
  const swipe = useSwipe((dir) => hasNav && shift(dir === 'left' ? 1 : -1))

  const monthSlips = useMemo(() => (book ? slipsOf(book, ym, vendor) : []), [book, ym, vendor])
  const monthTotal = monthSlips.reduce((t, s) => t + s.total, 0)
  const monthWeight = Math.round(monthSlips.reduce((t, s) => t + slipWeight(s), 0) * 1000) / 1000

  const save = useCallback(
    (s: Slip) => {
      api.ensureLogin()
      api.update((b) => ({ ...b, slips: { ...b.slips, [s.id]: s } }))
      setYm(s.date.slice(0, 7))
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
            <button type="button" className="ghost small" onClick={() => shift(-1)} aria-label={byYear ? '前の年' : '前の月'}>
              ‹
            </button>
            <button type="button" className="ghost small month-label" onClick={() => setYm(today.slice(0, 7))} title={byYear ? '今年に戻る' : '今月に戻る'}>
              {byYear ? `${y}年` : `${y}年${m}月`}
            </button>
            <button type="button" className="ghost small" onClick={() => shift(1)} aria-label={byYear ? '次の年' : '次の月'}>
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
        <div className="month-sum">
          <div>
            <span className="muted">{m}月の買取金額</span>
            <b>{yen(monthTotal)}</b>
          </div>
          <div>
            <span className="muted">重量</span>
            <b>{kg(monthWeight)}</b>
          </div>
          <div>
            <span className="muted">伝票</span>
            <b>{monthSlips.length}枚</b>
          </div>
        </div>
      )}

      <main className="main" {...(hasNav ? swipe : {})}>
        <div key={hasNav ? `${tab}-${byYear ? y : ym}` : tab} className={`slide ${slide}`}>
          {tab === 'slips' && <SlipList book={book} ym={ym} vendor={vendor} onEdit={setForm} />}
          {tab === 'price' && <PriceView book={book} vendor={vendor} />}
          {tab === 'summary' && (
            <SummaryView
              book={book}
              year={y}
              vendor={vendor}
              onOpenMonth={(nym) => {
                setYm(nym)
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
        <button type="button" className="fab" onClick={() => setForm({ date: today })} title="新しい伝票(N キー)">
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
