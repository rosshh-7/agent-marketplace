import { categoryMeta } from '../data/agents'
import type { Category } from '../types'

export default function CategoryBadge({ category }: { category: Category }) {
  const meta = categoryMeta[category]
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${meta.color}`}>
      {meta.icon} {meta.label}
    </span>
  )
}
