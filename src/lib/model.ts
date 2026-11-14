// スクラップ買取帳のデータの形と、2台以上の端末で書き換えたデータの「合わせ方」
//
// 方針: 消さない・失わない(家計簿アプリと同じ)
// - 伝票・品目・業者はそれぞれ ID を持ち、変更のたびに updatedAt(時刻)を更新する
// - 削除は「削除済みの印(deleted)」を付けるだけで、データからは取り除かない
// - 2つのデータを合わせるときは、ID ごとに updatedAt が新しいほうを採用する
//   → どの端末で、どの順番で合わせても同じ結果になる(片方の変更が消えない)
//
// 1回の登録 = 1枚の伝票(Slip)。伝票には品目ごとの行(Line: 重量 × 単価 = 金額)があり、
// 行の金額と総合計も、その時点の値として保存する(あとで端数の設定を変えても、昔の伝票の金額は変わらない)

/** 伝票の1行(品目ごと) */
export interface Line {
  id: string
  itemId: string
  /** 品目名の控え(品目の名前をあとで変えても、伝票には当時の名前も残す) */
  itemName: string
  /** 計量重量 kg(トラックスケールで量った値。初回計量重量との差し引きで正味重量を出すときだけ) */
  scale?: number
  /** 正味重量 kg(小数可) */
  weight: number
  /** 単価 円/kg(小数可) */
  price: number
  /** 金額 円 = 重量 × 単価(端数処理済み) */
  amount: number
}

export interface Slip {
  id: string
  date: string // 2026-11-15
  vendorId: string
  /** 業者名の控え */
  vendorName: string
  /** 初回計量重量 kg(車ごと量った最初の重量。使わなければ無し) */
  firstWeight?: number
  lines: Line[]
  /** 総合計 円(行の金額の和) */
  total: number
  memo: string
  updatedAt: number
  deleted?: true
}

/** 品目(鉄・ステンレスなど。家計簿の費目と同じ扱い) */
export interface Item {
  id: string
  name: string
  color: string
  order: number
  hidden?: boolean // 入力画面に出さない(過去の伝票の表示には使う)
  updatedAt: number
  deleted?: true
}

/** 業者(買取店) */
export interface Vendor {
  id: string
  name: string
  order: number
  hidden?: boolean
  updatedAt: number
  deleted?: true
}

/** 端末どうしで共有する設定(金額の端数の扱いなど) */
export interface Settings {
  id: 'main'
  /** 金額の円未満: floor=切り捨て round=四捨五入 ceil=切り上げ */
  rounding: Rounding
  updatedAt: number
}
export type Rounding = 'floor' | 'round' | 'ceil'
export const ROUNDING_LABEL: Record<Rounding, string> = { floor: '切り捨て', round: '四捨五入', ceil: '切り上げ' }

export interface Book {
  format: 'scrapledger'
  version: 1
  slips: Record<string, Slip>
  items: Record<string, Item>
  vendors: Record<string, Vendor>
  settings: Record<string, Settings>
}

// 最初から用意する品目(紙の伝票の順)。ID を固定しておくと、2台の端末がそれぞれ最初に作っても重複しない
const DEFAULT_ITEMS: [string, string, string][] = [
  ['i-iron', '鉄', '#8d9aa8'],
  ['i-aiz', 'A工雑', '#a1887f'],
  ['i-stainless', 'ステンレス', '#90caf9'],
  ['i-alumigara', 'アルミガラ', '#b0bec5'],
  ['i-battery', 'バッテリ', '#e57373'],
  ['i-zassen', '雑線', '#ffb74d'],
  ['i-brass', '真鍮', '#e2b33d'],
  ['i-alcan', 'アルミ缶', '#4fc3f7'],
  ['i-boiler', 'ボイラ', '#ba68c8'],
  ['i-sash', 'サッシ', '#81c784'],
  ['i-motor', 'モーター', '#4db6ac'],
]

