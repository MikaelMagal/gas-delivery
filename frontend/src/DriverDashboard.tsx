import { useLiveUpdates, liveLabels } from './useLiveUpdates'
import RoutePanel, { NavigationLinks } from './RoutePanel'
import { currentPosition } from './geolocation'
import { useEffect, useRef, useState } from 'react'
import { Flame, LogOut, Truck } from 'lucide-react'
import type { Delivery, Session } from './types'
import { labels } from './types'
type Shift = { id: string; startedAt: string; endedAt: string | null }
export default function DriverDashboard({ session, onLogout }: { session: Session; onLogout: (message?: string) => void }) {
  const live = useLiveUpdates(session.user.id)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [shift, setShift] = useState<Shift | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const responses = await Promise.all(['/deliveries/mine', '/shifts/current'].map(path => fetch(`/api${path}`, { signal: controller.signal })))
        if (responses.some(r => r.status === 401)) { onLogout('Sua sessão expirou ou foi encerrada. Entre novamente.'); return }
        if (responses.some(r => !r.ok)) throw new Error('Não foi possível carregar seu turno e suas entregas.')
        const [items, currentShift] = await Promise.all(responses.map(r => r.json()))
        if (!controller.signal.aborted) { setDeliveries(items); setShift(currentShift); setError('') }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha ao carregar os dados.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [session.user.id, onLogout, revision, live.revision])
  function reload() { setLoading(true); setError(''); setRevision(v => v + 1) }
  async function action(path: string, message: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setSuccess('')
    try {
      const response = await fetch(`/api${path}`, { method: 'POST' })
      if (response.status === 401) { onLogout('Sua sessão expirou ou foi encerrada. Entre novamente.'); return }
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error || 'Não foi possível concluir a operação.') }
      setSuccess(message); reload()
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha de conexão. Atualize antes de tentar novamente.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function complete(delivery: Delivery) {
    if (lock.current || !window.confirm(`Confirmar a entrega para ${delivery.customerName}? Sua localização será solicitada para registrar a entrega.`)) return
    lock.current = true; setBusy(true); setError(''); setSuccess('')
    try {
      const position = await currentPosition()
      const response = await fetch(`/api/deliveries/${encodeURIComponent(delivery.id)}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(position),
      })
      if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); return }
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error || 'Falha ao confirmar a entrega. Atualize a lista antes de tentar novamente.') }
      const result: Delivery & { nextDelivery: Delivery | null } = await response.json()
      setSuccess(result.nextDelivery ? `Entrega concluída. Próxima parada em rota: ${result.nextDelivery.customerName}.` : 'Entrega concluída. Nenhuma parada pendente; o turno continua aberto até você encerrá-lo.'); reload()
    } catch (err) { setError(err instanceof TypeError ? 'Falha de conexão. Atualize a lista antes de repetir: a confirmação pode ter sido registrada.' : err instanceof Error ? err.message : 'Não foi possível confirmar a entrega.') }
    finally { lock.current = false; setBusy(false) }
  }
  const current = deliveries.find(d => d.status === 'EN_ROUTE')
  const pending = deliveries.filter(d => d.status === 'PENDING')
  const completed = deliveries.filter(d => d.status === 'DELIVERED').length
  const next = pending[0]
  const unavailable = busy || loading || !!error || live.status === 'offline'
  return <div className="driver-page"><header className="driver-header"><div className="brand"><div className="brand-icon"><Flame /></div><span>Gás<span className="brand-highlight">Express</span></span></div><button className="secondary-button" onClick={() => onLogout()}><LogOut size={18} />Sair</button></header><main className="driver-content"><p className={`live-status live-${live.status}`} role="status">{liveLabels[live.status]}</p><p className="eyebrow">PAINEL DO MOTOBOY</p><h1>Olá, {session.user.name}</h1><p className="scope-note">Entregas de hoje e pendências anteriores, na ordem definida pela administração.</p>
    <section className="driver-card"><div className="driver-section-heading"><div><h2>{loading ? 'Carregando turno…' : shift ? 'Turno ativo' : 'Turno encerrado'}</h2>{shift && !loading && <p>Iniciado em {new Date(shift.startedAt).toLocaleString('pt-BR')}</p>}</div><Truck /></div>{shift ? <button className="secondary-button" disabled={unavailable} onClick={() => { if (window.confirm('Encerrar o turno? A parada em rota voltará a ficar pendente.')) void action('/shifts/end', 'Turno encerrado. Entregas abertas continuam pendentes.') }}>Encerrar turno</button> : <button className="primary-button" disabled={unavailable} onClick={() => void action('/shifts/start', 'Turno iniciado.')}>Iniciar turno</button>}</section>
    {success && <p className="success-message" role="status">{success}</p>}{error && <p className="error-message" role="alert">{error}</p>}<button className="secondary-button" disabled={loading || busy} onClick={reload}>Atualizar dados</button>
    {loading ? <p role="status" className="panel-state">Carregando entregas…</p> : !error && <><section className="driver-card"><h2>Progresso das entregas</h2><p>{completed} de {deliveries.length} concluídas · {pending.length} pendentes</p><progress max={deliveries.length || 1} value={completed} aria-label="Entregas concluídas" /></section>
    <section className="driver-card current-stop"><p className="eyebrow">PARADA ATUAL</p>{current ? <><h2>{current.customerName}</h2><p>{current.address}</p><p>{current.quantity} × {current.product}</p><p>{current.notes || 'Sem observações'}</p><span className="status-badge status-EN_ROUTE">Em rota</span><NavigationLinks delivery={current} /><button className="primary-button complete-delivery-button" disabled={unavailable || !shift} onClick={() => void complete(current)}>{busy ? 'Aguarde…' : 'Marcar como entregue'}</button></> : <><h2>{next ? 'Pronto para começar?' : 'Nenhuma parada em rota'}</h2><p>{next ? `Próxima parada: ${next.customerName}` : 'Atualize para consultar novas atribuições.'}</p></>}{next && <><button className="primary-button" disabled={unavailable || !shift} onClick={() => void action(`/deliveries/${encodeURIComponent(next.id)}/start`, 'Parada atualizada. A parada anterior, se houver, permanece pendente.')}>{current ? 'Ir para próxima parada pendente' : 'Iniciar rota'}</button>{current && <p className="form-help">Trocar de parada não confirma a entrega anterior; ela permanece pendente.</p>}</>}{!shift && pending.length > 0 && <p className="form-help">Inicie o turno para começar a rota.</p>}</section>
    <RoutePanel deliveries={deliveries} onLogout={onLogout} />
    <section aria-labelledby="my-deliveries"><h2 id="my-deliveries">Minhas entregas</h2>{!deliveries.length ? <p className="panel-state">Nenhuma entrega atribuída neste período.</p> : deliveries.map((delivery, index) => <article className={`driver-card ${current?.id === delivery.id ? 'current-stop' : ''}`} key={delivery.id}><div className="driver-section-heading"><h3>{index + 1}. {delivery.customerName}</h3><span className={`status-badge status-${delivery.status}`}>{labels[delivery.status]}</span></div><p>{delivery.address}</p><p>{delivery.quantity} × {delivery.product}</p>{delivery.phone && <p>Telefone: {delivery.phone}</p>}<p>Observações: {delivery.notes || 'Sem observações'}</p>{delivery.status === 'PENDING' && <button className="secondary-button" disabled={unavailable || !shift} onClick={() => void action(`/deliveries/${encodeURIComponent(delivery.id)}/start`, 'Parada selecionada. A parada anterior permanece pendente.')}>Ir para esta parada</button>}</article>)}</section></>}
  </main></div>
}





