import DriverAccountAction from './DriverAccountAction'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session, Driver, Delivery } from './types'

type Props = { session: Session; onLogout: (message?: string) => void }
async function request(path: string, onLogout: Props['onLogout'], options: RequestInit = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json' } })
  if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); throw new Error('Sessão expirada.') }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir a solicitação.')
  return data
}
export function AssignDriver({ session, onLogout, delivery, onClose, onAssigned }: Props & { delivery: Delivery; onClose: () => void; onAssigned: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [driverId, setDriverId] = useState(delivery.driver?.id || '')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    let active = true
    request('/drivers', onLogout).then(data => { if (active) setDrivers(data) }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session, onLogout, revision])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !driverId) return
    busy.current = true; setSaving(true); setError('')
    try { await request(`/deliveries/${encodeURIComponent(delivery.id)}`, onLogout, { method: 'PATCH', body: JSON.stringify({ driverId }) }); onAssigned() }
    catch (err) { setError(err instanceof Error ? err.message : 'Falha ao atribuir motoboy.') }
    finally { busy.current = false; setSaving(false) }
  }
  return <dialog ref={dialog} className="delivery-dialog" aria-labelledby="assign-title" onCancel={e => { e.preventDefault(); if (!busy.current) onClose() }}><h2 id="assign-title">Atribuir motoboy</h2><p>{delivery.customerName} · {delivery.address}</p><p className="form-help">Somente entregas pendentes podem ser atribuídas. O turno não precisa estar aberto.</p>{loading ? <p role="status">Carregando motoboys…</p> : <form onSubmit={submit}><label htmlFor="assign-driver">Motoboy ativo</label><select id="assign-driver" required disabled={saving} value={driverId} onChange={e => setDriverId(e.target.value)}><option value="">Selecione</option>{drivers.map(d => <option value={d.id} key={d.id}>{d.name} — {d.onShift ? 'Em turno' : 'Fora de turno'}</option>)}</select>{!drivers.length && <p>Nenhum motoboy disponível. Cadastre um na seção Motoboys.</p>}<div className="form-actions"><button className="primary-button" disabled={saving || !drivers.some(d => d.id === driverId)}>{saving ? 'Salvando…' : 'Confirmar atribuição'}</button></div></form>}{error && <div role="alert" className="error-message">{error}<button className="secondary-button" disabled={saving || loading} onClick={() => { setLoading(true); setError(''); setRevision(v => v + 1) }}>Recarregar motoboys</button></div>}<button className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button></dialog>
}

export default function DriversPanel({ session, onLogout, revisionFromParent = 0 }: Props & { revisionFromParent?: number }) {
  const [accountAction, setAccountAction] = useState<{ driver: Driver; mode: 'remove' | 'password' } | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    let active = true
    request('/drivers', onLogout).then(data => { if (active) setDrivers(data) }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session, onLogout, revision, revisionFromParent])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') || '').trim()
    const email = String(data.get('email') || '').trim().toLowerCase()
    const password = String(data.get('password') || '')
    if (!name) { setFormError('Informe o nome do motoboy.'); return }
    if (password.length < 6 || password.length > 72) { setFormError('A senha deve ter de 6 a 72 caracteres.'); return }
    if (new TextEncoder().encode(password).length > 72) { setFormError('Senha muito longa; use menos caracteres.'); return }
    busy.current = true; setSaving(true); setFormError(''); setSuccess('')
    try {
      await request('/drivers', onLogout, { method: 'POST', body: JSON.stringify({ name, email, password }) })
      form.current?.reset(); setSuccess('Motoboy cadastrado com sucesso.'); { setLoading(true); setError(''); setRevision(v => v + 1) }
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Falha no cadastro. Confira a listagem antes de tentar novamente.') }
    finally { busy.current = false; setSaving(false) }
  }
  return <div className="drivers-layout">{accountAction && <DriverAccountAction {...accountAction} onLogout={onLogout} onClose={() => setAccountAction(null)} onDone={() => { setSuccess(accountAction.mode === 'remove' ? 'Motoboy removido. Histórico preservado.' : 'Senha alterada. O motoboy deve entrar novamente.'); setAccountAction(null); setLoading(true); setError(''); setRevision(v => v + 1) }} />}<section className="deliveries-panel"><div className="panel-heading"><h2>Motoboys ativos</h2><button className="secondary-button" disabled={loading} onClick={() => { setLoading(true); setError(''); setRevision(v => v + 1) }}>Atualizar motoboys</button></div>{loading ? <p className="panel-state" role="status">Carregando motoboys…</p> : error ? <p className="panel-state" role="alert">{error}</p> : !drivers.length ? <p className="panel-state">Nenhum motoboy cadastrado.</p> : <div className="table-scroll"><table><thead><tr><th>Nome</th><th>Turno</th><th>Última localização</th><th>Ações</th></tr></thead><tbody>{drivers.map(d => <tr key={d.id}><td>{d.name}</td><td>{d.onShift ? 'Em turno' : 'Fora de turno'}</td><td>{d.lastLocation ? <><span>{d.lastLocation.lat.toFixed(5)}, {d.lastLocation.lng.toFixed(5)}</span><br /><small>{new Date(d.lastLocation.recordedAt).toLocaleString('pt-BR')}</small></> : 'Não informada'}</td><td><button className="detail-button" onClick={() => setAccountAction({ driver: d, mode: 'password' })}>Alterar senha</button><button className="detail-button" onClick={() => setAccountAction({ driver: d, mode: 'remove' })}>Remover</button></td></tr>)}</tbody></table></div>}</section><section className="deliveries-panel driver-registration"><h2>Cadastrar motoboy</h2><form ref={form} onSubmit={submit}><fieldset disabled={saving} className="delivery-form-fields"><label htmlFor="driver-name">Nome *</label><input id="driver-name" name="name" required autoComplete="off" /><label htmlFor="driver-email">E-mail *</label><input id="driver-email" name="email" type="email" required autoComplete="off" /><label htmlFor="driver-password">Senha inicial *</label><input id="driver-password" name="password" type="password" minLength={6} maxLength={72} required autoComplete="new-password" /><p className="form-help">De 6 a 72 caracteres. A senha não será exibida na listagem.</p></fieldset>{formError && <p role="alert" className="error-message">{formError}</p>}{success && <p role="status" className="success-message">{success}</p>}<button className="primary-button" disabled={saving}>{saving ? 'Cadastrando…' : 'Cadastrar motoboy'}</button></form></section></div>
}






