// 開発用の ?demo: 架空の Google ログイン・架空のドライブ(localStorage)・架空の伝票で動かす。
// 本番ビルドには含まれない。?demo=reset で架空データを作り直す
import { switchToDemoDb } from '../lib/idb'
import { emptyBook, lineAmount, newId, parseBook, sortBook, stamp, type Book, type Line, type Slip } from '../lib/model'
import { addDays, ymd } from '../lib/dates'
import type { RemoteApi } from '../lib/useBook'

const REMOTE = 'scrap-demo-remote'
const log: string[] = []

function sample(): Book {
  const b = emptyBook()
  b.vendors['v-demo1'] = { id: 'v-demo1', name: '架空金属', order: 0, updatedAt: 1 }
  b.vendors['v-demo2'] = { id: 'v-demo2', name: 'サンプル資源', order: 1, updatedAt: 1 }
  // 品目ごとの基準の単価(円/kg)と重量の幅
  const base: [string, number, number, number][] = [
    ['i-iron', 43, 300, 900],
    ['i-stainless', 160, 5, 20],
    ['i-alumigara', 230, 8, 25],
    ['i-battery', 100, 20, 45],
    ['i-motor', 130, 8, 25],
    ['i-boiler', 350, 3, 12],
    ['i-zassen', 280, 2, 10],
  ]
  let seed = 11
  const rnd = (n: number) => ((seed = (seed * 9301 + 49297) % 233280) / 233280) * n
  const today = new Date()
  // 14か月分、月に1〜2枚。単価は少しずつ上下する
  for (let k = 0; k < 20; k++) {
    const d = addDays(today, -Math.floor(k * 21 + rnd(6)))
    const vendorId = rnd(1) < 0.75 ? 'v-demo1' : 'v-demo2'
    const picks = base.filter((_, i) => i === 0 || rnd(1) < 0.55)
    const lines: Line[] = picks.map(([itemId, p, w0, w1]) => {
      const trend = 1 + Math.sin((k + itemId.length) / 3) * 0.12 + (vendorId === 'v-demo2' ? 0.04 : 0)
      const price = Math.round(p * trend)
      const weight = Math.round(w0 + rnd(w1 - w0))
      return { id: newId('l'), itemId, itemName: b.items[itemId].name, weight, price, amount: lineAmount(weight, price, 'floor') }
    })
    const first = 3040 + lines[0].weight
    lines[0] = { ...lines[0], scale: 3040 }
    const s: Slip = { id: newId('s'), date: ymd(d), vendorId, vendorName: b.vendors[vendorId].name, firstWeight: first, lines, total: lines.reduce((t, l) => t + l.amount, 0), memo: '', updatedAt: stamp() }
    b.slips[s.id] = s
  }
  return b
}

export async function installDemo() {
  switchToDemoDb()
  const reset = new URLSearchParams(location.search).get('demo') === 'reset'
  if (reset) {
    localStorage.removeItem(REMOTE)
    localStorage.removeItem(REMOTE + '-ver')
    localStorage.removeItem('scrap.loggedIn')
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase('scrapledger-demo')
      req.onsuccess = req.onerror = req.onblocked = r
    })
  }
  if (!localStorage.getItem(REMOTE)) localStorage.setItem(REMOTE, JSON.stringify(sortBook(sample())))

  // 架空の Google ログイン
  const w = window as unknown as Record<string, unknown>
  w.google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { callback: (r: unknown) => void; scope: string }) => ({
          requestAccessToken: () => {
            log.push('login')
            setTimeout(() => cfg.callback({ access_token: 'demo', expires_in: 3600, scope: cfg.scope }), 50)
          },
        }),
        hasGrantedAllScopes: () => true,
        revoke: (_t: string, done?: () => void) => done?.(),
      },
    },
  }

  // 架空のドライブ。版は書き込むたびに増える(本物のドライブの version と同じ考え方)
  const ver = () => localStorage.getItem(REMOTE + '-ver') ?? '1'
  const bump = () => localStorage.setItem(REMOTE + '-ver', String(Number(ver()) + 1))
  const remote: RemoteApi = {
    async version() {
      log.push('version')
      return localStorage.getItem(REMOTE) ? ver() : null
    },
    async load(_t, st) {
      log.push('load')
      st.fullAt = Date.now()
      const t = localStorage.getItem(REMOTE)
      return t ? parseBook(t) : null
    },
    async save(_t, st, book) {
      log.push('save')
      localStorage.setItem(REMOTE, JSON.stringify(sortBook(book)))
      bump()
      st.version = ver()
    },
    async prune(_t, _st, keep) {
      log.push(`prune ${keep}`)
      return 0
    },
  }
  w.__scrapDemoRemote = remote
  w.__demoLog = log
  // 「別の端末(スマホ)で入力した」ことにする: ドライブ側にだけ伝票を足す
  w.__demoOtherDevice = (weight = 500, price = 45) => {
    const b = parseBook(localStorage.getItem(REMOTE)!)
    const line: Line = { id: newId('l'), itemId: 'i-iron', itemName: '鉄', weight, price, amount: lineAmount(weight, price, 'floor') }
    const s: Slip = { id: newId('s'), date: ymd(new Date()), vendorId: 'v-demo1', vendorName: '架空金属', lines: [line], total: line.amount, memo: 'スマホで入力', updatedAt: stamp() }
    b.slips[s.id] = s
    localStorage.setItem(REMOTE, JSON.stringify(sortBook(b)))
    bump()
    return s.id
  }
  w.__demoRemoteBook = () => parseBook(localStorage.getItem(REMOTE)!)
}
