// 入力画面・一覧などの「重ねて開く画面」を、スマホの「戻る」で閉じられるようにする。
// 開いたときに履歴を1つ積み、「戻る」(履歴が戻る)で閉じる。ボタンで閉じたときは積んだ履歴を取り消す。
// 重ねて開いたときは深さで見分け、いちばん上の画面だけが閉じる。
import { useEffect, useRef } from 'react'

const depthNow = () => ((history.state as { modalDepth?: number } | null)?.modalDepth ?? 0)

export function useBackClose(onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const my = depthNow() + 1
    history.pushState({ ...(history.state ?? {}), modalDepth: my }, '')
    let popped = false
    const onPop = () => {
      if (depthNow() < my) {
        popped = true
        closeRef.current()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!popped && depthNow() >= my) history.back() // ボタンで閉じた: 積んだ履歴を取り消す
    }
  }, [])
}
