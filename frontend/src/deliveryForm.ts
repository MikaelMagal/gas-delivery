export type DeliveryDraft = {
  customerName: string
  phone: string
  address: string
  product: string
  quantity: string
  notes: string
  lat: string
  lng: string
}
export type CreateDeliveryInput = {
  customerName: string
  phone?: string
  address: string
  product: string
  quantity: number
  notes?: string
  lat: number
  lng: number
}
export const emptyDraft: DeliveryDraft = {
  customerName: '', phone: '', address: '', product: '', quantity: '1', notes: '', lat: '', lng: '',
}
// Boundary for a future geocoding provider: the API always receives validated coordinates.
export function parseDeliveryDraft(draft: DeliveryDraft): CreateDeliveryInput {
  const customerName = draft.customerName.trim()
  const address = draft.address.trim()
  const product = draft.product.trim()
  if (!customerName) throw new Error('Informe o nome do cliente.')
  if (address.length < 5) throw new Error('O endereço deve ter pelo menos 5 caracteres.')
  if (!product) throw new Error('Informe o produto.')
  const quantity = Number(draft.quantity)
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('A quantidade deve ser um número inteiro positivo.')
  // Empty coordinates must never be converted into a location at 0,0.
  const lat = Number(draft.lat.trim().replace(',', '.'))
  const lng = Number(draft.lng.trim().replace(',', '.'))
  if (!draft.lat.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Informe uma latitude válida entre -90 e 90.')
  if (!draft.lng.trim() || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Informe uma longitude válida entre -180 e 180.')
  return { customerName, address, product, quantity, lat, lng,
    ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
  }
}
