// 表の品目名・業者名の欄。長い名前は2行まで折り返し、それ以上は…(スマホで表が崩れないように)
export default function NameCell({ name, color }: { name: string; color?: string }) {
  return (
    <td className="pt-name" title={name}>
      {color !== undefined && <span className="cat-dot" style={{ background: color }} />}
      <span className="pt-name-text">{name}</span>
    </td>
  )
}
