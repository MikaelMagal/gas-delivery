import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { emptyDraft, parseDeliveryDraft } from './deliveryForm'
import type { DeliveryDraft } from './deliveryForm'

type Props = { onClose: () => void; onCreated: () => void; onLogout: (message?: string) => void }
export default function NewDeliveryForm({ onClose, onCreated, onLogout }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  const [draft, setDraft] = useState<DeliveryDraft>({ ...emptyDraft })
  const [manual, setManual] = useState(false)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<{ address: string; lat: number; lng: number }[]>([])
  const [locationLabel, setLocationLabel] = useState('')
  const lookup = useRef<AbortController | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => () => lookup.current?.abort(), [])
  function field(name: keyof DeliveryDraft, value: string) {
    if (name === 'address') {
      lookup.current?.abort()
      setSearching(false)
      setResults([])
      setLocationLabel('')
      setDraft(previous => ({ ...previous, address: value, lat: '', lng: '' }))
    } else setDraft(previous => ({ ...previous, [name]: value }))
  }
  async function searchAddress() {
    if (draft.address.trim().length < 5) { setError('Digite o endereço com número, bairro e cidade.'); return }
    lookup.current?.abort()
    const controller = new AbortController()
    lookup.current = controller
    setSearching(true); setError(''); setResults([])
    try {
      const response = await fetch(`/api/geocoding?address=${encodeURIComponent(draft.address.trim())}`, {
        signal: controller.signal,
      })
      if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); return }
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível buscar o endereço.')
      if (controller.signal.aborted) return
      setResults(data)
      if (!data.length) setError('Endereço não encontrado. Inclua bairro, cidade e estado ou use coordenadas manuais.')
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha na busca por endereço.')
    } finally { if (!controller.signal.aborted) setSearching(false) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    if (!draft.lat || !draft.lng) { setError('Busque o endereço e selecione um resultado para confirmar a localização.'); return }
    let payload
    try { payload = parseDeliveryDraft(draft) }
    catch (err) { setError(err instanceof Error ? err.message : 'Confira os campos.'); return }
    submitting.current = true
    setSaving(true)
    try {
      const response = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); return }
      if (response.status === 403) throw new Error('Seu perfil não tem permissão para cadastrar entregas.')
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : 'Não foi possível salvar a entrega. Confira os dados e tente novamente.')
      }
      onCreated()
    } catch (err) {
      setError(err instanceof TypeError ? 'Falha de conexão. Confira a listagem antes de tentar novamente: a entrega pode ter sido salva.' : err instanceof Error ? err.message : 'Não foi possível salvar a entrega.')
    } finally { submitting.current = false; setSaving(false) }
  }
  return <dialog ref={dialog} className="delivery-dialog new-delivery-dialog" aria-labelledby="new-delivery-title" onCancel={event => { event.preventDefault(); if (!submitting.current) onClose() }}>
    <div className="dialog-heading"><h2 id="new-delivery-title">Nova entrega</h2><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Fechar</button></div>
    <p className="form-help">Preencha os dados do pedido. Campos com * são obrigatórios.</p>
    <form onSubmit={submit} aria-busy={saving}>
      <fieldset disabled={saving} className="delivery-form-fields">
        <label htmlFor="customer-name">Cliente *</label><input autoFocus id="customer-name" autoComplete="name" required value={draft.customerName} onChange={e => field('customerName', e.target.value)} />
        <label htmlFor="customer-phone">Telefone</label><input id="customer-phone" type="tel" autoComplete="tel" value={draft.phone} onChange={e => field('phone', e.target.value)} />
        <label htmlFor="delivery-address">Endereço completo *</label><input id="delivery-address" autoComplete="street-address" required minLength={5} value={draft.address} onChange={e => field('address', e.target.value)} />
        <button type="button" className="secondary-button" disabled={searching} onClick={() => void searchAddress()}>{searching ? 'Buscando…' : 'Buscar endereço'}</button>
        <p className="form-help">Inclua número, bairro, cidade e estado. Confira o resultado antes de selecionar; a localização pode ser aproximada.</p>
        {results.length > 0 && <div className="address-results" aria-label="Endereços encontrados">{results.map((result, index) => <button type="button" className="secondary-button" key={index} onClick={() => {
          setDraft(previous => ({ ...previous, lat: String(result.lat), lng: String(result.lng) }))
          setLocationLabel(result.address); setResults([]); setManual(false); setError('')
        }}>{result.address}</button>)}</div>}
        {locationLabel && <p className="success-message" role="status">Localização selecionada: {locationLabel}. <a href={`https://www.openstreetmap.org/?mlat=${draft.lat}&mlon=${draft.lng}#map=18/${draft.lat}/${draft.lng}`} target="_blank" rel="noreferrer">Conferir no mapa</a></p>}
        <p className="form-help">Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
        <label htmlFor="delivery-product">Produto *</label><input id="delivery-product" required value={draft.product} onChange={e => field('product', e.target.value)} />
        <label htmlFor="delivery-quantity">Quantidade *</label><input id="delivery-quantity" type="number" required min="1" step="1" value={draft.quantity} onChange={e => field('quantity', e.target.value)} />
        <label htmlFor="delivery-notes">Observações</label><textarea id="delivery-notes" rows={3} value={draft.notes} onChange={e => field('notes', e.target.value)} />
        <button type="button" className="secondary-button" aria-expanded={manual} onClick={() => setManual(value => !value)}>{manual ? 'Ocultar coordenadas manuais' : 'Usar ou ajustar coordenadas manualmente'}</button>
        {manual && <>
        <p className="form-help" id="coordinates-help">Alternativa manual: informe as coordenadas do destino. Aceita ponto ou vírgula decimal.</p>
        <div className="coordinate-fields"><div><label htmlFor="delivery-lat">Latitude *</label><input id="delivery-lat" type="text" inputMode="decimal" required={manual} placeholder="Ex.: -23.5505" aria-describedby="coordinates-help" value={draft.lat} onChange={e => field('lat', e.target.value)} /></div><div><label htmlFor="delivery-lng">Longitude *</label><input id="delivery-lng" type="text" inputMode="decimal" required={manual} placeholder="Ex.: -46.6333" aria-describedby="coordinates-help" value={draft.lng} onChange={e => field('lng', e.target.value)} /></div></div>
        </>}
      </fieldset>
      {error && <div className="error-message" role="alert">{error}</div>}
      <div className="form-actions"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving || searching}>{saving ? 'Salvando…' : 'Cadastrar entrega'}</button></div>
    </form>
  </dialog>
}



