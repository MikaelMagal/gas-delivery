export type Session = { user: { id: string; name: string; role: 'ADMIN' | 'DRIVER' } }
export type Status = 'PENDING' | 'EN_ROUTE' | 'DELIVERED' | 'CANCELED'
export type Delivery = { lat: number; lng: number; updatedAt: string; id: string; customerName: string; address: string; product: string; quantity: number; status: Status; phone: string | null; notes: string | null; driver: { id: string; name: string } | null; createdAt: string; deliveredAt: string | null }
export const labels: Record<Status, string> = { PENDING: 'Pendente', EN_ROUTE: 'Em rota', DELIVERED: 'Concluída', CANCELED: 'Cancelada' }
export type Driver = {
  id: string
  name: string
  email: string
  onShift: boolean
  lastLocation: { lat: number; lng: number; recordedAt: string } | null
}



