// 品目・業者の選び方(家計簿の費目と同じ作り): 最近使ったボタン + 押すと開く「検索できる一覧」。
// 一覧に無ければ、その場で新しく追加できる。隠したものは検索したときだけ出し、選ぶと再表示する
import { useEffect, useMemo, useRef, useState } from 'react'
import { useBackClose } from '../lib/useBackClose'
import { matchScore, normalize } from '../lib/usage'

export interface Pickable {
  id: string
  name: string
  color?: string
  hidden?: boolean
}

interface Props {
  /** 選べるもの(隠したものも含む。並び順は設定の順) */
  list: Pickable[]
  /** 最近使ったもの(上に出すボタン) */
  recent: Pickable[]
  value: string
  onChange: (id: string) => void
  /** 新しく追加して、その ID を返す */
  onAdd: (name: string) => string
  /** 隠していたものを入力画面に出すようにする */
  onUnhide: (id: string) => void
  /** 「業者」「品目」など */
  label: string
}

/** 1つだけ選ぶ(業者) */
export default function NamePicker({ list, recent, value, onChange, onAdd, onUnhide, label }: Props) {
  const [open, setOpen] = useState(false)
  const cur = list.find((c) => c.id === value)
  const shownRecent = recent.filter((c) => !c.hidden)

  return (
    <div className="cat-pick">
      {shownRecent.length > 0 && (
        <div className="cat-recent" aria-label={`最近使った${label}`}>
          {shownRecent.map((c) => (
            <button key={c.id} type="button" className={`cat-chip ${value === c.id ? 'on' : ''}`} style={c.color ? ({ '--cat': c.color } as React.CSSProperties) : undefined} onClick={() => onChange(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="cat-select" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {cur?.color && <span className="cat-dot" style={{ background: cur.color }} />}
        <span className="cat-select-name">{cur ? cur.name : `${label}を選ぶ・追加する`}</span>
        <span className="cat-select-hint muted">検索・一覧 ▾</span>
      </button>
      {open && (
        <PickerDialog
          list={list}
          value={value}
          label={label}
          onClose={() => setOpen(false)}
          onPick={(c) => {
            if (c.hidden) onUnhide(c.id)
            onChange(c.id)
            setOpen(false)
          }}
          onAdd={(name) => {
            onChange(onAdd(name))
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

export function PickerDialog({
  list,
  value,
  label,
  onClose,
  onPick,
  onAdd,
  disabled,
}: {
  list: Pickable[]
  value?: string
  label: string
  onClose: () => void
  onPick: (c: Pickable) => void
  onAdd: (name: string) => void
  /** 選べないもの(伝票にすでにある品目など)。灰色で出す */
  disabled?: Set<string>
}) {
  useBackClose(onClose)
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    // スマホでは最初からキーボードを出さない(一覧が隠れるため)
    if (!matchMedia('(pointer: coarse)').matches) inputRef.current?.focus()
    listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'center' })
  }, [])

  const query = q.trim()
  const results = useMemo(() => {
    if (!query) return list.filter((c) => !c.hidden || c.id === value)
    // 検索中は隠したものも出す。前から一致するものを先に(同じなら設定の並び順)
    return list
      .map((c, i) => ({ c, i, s: matchScore(c.name, query) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || Number(!!a.c.hidden) - Number(!!b.c.hidden) || a.i - b.i)
      .map((x) => x.c)
  }, [list, query, value])
  const exact = !!query && list.some((c) => normalize(c.name) === normalize(query))
  const usable = results.filter((c) => !disabled?.has(c.id))

  return (
    <div className="overlay picker-overlay" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="sheet card picker" role="dialog" aria-label={`${label}を選ぶ`}>
        <div className="picker-head">
          <input
            ref={inputRef}
            type="search"
            className="picker-search"
            placeholder={`${label}を検索・新しく追加(かな可)`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation() // 入力画面ごと閉じないように
                onClose()
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (usable.length) onPick(usable[0])
                else if (query && !exact) onAdd(query)
              }
            }}
            aria-label={`${label}を検索`}
          />
          <button type="button" className="ghost small" onClick={onClose}>
            閉じる
          </button>
        </div>
        {query && !exact && (
          <button type="button" className="picker-add" onClick={() => onAdd(query)}>
            ＋「{query}」を新しい{label}として追加
          </button>
        )}
        <ul className="picker-list" ref={listRef}>
          {results.map((c) => {
            const off = disabled?.has(c.id)
            return (
              <li key={c.id}>
                <button type="button" className={c.id === value ? 'on' : ''} disabled={off} onClick={() => onPick(c)}>
                  {c.color && <span className="cat-dot" style={{ background: c.color }} />}
                  <span>{c.name}</span>
                  {off && <span className="muted hidden-mark">入力済み</span>}
                  {c.hidden && <span className="muted hidden-mark">隠している{label}(選ぶと再表示)</span>}
                </button>
              </li>
            )
          })}
          {!results.length && (
            <li className="muted picker-empty">
              {query ? `「${query}」に一致する${label}はありません` : `${label}はまだありません。上の欄に名前を入れて追加してください`}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
