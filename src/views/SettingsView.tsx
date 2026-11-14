import { useState } from 'react'
import type { BookApi } from '../lib/useBook'
import { canPickFolder, pickRoot } from '../lib/backup'
import { bookToCsv, downloadText } from '../lib/csv'
import { liveItems, liveSlips, liveVendors, mergeBooks, newId, parseBook, ROUNDING_LABEL, sameBook, settingsOf, sortBook, stamp, type Book, type Rounding } from '../lib/model'
import { ymd } from '../lib/dates'
import { buildInfo, useNewerVersion } from '../lib/version'
import { loadPickOrder, PICK_ORDER_LABEL, pickColor, savePickOrder, type PickOrder } from '../lib/usage'

export type Theme = 'auto' | 'light' | 'dark'

interface Props {
  api: BookApi
  book: Book
  theme: Theme
  setTheme: (t: Theme) => void
}

const fmt = (iso: string) => (iso ? new Date(iso).toLocaleString('ja-JP') : 'まだありません')

export default function SettingsView({ api, book, theme, setTheme }: Props) {
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const count = liveSlips(book).length
  const rounding = settingsOf(book).rounding

  const importJson = async (f: File) => {
    setMsg('')
    setErr('')
    try {
      const other = parseBook(await f.text())
      const merged = mergeBooks(book, other)
      if (sameBook(merged, book)) return setMsg('新しい内容はありませんでした(すべて取り込み済みです)')
      const added = liveSlips(merged).length - count
      if (!confirm(`「${f.name}」の内容を今のデータに合わせます(今の伝票は消えません)。\n伝票の増減: ${added >= 0 ? '+' : ''}${added}枚\nよろしいですか?`)) return
      api.update((b) => mergeBooks(b, other))
      setMsg('バックアップの内容を合わせました')
    } catch (e) {
      setErr(`読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const [order, setOrder] = useState(loadPickOrder)

  return (
    <div className="settings">
      <AboutCard />
      <section className="card">
        <h2>Google ドライブとの同期</h2>
        <p className="muted">
          データは、あなたの Google ドライブの「スクラップ買取帳」フォルダに保存し、PC とスマホで同じ内容を使います。このアプリはドライブの他のファイルは見られません。入力はネットにつながっていなくてもでき、つながったときに合わせます。
        </p>
        {api.token ? (
          <>
            <p>
              状態: <b>{api.status === 'syncing' ? '同期中…' : api.status === 'error' ? 'エラー' : 'ログイン中'}</b>
              {api.dirty && '(まだ送っていない変更があります)'}
            </p>
            <p className="muted">最後に同期した時刻: {fmt(api.syncedAt)}</p>
            <div className="btn-row">
              <button type="button" onClick={() => api.sync()}>
                今すぐ同期
              </button>
              <button type="button" className="ghost" onClick={api.logout}>
                ログアウト
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">最後に同期した時刻: {fmt(api.syncedAt)}</p>
            <button type="button" onClick={() => void api.login()}>
              Google にログインして同期
            </button>
          </>
        )}
        {api.error && <div className="msg error">{api.error}</div>}
      </section>

      <section className="card">
        <h2>金額の計算</h2>
        <p className="muted">重量 × 単価 の円未満の扱い(PC とスマホで共通)。すでに保存した伝票の金額は変わりません。</p>
        <div className="btn-row">
          {(Object.keys(ROUNDING_LABEL) as Rounding[]).map((r) => (
            <button
              key={r}
              type="button"
              className={rounding === r ? '' : 'ghost'}
              onClick={() => api.update((b) => ({ ...b, settings: { ...b.settings, main: { ...settingsOf(b), rounding: r, updatedAt: stamp() } } }))}
            >
              {ROUNDING_LABEL[r]}
            </button>
          ))}
        </div>
      </section>

      <ListEditor api={api} book={book} kind="items" />
      <ListEditor api={api} book={book} kind="vendors" />

      <section className="card">
        <h2>入力画面の並び順(この端末)</h2>
        <select
          value={order}
          onChange={(e) => {
            const v = e.target.value as PickOrder
            setOrder(v)
            savePickOrder(v)
          }}
        >
          {(Object.keys(PICK_ORDER_LABEL) as PickOrder[]).map((k) => (
            <option key={k} value={k}>
              {PICK_ORDER_LABEL[k]}
            </option>
          ))}
        </select>
        <p className="muted small-note">品目・業者の「検索・一覧」の並び順です。上に出るボタンは、いつも最近使った順です。</p>
      </section>

      <section className="card">
        <h2>バックアップフォルダ(PC)</h2>
        {canPickFolder() ? (
          <>
            <p className="muted">
              好きなフォルダ(PC・NAS・USB メモリなど)を選ぶと、変更のたびに自動で保存します。「最新」フォルダに最新の内容(.json と Excel で開ける .csv)、「履歴」フォルダに1日1ファイルの控えを残します。
            </p>
            {api.folder ? (
              <p>
                保存先: <b>{api.folder.handle.name}</b>
                {api.folder.permission !== 'granted' && <span className="error-text">(保存の許可が必要です)</span>}
                {api.backupAt && <span className="muted">(最後の保存 {api.backupAt})</span>}
              </p>
            ) : (
              <p>保存先: 未設定</p>
            )}
            <div className="btn-row">
              {api.folder && api.folder.permission !== 'granted' && (
                <button type="button" onClick={api.resumeFolder}>
                  保存を許可して再開
                </button>
              )}
              <button
                type="button"
                className={api.folder ? 'ghost' : ''}
                onClick={async () => {
                  try {
                    await api.chooseFolder(await pickRoot())
                  } catch (e) {
                    if (!(e instanceof DOMException && e.name === 'AbortError')) setErr(String(e))
                  }
                }}
              >
                {api.folder ? '保存先を変える' : '保存先のフォルダを選ぶ'}
              </button>
              {api.folder?.permission === 'granted' && (
                <button type="button" className="ghost" onClick={api.backupNow}>
                  今すぐ保存
                </button>
              )}
            </div>
            {api.backupError && <div className="msg error">{api.backupError}</div>}
          </>
        ) : (
          <p className="muted">フォルダへの自動バックアップは PC だけで行います。この端末のデータは Google ドライブに保存されています(手元に控えが必要なときは、下の「ファイルに書き出す」)。</p>
        )}
      </section>

      <section className="card">
        <h2>ファイルに書き出す・読み込む</h2>
        <p className="muted">伝票 {count}枚</p>
        <div className="btn-row">
          <button type="button" className="ghost" onClick={() => downloadText(`買取帳データ_${ymd(new Date())}.json`, JSON.stringify(sortBook(book), null, 1))}>
            バックアップ(.json)を書き出す
          </button>
          <button type="button" className="ghost" onClick={() => downloadText(`買取帳_明細_${ymd(new Date())}.csv`, bookToCsv(book), 'text/csv')}>
            Excel 用(.csv)を書き出す
          </button>
          <label className="file-btn ghost">
            バックアップ(.json)を読み込む
            <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
        </div>
        <p className="muted small-note">読み込みは「合わせる」だけで、今の伝票を消したり上書きで戻したりはしません。</p>
        {msg && <div className="msg ok">{msg}</div>}
        {err && <div className="msg error">{err}</div>}
      </section>

      <section className="card">
        <h2>表示</h2>
        <div className="btn-row">
          {(['dark', 'light', 'auto'] as Theme[]).map((t) => (
            <button key={t} type="button" className={theme === t ? '' : 'ghost'} onClick={() => setTheme(t)}>
              {t === 'auto' ? '端末に合わせる' : t === 'light' ? '明るい' : '暗い'}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/** 品目・業者の名前・並び順・隠す・削除(使っていなければ) */
function ListEditor({ api, book, kind }: { api: BookApi; book: Book; kind: 'items' | 'vendors' }) {
  const label = kind === 'items' ? '品目' : '業者'
  const [newName, setNewName] = useState('')
  const list = kind === 'items' ? liveItems(book) : liveVendors(book)
  const used = new Map<string, number>()
  for (const s of liveSlips(book)) {
    if (kind === 'vendors') used.set(s.vendorId, (used.get(s.vendorId) ?? 0) + 1)
    else for (const l of s.lines) used.set(l.itemId, (used.get(l.itemId) ?? 0) + 1)
  }

  const patch = (id: string, p: Record<string, unknown>) => api.update((b) => ({ ...b, [kind]: { ...b[kind], [id]: { ...b[kind][id], ...p, updatedAt: stamp() } } }))

  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    api.update((b) => {
      const m = { ...b[kind] } as Record<string, { order: number; updatedAt: number }>
      next.forEach((c, k) => {
        if (m[c.id].order !== k) m[c.id] = { ...m[c.id], order: k, updatedAt: stamp() }
      })
      return { ...b, [kind]: m }
    })
  }

  const add = () => {
    const name = newName.trim()
    if (!name) return
    if (list.some((c) => c.name === name)) return alert(`同じ名前の${label}があります`)
    const id = newId(kind === 'items' ? 'i' : 'v')
    api.update((b) =>
      kind === 'items'
        ? { ...b, items: { ...b.items, [id]: { id, name, color: pickColor(b), order: list.length, updatedAt: stamp() } } }
        : { ...b, vendors: { ...b.vendors, [id]: { id, name, order: list.length, updatedAt: stamp() } } },
    )
    setNewName('')
  }

  return (
    <section className="card">
      <h2>{label}</h2>
      <ul className="cat-edit">
        {list.map((c, i) => (
          <li key={c.id} className={c.hidden ? 'hidden-cat' : ''}>
            {'color' in c && <input type="color" value={String(c.color)} onChange={(e) => patch(c.id, { color: e.target.value })} aria-label="色" />}
            <input
              className="cat-name"
              defaultValue={c.name}
              key={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== c.name) patch(c.id, { name: v })
                else e.target.value = c.name
              }}
              aria-label="名前"
            />
            <span className="muted">{used.get(c.id) ?? 0}回</span>
            <button type="button" className="ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ">
              ↑
            </button>
            <button type="button" className="ghost small" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="下へ">
              ↓
            </button>
            <label className="check small-check">
              <input type="checkbox" checked={!!c.hidden} onChange={(e) => patch(c.id, { hidden: e.target.checked || undefined })} />
              隠す
            </label>
            {!used.get(c.id) && (
              <button type="button" className="ghost small" onClick={() => confirm(`「${c.name}」を削除しますか?`) && patch(c.id, { deleted: true })}>
                削除
              </button>
            )}
          </li>
        ))}
        {!list.length && <li className="muted">まだありません(伝票の入力画面からも追加できます)</li>}
      </ul>
      <p className="muted small-note">伝票で使った{label}は削除できません(「隠す」で入力画面に出さないようにできます)。名前を変えると、過去の伝票の表示も新しい名前になります。</p>
      <div className="btn-row">
        <input placeholder={`新しい${label}の名前`} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" onClick={add}>
          追加
        </button>
      </div>
    </section>
  )
}

/** ヴァージョンの表示(いま使っている版と、新しい版が出ているか) */
function AboutCard() {
  const newer = useNewerVersion()
  return (
    <section className="card about">
      <h2>このアプリについて</h2>
      <div className="about-version">
        スクラップ買取帳 <b>ver {buildInfo.version}</b>
      </div>
      <p className="muted">
        公開日 {buildInfo.built} ・ ビルド {buildInfo.commit}
      </p>
      {newer ? (
        <div className="msg error">
          新しい版(ver {newer.version}・{newer.built})が出ています。
          <button type="button" className="small" onClick={() => location.reload()}>
            再読み込みして更新
          </button>
        </div>
      ) : (
        <p className="muted small-note">新しい版が出ると、ここと画面上部にお知らせが出ます(再読み込みするだけで更新できます)。</p>
      )}
    </section>
  )
}
