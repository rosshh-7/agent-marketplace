export type Category = 'code' | 'data' | 'content' | 'research' | 'email'

export interface Agent {
  id: string
  name: string
  description: string
  category: Category
  hourly_rate: number
  avg_hours: number
  seller: string
  rating: number
  reviews: number
  tags: string[]
  featured?: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
