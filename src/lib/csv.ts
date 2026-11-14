// CSV の書き出し(Excel で開ける形)。1行 = 伝票の1品目
import { itemName, liveSlips, vendorName, type Book } from './model'

const cell = (v: string | number | undefined) => {
  const s = v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Excel で文字化けしないよう BOM 付き UTF-8 */
export const toCsv = (rows: (string | number | undefined)[][]) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'

/** 伝票の明細を CSV にする(日付の古い順) */
export function bookToCsv(book: Book): string {
  const slips = liveSlips(book).reverse()
  const rows: (string | number | undefined)[][] = [['日付', '業者', '品目', '計量重量kg', '正味重量kg', '単価(円/kg)', '金額', '伝票の総合計', '初回計量重量kg', 'メモ', '伝票ID']]
  for (const s of slips) {
    for (const l of s.lines) rows.push([s.date, vendorName(book, s), itemName(book, l), l.scale, l.weight, l.price, l.amount, s.total, s.firstWeight, s.memo, s.id])
  }
  return toCsv(rows)
}

/** ブラウザからファイルとして保存させる(スマホでは「ダウンロード」に入る) */
export function downloadText(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
