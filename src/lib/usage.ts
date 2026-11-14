// 品目・業者の「使った回数・最後に使った日」と、入力画面での並び順・検索
import { liveSlips, normalizeName, type Book } from './model'

export type PickOrder = 'manual' | 'usage' | 'recent' | 'name'

export const PICK_ORDER_LABEL: Record<PickOrder, string> = {
  manual: '手動(設定の ↑↓ の順)',
  usage: 'よく使う順',
  recent: '最近使った順',
  name: '名前順',
}

// 並び順はこの端末だけの設定
const KEY = 'scrap.pickOrder'
export function loadPickOrder(): PickOrder {
  try {
    const v = localStorage.getItem(KEY)
    if (v && v in PICK_ORDER_LABEL) return v as PickOrder
  } catch {
    /* 読めない環境 */
  }
  return 'manual'
}
export function savePickOrder(v: PickOrder) {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* 保存できない環境 */
  }
}

export interface Use {
  count: number
  last: string // 日付(同じ日なら lastAt で比べる)
  lastAt: number
}

const bump = (m: Map<string, Use>, id: string, date: string, at: number) => {
  const u = m.get(id)
  if (!u) m.set(id, { count: 1, last: date, lastAt: at })
  else {
    u.count++
    if (date > u.last || (date === u.last && at > u.lastAt)) {
      u.last = date
      u.lastAt = at
    }
  }
}

export function itemUse(book: Book): Map<string, Use> {
  const m = new Map<string, Use>()
  for (const s of liveSlips(book)) for (const l of s.lines) bump(m, l.itemId, s.date, s.updatedAt)
  return m
}

export function vendorUse(book: Book): Map<string, Use> {
  const m = new Map<string, Use>()
  for (const s of liveSlips(book)) bump(m, s.vendorId, s.date, s.updatedAt)
  return m
}

const recentCmp = (a?: Use, b?: Use) => (b?.last ?? '').localeCompare(a?.last ?? '') || (b?.lastAt ?? 0) - (a?.lastAt ?? 0)

type Named = { id: string; name: string; order: number }

export function sortByOrder<T extends Named>(list: T[], order: PickOrder, use: Map<string, Use>): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'ja')
  const manual = (a: T, b: T) => a.order - b.order || byName(a, b)
  const out = [...list]
  if (order === 'usage') return out.sort((a, b) => (use.get(b.id)?.count ?? 0) - (use.get(a.id)?.count ?? 0) || manual(a, b))
  if (order === 'recent') return out.sort((a, b) => recentCmp(use.get(a.id), use.get(b.id)) || manual(a, b))
  if (order === 'name') return out.sort(byName)
  return out.sort(manual)
}

/** 最近使ったもの(入力画面の上に出すボタン) */
export function recentOf<T extends Named>(list: T[], use: Map<string, Use>, n: number): T[] {
  return list
    .filter((c) => use.has(c.id))
    .sort((a, b) => recentCmp(use.get(a.id), use.get(b.id)))
    .slice(0, n)
}

export const normalize = normalizeName

/** 名前に検索語が含まれるか(前から一致するものを先に並べるための点数も返す。一致しなければ -1) */
export function matchScore(name: string, q: string): number {
  const n = normalize(name)
  const k = normalize(q)
  if (!k) return 0
  if (n === k) return 3
  if (n.startsWith(k)) return 2
  return n.includes(k) ? 1 : -1
}

/** 新しい品目の色: 使われている数の少ない色 */
const PALETTE = ['#8d9aa8', '#e8833a', '#d9534f', '#5bb57a', '#4a90d9', '#c06bc2', '#e2b33d', '#2fb3a8', '#e86b8f', '#3fa7d6', '#7a7fd6', '#8d6e63', '#6d9a4a', '#ab8b2f']
export function pickColor(book: Book): string {
  const n = new Map(PALETTE.map((c) => [c, 0]))
  for (const c of Object.values(book.items)) if (!c.deleted && n.has(c.color)) n.set(c.color, n.get(c.color)! + 1)
  return [...n].sort((a, b) => a[1] - b[1])[0][0]
}
