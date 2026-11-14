// 伝票の入力・修正(1回の登録 = 1枚の伝票)
// 品目ごとに 重量 × 単価 = 金額、その総合計を出す。単価は前回の値(同じ業者を優先)を最初から入れておく
import { useEffect, useMemo, useRef, useState } from 'react'
import { evalNumber, kg, lastPrice, lineAmount, liveItems, liveSlips, liveVendors, newId, normalizeName, num, settingsOf, stamp, yen, type Book, type Line, type Slip } from '../lib/model'
import { addDays, jpDate, parseYmd, ymd } from '../lib/dates'
import { itemUse, loadPickOrder, pickColor, recentOf, sortByOrder, vendorUse } from '../lib/usage'
import { useBackClose } from '../lib/useBackClose'
import NamePicker, { PickerDialog } from './NamePicker'

interface Props {
  book: Book
  /** 新規なら日付だけ。修正なら元の伝票 */
  initial: { date: string } | Slip
  onSave: (s: Slip) => void
  onDelete: (s: Slip) => void
  onClose: () => void
  update: (fn: (b: Book) => Book) => void
}

interface Row {
  key: string
  itemId: string
  scale: string // 計量重量(差し引きを使うとき)
  weight: string
  price: string
  priceTouched: boolean // 自分で単価を入れた(業者を変えても前回の単価で上書きしない)
}

const isSlip = (x: Props['initial']): x is Slip => 'id' in x
const LAST_VENDOR = 'scrap.lastVendor'
const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}
const str = (n: number | undefined) => (n === undefined ? '' : String(n))

