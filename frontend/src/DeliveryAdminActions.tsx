import { labels } from './types'
import type { Status } from './types'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Delivery } from './types'
type Props = { delivery: Delivery; onClose: () => void; onDone: () => void; onLogout: (message?: string) => void }
export function ReopenDelivery({ delivery, onClose, onDone, onLogout }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const busy = useRef(false)
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    if (reason.trim().length < 5) { setError('Informe um motivo com pelo menos 5 caracteres.'); return }
    busy.current = true; setSaving(true); setError('')
    try {
      const response = await fetch(`/api/deliveries/${encodeURIComponent(delivery.id)}/reopen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim(), expectedUpdatedAt: delivery.updatedAt }) })
      if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); return }
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error || 'Não foi possível reabrir a entrega.') }
      onDone()
    } catch (err) { setError(err instanceof TypeError ? 'Falha de conexão. Confira a listagem antes de repetir.' : err instanceof Error ? err.message : 'Falha ao reabrir.') }
    finally { busy.current = false; setSaving(false) }
  }
  return <dialog ref={dialog} className="delivery-dialog" aria-labelledby="reopen-title" onCancel={event => { event.preventDefault(); if (!busy.current) onClose() }}><h2 id="reopen-title">Reabrir entrega de {delivery.customerName}</h2><p>A entrega voltará a pendente. O comprovante anterior será preservado no histórico. A parada atual do motoboy continuará em rota.</p><p className="form-help">A atribuição será mantida se o motoboy ainda estiver ativo; caso contrário, atribua novamente após reabrir.</p><form onSubmit={submit}><label htmlFor="reopen-reason">Motivo da correção *</label><textarea autoFocus id="reopen-reason" rows={3} required minLength={5} maxLength={500} disabled={saving} value={reason} onChange={event => setReason(event.target.value)} />{error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><button className="secondary-button" type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Reabrindo…' : 'Confirmar reabertura'}</button></div></form></dialog>
}

type Change = { beforeDriverName: string | null; afterDriverName: string | null; id: string; action: string; reason: string | null; createdAt: string; actor: { name: string }; before: Record<string, unknown>; after: Record<string, unknown> }
const names: Record<string, string> = { customerName: 'Cliente', phone: 'Telefone', address: 'Endereço', product: 'Produto', quantity: 'Quantidade', notes: 'Observações', lat: 'Latitude', lng: 'Longitude', status: 'Status', driverId: 'Motoboy', sortOrder: 'Ordem', deliveredAt: 'Conclusão em', deliveredLat: 'Latitude da confirmação', deliveredLng: 'Longitude da confirmação', deliveredDistanceM: 'Distância da confirmação (m)' }
function changeTitle(change: Change) {
  if (change.action === 'REOPEN') return 'Reabertura'
  const before = change.before.driverId ?? null
  const after = change.after.driverId ?? null
  if (before !== after) return !after ? 'Remoção de atribuição' : !before ? 'Atribuição' : 'Troca de motoboy'
  return 'Edição'
}
function changeValue(change: Change, side: 'before' | 'after', key: string) {
  const value = change[side][key]
  if (key === 'driverId') return !value ? 'Não atribuído' : (side === 'before' ? change.beforeDriverName : change.afterDriverName) || 'Motoboy indisponível'
  if (value === null || value === undefined || value === '') return 'Não informado'
  if (key === 'status' && typeof value === 'string' && value in labels) return labels[value as Status]
  if (key === 'deliveredAt' && typeof value === 'string') return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  return String(value)
}
export function DeliveryHistory({ delivery, onClose, onLogout }: Omit<Props, 'onDone'>) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [changes, setChanges] = useState<Change[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/deliveries/${encodeURIComponent(delivery.id)}/history`, { signal: controller.signal })
        if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); return }
        if (!response.ok) throw new Error('Não foi possível carregar o histórico. Feche e tente novamente.')
        const data: Change[] = await response.json()
        if (!controller.signal.aborted) setChanges(data)
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha de conexão.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [delivery.id, onLogout])
  return <dialog ref={dialog} className="delivery-dialog" aria-labelledby="history-title" onCancel={onClose}><div className="dialog-heading"><h2 id="history-title">Histórico de alterações</h2><button autoFocus className="secondary-button" onClick={onClose}>Fechar</button></div>{loading ? <p role="status">Carregando…</p> : error ? <p role="alert">{error}</p> : !changes.length ? <p>Nenhuma alteração administrativa registrada. O histórico começa a partir desta versão.</p> : <><p className="form-help">Até 100 alterações mais recentes. Valores anteriores → novos valores.</p>{changes.map(change => <article key={change.id}><h3>{changeTitle(change)} · {change.actor.name}</h3><p>{new Date(change.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>{change.reason && <p>Motivo: {change.reason}</p>}<dl>{Object.entries(names).filter(([key]) => (change.action !== 'REOPEN' || key === 'status' || key === 'driverId') && JSON.stringify(change.before[key]) !== JSON.stringify(change.after[key])).map(([key, name]) => <div key={key}><dt>{name}</dt><dd>{changeValue(change, 'before', key)} → {changeValue(change, 'after', key)}</dd></div>)}</dl></article>)}</>}</dialog>
}