export const DEFAULT_SETTINGS: Settings = { id: 'main', rounding: 'floor', updatedAt: 0 }

export function emptyBook(): Book {
  const items: Record<string, Item> = {}
  DEFAULT_ITEMS.forEach(([id, name, color], i) => {
    items[id] = { id, name, color, order: i, updatedAt: 0 }
  })
  return { format: 'scrapledger', version: 1, slips: {}, items, vendors: {}, settings: { main: DEFAULT_SETTINGS } }
}

export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), '')}`

/** 時刻を必ず前に進める(同じミリ秒に2回変更しても、後の変更が勝つように) */
let lastStamp = 0
export function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

type Stamped = { updatedAt: number }

function mergeMap<T extends Stamped>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = { ...a }
  for (const [id, v] of Object.entries(b)) {
    const cur = out[id]
    // 同じ時刻なら、内容で決める(どちら側から合わせても同じ結果にするため)
    if (!cur || v.updatedAt > cur.updatedAt || (v.updatedAt === cur.updatedAt && JSON.stringify(v) > JSON.stringify(cur))) out[id] = v
  }
  return out
}

/** 2つのデータを合わせる(どちらの変更も残す) */
export function mergeBooks(a: Book, b: Book): Book {
  return {
    format: 'scrapledger',
    version: 1,
    slips: mergeMap(a.slips, b.slips),
    items: mergeMap(a.items, b.items),
    vendors: mergeMap(a.vendors ?? {}, b.vendors ?? {}),
    settings: mergeMap(a.settings ?? {}, b.settings ?? {}),
  }
}

/** 読み込んだ JSON がこのアプリのデータか確かめ、足りない項目を補う */
export function parseBook(text: string): Book {
  const raw = JSON.parse(text) as Partial<Book>
  if (raw?.format !== 'scrapledger' || typeof raw.slips !== 'object') throw new Error('スクラップ買取帳のデータのファイルではありません')
  return mergeBooks(emptyBook(), { format: 'scrapledger', version: 1, slips: raw.slips ?? {}, items: raw.items ?? {}, vendors: raw.vendors ?? {}, settings: raw.settings ?? {} })
}

const sortObj = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))

/** 保存用: ID 順に並べる(同じ内容なら同じファイルになる) */
export const sortBook = (b: Book): Book => ({
  format: 'scrapledger',
  version: 1,
  slips: sortObj(b.slips),
  items: sortObj(b.items),
  vendors: sortObj(b.vendors),
  settings: sortObj(b.settings),
})

/** 内容が同じか(保存・送信が必要かの判定) */
export const sameBook = (a: Book, b: Book) => JSON.stringify(sortBook(a)) === JSON.stringify(sortBook(b))

export const settingsOf = (b: Book): Settings => b.settings.main ?? DEFAULT_SETTINGS

/** 削除されていない伝票(新しい日付が先) */
export const liveSlips = (b: Book) =>
  Object.values(b.slips)
    .filter((s) => !s.deleted)
    .sort((x, y) => y.date.localeCompare(x.date) || y.updatedAt - x.updatedAt)

export const liveItems = (b: Book) =>
  Object.values(b.items)
    .filter((c) => !c.deleted)
    .sort((x, y) => x.order - y.order || x.name.localeCompare(y.name, 'ja'))

export const liveVendors = (b: Book) =>
  Object.values(b.vendors)
    .filter((c) => !c.deleted)
    .sort((x, y) => x.order - y.order || x.name.localeCompare(y.name, 'ja'))

/** 品目の今の名前(消した品目なら伝票の控えの名前) */
export const itemName = (b: Book, l: Line) => b.items[l.itemId]?.name ?? l.itemName
export const vendorName = (b: Book, s: Slip) => b.vendors[s.vendorId]?.name ?? s.vendorName

/** 名前の比べ方(全角/半角・カタカナ/ひらがな・空白の違いは同じ名前とみなす) */
export const normalizeName = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')

/** 一覧など1行で見せるときのメモ(改行は「 / 」にする) */
export const memoLine = (m: string) => m.replace(/\s*\n\s*/g, ' / ')

export const yen = (n: number) => `${n < 0 ? '-' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`

/** 重量・単価の表示(小数は必要なぶんだけ。最大2桁) */
export const num = (n: number) => n.toLocaleString('ja-JP', { maximumFractionDigits: 2 })
export const kg = (n: number) => `${num(n)}kg`

/** 金額 = 重量 × 単価 を、設定の端数の扱いで円にする(小数の誤差は先に丸めてから) */
export function lineAmount(weight: number, price: number, rounding: Rounding): number {
  const v = Math.round(weight * price * 1e6) / 1e6
  return rounding === 'floor' ? Math.floor(v) : rounding === 'ceil' ? Math.ceil(v) : Math.round(v)
}

/** 入力された数(例 "1,200" "１２．５" "770+30")を読む。小数可。読めなければ null */
export function evalNumber(text: string): number | null {
  const s = text
    .replace(/[,，\s円¥￥]/g, '')
    .replace(/kg|ｋｇ/gi, '')
    .replace(/[０-９＋－×÷＊／（）．]/g, (c) => '0123456789+-*/*/().'['０１２３４５６７８９＋－×÷＊／（）．'.indexOf(c)])
    .replace(/[×x]/g, '*')
    .replace(/÷/g, '/')
  if (!s || !/^[\d+\-*/().]+$/.test(s)) return null
  // 四則演算と括弧だけの簡単な計算(画面の安全設定で eval は使えないため自前で計算する)
  let i = 0
  const atom = (): number => {
    if (s[i] === '(') {
      i++
      const v = expr()
      if (s[i++] !== ')') throw new Error()
      return v
    }
    if (s[i] === '-') {
      i++
      return -atom()
    }
    const m = /^\d*\.?\d+/.exec(s.slice(i))
    if (!m) throw new Error()
    i += m[0].length
    return Number(m[0])
  }
  const term = (): number => {
    let v = atom()
    while (s[i] === '*' || s[i] === '/') v = s[i++] === '*' ? v * atom() : v / atom()
    return v
  }
  const expr = (): number => {
    let v = term()
    while (s[i] === '+' || s[i] === '-') v = s[i++] === '+' ? v + term() : v - term()
    return v
  }
  try {
    const v = expr()
    if (i !== s.length || !Number.isFinite(v)) return null
    return Math.round(v * 1000) / 1000 // 小数3桁まで
  } catch {
    return null
  }
}

/** 品目ごとの単価の履歴(古い順)。業者を指定するとその業者の伝票だけ */
export interface PricePoint {
  date: string
  price: number
  weight: number
  vendorId: string
  slipId: string
}
export function priceHistory(b: Book, vendorId?: string): Map<string, PricePoint[]> {
  const m = new Map<string, PricePoint[]>()
  const slips = liveSlips(b)
    .filter((s) => !vendorId || s.vendorId === vendorId)
    .reverse()
  for (const s of slips) {
    for (const l of s.lines) {
      if (!(l.price > 0)) continue
      const list = m.get(l.itemId) ?? []
      list.push({ date: s.date, price: l.price, weight: l.weight, vendorId: s.vendorId, slipId: s.id })
      m.set(l.itemId, list)
    }
  }
  return m
}

/** 品目の前回の単価(新しい伝票の初期値に使う)。その業者での前回を優先し、無ければどの業者でも前回 */
export function lastPrice(b: Book, itemId: string, vendorId: string, excludeSlipId?: string): PricePoint | null {
  let any: PricePoint | null = null
  for (const s of liveSlips(b)) {
    if (s.id === excludeSlipId) continue
    const l = s.lines.find((x) => x.itemId === itemId && x.price > 0)
    if (!l) continue
    const p = { date: s.date, price: l.price, weight: l.weight, vendorId: s.vendorId, slipId: s.id }
    if (s.vendorId === vendorId) return p
    any ??= p
  }
  return any
}