export default function SlipForm({ book, initial, onSave, onDelete, onClose, update }: Props) {
  const editing = isSlip(initial) ? initial : null
  useBackClose(onClose) // スマホの「戻る」で閉じる
  const rounding = settingsOf(book).rounding
  const [order] = useState(loadPickOrder)

  const vUse = useMemo(() => vendorUse(book), [book])
  const vendors = useMemo(() => sortByOrder(liveVendors(book), order, vUse), [book, order, vUse])
  const recentVendors = useMemo(() => recentOf(vendors.filter((v) => !v.hidden), vUse, 6), [vendors, vUse])
  const iUse = useMemo(() => itemUse(book), [book])
  const items = useMemo(() => sortByOrder(liveItems(book), order, iUse), [book, order, iUse])

  const [date, setDate] = useState(initial.date)
  const [vendorId, setVendorId] = useState(() => {
    if (editing) return editing.vendorId
    const last = lsGet(LAST_VENDOR)
    return book.vendors[last] && !book.vendors[last].deleted ? last : (recentVendors[0]?.id ?? '')
  })
  const [useScale, setUseScale] = useState(editing ? editing.firstWeight !== undefined : false)
  const [first, setFirst] = useState(str(editing?.firstWeight))
  const [rows, setRows] = useState<Row[]>(() =>
    editing ? editing.lines.map((l) => ({ key: l.id, itemId: l.itemId, scale: str(l.scale), weight: str(l.weight), price: str(l.price), priceTouched: true })) : [],
  )
  const [memo, setMemo] = useState(editing?.memo ?? '')
  const [err, setErr] = useState('')
  const [picking, setPicking] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const focusKey = useRef('')

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 品目を足したら、その行の重量の欄へ
  useEffect(() => {
    if (!focusKey.current) return
    formRef.current?.querySelector<HTMLInputElement>(`[data-row="${focusKey.current}"] input.num-in:not([readonly])`)?.focus()
    focusKey.current = ''
  }, [rows])

  const prevPrice = (itemId: string) => lastPrice(book, itemId, vendorId, editing?.id)

  // 業者を変えたら、自分で入れていない単価はその業者での前回の単価にする
  const changeVendor = (id: string) => {
    setVendorId(id)
    setErr('')
    setRows((rs) =>
      rs.map((r) => {
        if (r.priceTouched) return r
        const p = lastPrice(book, r.itemId, id, editing?.id)
        return { ...r, price: p ? String(p.price) : '' }
      }),
    )
  }

  const addRow = (itemId: string) => {
    if (rows.some((r) => r.itemId === itemId)) return
    const p = prevPrice(itemId)
    const key = newId('l')
    focusKey.current = key
    setRows((rs) => [...rs, { key, itemId, scale: '', weight: '', price: p ? String(p.price) : '', priceTouched: false }])
    setErr('')
  }
  const patchRow = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key))
  const moveRow = (i: number, d: number) =>
    setRows((rs) => {
      const j = i + d
      if (j < 0 || j >= rs.length) return rs
      const out = [...rs]
      ;[out[i], out[j]] = [out[j], out[i]]
      return out
    })

  /** 前回の伝票(この業者)と同じ品目で始める */
  const lastSlip = useMemo(() => liveSlips(book).find((s) => s.vendorId === vendorId && s.id !== editing?.id) ?? liveSlips(book).find((s) => s.id !== editing?.id), [book, vendorId, editing])
  const startLikeLast = () => {
    if (!lastSlip) return
    const add = lastSlip.lines.filter((l) => book.items[l.itemId] && !book.items[l.itemId].deleted)
    setRows(
      add.map((l) => {
        const p = prevPrice(l.itemId)
        return { key: newId('l'), itemId: l.itemId, scale: '', weight: '', price: p ? String(p.price) : '', priceTouched: false }
      }),
    )
    if (lastSlip.firstWeight !== undefined) setUseScale(true)
  }

  /** 新しい品目・業者をその場で追加(同じ名前を隠していれば、作らずに再表示) */
  const addItem = (name: string): string => {
    const same = items.find((c) => normalizeName(c.name) === normalizeName(name))
    if (same) {
      if (same.hidden) update((b) => ({ ...b, items: { ...b.items, [same.id]: { ...b.items[same.id], hidden: undefined, updatedAt: stamp() } } }))
      return same.id
    }
    const id = newId('i')
    const ord = Math.max(-1, ...items.map((c) => c.order)) + 1
    update((b) => ({ ...b, items: { ...b.items, [id]: { id, name, color: pickColor(b), order: ord, updatedAt: stamp() } } }))
    return id
  }
  const addVendor = (name: string): string => {
    const same = vendors.find((c) => normalizeName(c.name) === normalizeName(name))
    if (same) {
      if (same.hidden) update((b) => ({ ...b, vendors: { ...b.vendors, [same.id]: { ...b.vendors[same.id], hidden: undefined, updatedAt: stamp() } } }))
      return same.id
    }
    const id = newId('v')
    const ord = Math.max(-1, ...vendors.map((c) => c.order)) + 1
    update((b) => ({ ...b, vendors: { ...b.vendors, [id]: { id, name, order: ord, updatedAt: stamp() } } }))
    return id
  }
  /** 名前を変える(同じ名前が他にあれば変えない)。過去の伝票の表示も新しい名前になる */
  const rename = (kind: 'items' | 'vendors', id: string, name: string): string | null => {
    const list = kind === 'items' ? items : vendors
    if (list.some((c) => c.id !== id && normalizeName(c.name) === normalizeName(name))) return `「${name}」はもうあります`
    update((b) => ({ ...b, [kind]: { ...b[kind], [id]: { ...b[kind][id], name, updatedAt: stamp() } } }))
    return null
  }
  const unhide = (kind: 'items' | 'vendors', id: string) =>
    update((b) => ({ ...b, [kind]: { ...b[kind], [id]: { ...b[kind][id], hidden: undefined, updatedAt: stamp() } } }))

  // ---- 計算: 計量重量があれば、ひとつ前の重量(最初は初回計量重量)との差が正味重量
  const firstW = useScale ? evalNumber(first) : null
  const calc = (() => {
    let prev = firstW
    return rows.map((r) => {
      const scale = useScale ? evalNumber(r.scale) : null
      let weight: number | null
      let auto = false
      if (scale !== null && prev !== null) {
        weight = Math.round((prev - scale) * 1000) / 1000
        auto = true
        prev = scale
      } else weight = evalNumber(r.weight)
      const price = evalNumber(r.price)
      const amount = weight !== null && price !== null && weight > 0 && price >= 0 ? lineAmount(weight, price, rounding) : null
      return { scale, weight, auto, price, amount }
    })
  })()
  const total = calc.reduce((s, c) => s + (c.amount ?? 0), 0)
  const totalWeight = calc.reduce((s, c) => s + (c.weight && c.weight > 0 ? c.weight : 0), 0)

  const save = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr('日付を入力してください')
    if (!vendorId || !book.vendors[vendorId]) return setErr('業者を選んでください(無ければ「業者を選ぶ・追加する」から追加できます)')
    if (!rows.length) return setErr('品目を1つ以上入れてください')
    for (let i = 0; i < rows.length; i++) {
      const c = calc[i]
      const name = book.items[rows[i].itemId]?.name ?? '品目'
      if (c.weight === null || c.weight <= 0) return setErr(`「${name}」の重量を入れてください${c.auto ? '(計量重量が前の重量より重くなっています)' : ''}`)
      if (c.price === null || c.price < 0) return setErr(`「${name}」の単価を入れてください`)
    }
    if (useScale && first.trim() && firstW === null) return setErr('初回計量重量が読めません')
    const lines: Line[] = rows.map((r, i) => ({
      id: r.key,
      itemId: r.itemId,
      itemName: book.items[r.itemId]?.name ?? '',
      ...(calc[i].auto && calc[i].scale !== null ? { scale: calc[i].scale! } : {}),
      weight: calc[i].weight!,
      price: calc[i].price!,
      amount: calc[i].amount!,
    }))
    try {
      localStorage.setItem(LAST_VENDOR, vendorId)
    } catch {
      /* 無視 */
    }
    onSave({
      id: editing?.id ?? newId('s'),
      date,
      vendorId,
      vendorName: book.vendors[vendorId].name,
      ...(useScale && firstW !== null ? { firstWeight: firstW } : {}),
      lines,
      total: lines.reduce((s, l) => s + l.amount, 0),
      memo: memo.trim(),
      updatedAt: stamp(),
    })
    onClose()
  }

  // Enter で次の入力欄へ(PC で表を打つように)。Ctrl+Enter で保存
  const onFieldKey = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key !== 'Enter') return
    ev.preventDefault()
    if (ev.ctrlKey || ev.metaKey) return save()
    const all = [...(formRef.current?.querySelectorAll<HTMLInputElement>('input.num-in:not([readonly])') ?? [])]
    const i = all.indexOf(ev.currentTarget)
    if (i >= 0 && i < all.length - 1) all[i + 1].focus()
    else ev.currentTarget.blur()
  }

  const inSlip = new Set(rows.map((r) => r.itemId))
  const chips = recentOf(
    items.filter((c) => !c.hidden && !inSlip.has(c.id)),
    iUse,
    10,
  )
  // まだ一度も使っていなければ、設定の順で先頭から
  const chipList = chips.length ? chips : items.filter((c) => !c.hidden && !inSlip.has(c.id)).slice(0, 10)

  return (
    <div className="overlay" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <form
        ref={formRef}
        className="sheet card slip-form"
        onSubmit={(ev) => {
          ev.preventDefault()
          save()
        }}
      >
        <div className="sheet-head">
          <h2>{editing ? '伝票を直す' : '新しい伝票'}</h2>
          <span className="spacer" />
          <button type="button" className="ghost small" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="field date-field">
          <button type="button" className="ghost small" onClick={() => setDate(ymd(addDays(parseYmd(date), -1)))} aria-label="前の日">
            ‹
          </button>
          <label className="date-label">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <span className="muted">{/^\d{4}-\d{2}-\d{2}$/.test(date) ? jpDate(parseYmd(date)) : ''}</span>
          </label>
          <button type="button" className="ghost small" onClick={() => setDate(ymd(addDays(parseYmd(date), 1)))} aria-label="次の日">
            ›
          </button>
          <button type="button" className="ghost small" onClick={() => setDate(ymd(new Date()))}>
            今日
          </button>
        </div>

        <div className="field">
          <div className="field-label">業者</div>
          <NamePicker label="業者" list={vendors} recent={recentVendors} value={vendorId} onChange={changeVendor} onAdd={addVendor} onUnhide={(id) => unhide('vendors', id)} onRename={(id, name) => rename('vendors', id, name)} />
        </div>

        <div className="field scale-field">
          <label className="check">
            <input type="checkbox" checked={useScale} onChange={(e) => setUseScale(e.target.checked)} />
            計量の差し引きで正味重量を出す(トラックスケール)
          </label>
          {useScale && (
            <>
              <label className="first-weight">
                <span>初回計量重量</span>
                <input className="num-in" inputMode="decimal" autoComplete="off" value={first} onChange={(e) => setFirst(e.target.value)} onKeyDown={onFieldKey} placeholder="例 3810" />
                <span className="muted">kg</span>
              </label>
              <p className="muted small-note">品目の「計量重量」を入れると、ひとつ前の重量(最初は初回計量重量)との差が正味重量になります。計量しない品目は正味重量を直接入れてください。</p>
            </>
          )}
        </div>

        <div className="field">
          <div className="field-label">品目</div>
          {rows.length > 0 && (
            <div className={`lines ${useScale ? 'with-scale' : ''}`}>
              <div className="line-head muted">
                <span>品目</span>
                {useScale && <span>計量重量</span>}
                <span>正味重量</span>
                <span>単価</span>
                <span>金額</span>
              </div>
              {rows.map((r, i) => {
                const c = calc[i]
                const it = book.items[r.itemId]
                const p = prevPrice(r.itemId)
                const diff = p && c.price !== null ? Math.round((c.price - p.price) * 100) / 100 : null
                return (
                  <div key={r.key} className="line" data-row={r.key}>
                    <div className="line-name">
                      <span className="cat-dot" style={{ background: it?.color ?? '#888' }} />
                      <b>{it?.name ?? '(消した品目)'}</b>
                      <span className="spacer" />
                      <button type="button" className="ghost tiny" onClick={() => moveRow(i, -1)} disabled={i === 0} aria-label="上へ">
                        ↑
                      </button>
                      <button type="button" className="ghost tiny" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1} aria-label="下へ">
                        ↓
                      </button>
                      <button type="button" className="ghost tiny" onClick={() => removeRow(r.key)} aria-label="この品目を外す">
                        ✕
                      </button>
                    </div>
                    {useScale && (
                      <label className="lcell">
                        <span className="lcell-label">計量</span>
                        <input className="num-in" inputMode="decimal" autoComplete="off" value={r.scale} onChange={(e) => patchRow(r.key, { scale: e.target.value })} onKeyDown={onFieldKey} placeholder="—" aria-label={`${it?.name} 計量重量`} />
                        <span className="unit">kg</span>
                      </label>
                    )}
                    <label className="lcell">
                      <span className="lcell-label">重量</span>
                      <input
                        className={`num-in w-in ${c.auto ? 'auto' : ''}`}
                        inputMode="decimal"
                        autoComplete="off"
                        value={c.auto ? num(c.weight ?? 0) : r.weight}
                        readOnly={c.auto}
                        onChange={(e) => patchRow(r.key, { weight: e.target.value })}
                        onKeyDown={onFieldKey}
                        placeholder="0"
                        aria-label={`${it?.name} 正味重量`}
                        title={c.auto ? '計量重量の差し引きで計算しています' : ''}
                      />
                      <span className="unit">kg</span>
                    </label>
                    <label className="lcell">
                      <span className="lcell-label">単価</span>
                      <span className="times">×</span>
                      <input className="num-in" inputMode="decimal" autoComplete="off" value={r.price} onChange={(e) => patchRow(r.key, { price: e.target.value, priceTouched: true })} onKeyDown={onFieldKey} placeholder="0" aria-label={`${it?.name} 単価`} />
                      <span className="unit">円</span>
                    </label>
                    <div className="lcell amount-cell">
                      <span className="lcell-label">金額</span>= <b>{c.amount === null ? '—' : yen(c.amount)}</b>
                    </div>
                    <div className="line-hint muted">
                      {p ? (
                        <>
                          前回 {num(p.price)}円({Number(p.date.slice(5, 7))}/{Number(p.date.slice(8))}
                          {p.vendorId !== vendorId && book.vendors[p.vendorId] ? `・${book.vendors[p.vendorId].name}` : ''})
                          {diff !== null && diff !== 0 && <span className={diff > 0 ? 'up' : 'down'}>{diff > 0 ? ` ▲${num(diff)}` : ` ▼${num(-diff)}`}</span>}
                        </>
                      ) : (
                        '初めての品目'
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="add-items">
            <div className="cat-recent" aria-label="品目を追加">
              {chipList.map((c) => (
                <button key={c.id} type="button" className="cat-chip" style={{ '--cat': c.color } as React.CSSProperties} onClick={() => addRow(c.id)}>
                  ＋ {c.name}
                </button>
              ))}
            </div>
            <div className="btn-row">
              <button type="button" className="cat-select" onClick={() => setPicking(true)}>
                <span className="cat-select-name">＋ 品目を検索・一覧・新しく追加</span>
              </button>
              {!editing && !rows.length && lastSlip && (
                <button type="button" className="ghost small" onClick={startLikeLast} title={`${lastSlip.date} の伝票の品目を並べます(重量は空、単価は前回の値)`}>
                  前回と同じ品目で始める
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="slip-total">
          <span className="muted">
            {rows.length}品目・{kg(Math.round(totalWeight * 1000) / 1000)}
          </span>
          <span className="spacer" />
          <span className="muted">総合計</span>
          <b className="total-yen">{yen(total)}</b>
        </div>

        <div className="field">
          <textarea className="memo-in" rows={2} placeholder="メモ(任意)" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>

        {err && <div className="msg error">{err}</div>}

        <div className="form-actions">
          {editing && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm('この伝票を削除しますか?')) {
                  onDelete(editing)
                  onClose()
                }
              }}
            >
              削除
            </button>
          )}
          <span className="spacer" />
          <span className="muted small-note">金額の円未満は{rounding === 'floor' ? '切り捨て' : rounding === 'ceil' ? '切り上げ' : '四捨五入'}</span>
          <button type="submit">{editing ? '変更を保存' : '保存'}</button>
        </div>

        {picking && (
          <PickerDialog
            label="品目"
            list={items}
            disabled={inSlip}
            onRename={(id, name) => rename('items', id, name)}
            onClose={() => setPicking(false)}
            onPick={(c) => {
              if (c.hidden) unhide('items', c.id)
              addRow(c.id)
              setPicking(false)
            }}
            onAdd={(name) => {
              const id = addItem(name)
              // 追加した品目は次の描画で book に入るので、行は ID だけで作る
              const key = newId('l')
              focusKey.current = key
              setRows((rs) => (rs.some((r) => r.itemId === id) ? rs : [...rs, { key, itemId: id, scale: '', weight: '', price: '', priceTouched: false }]))
              setPicking(false)
            }}
          />
        )}
      </form>
    </div>
  )
}
