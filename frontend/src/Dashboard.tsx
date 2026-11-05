import RoutePanel from './RoutePanel'
import DeliveryReport from './DeliveryReport'
import { ReopenDelivery, DeliveryHistory } from './DeliveryAdminActions'
import DriversPanel, { AssignDriver } from './DriversPanel'
import NewDeliveryForm from './NewDeliveryForm'
import { useEffect, useRef, useState } from 'react'
import { Flame, LayoutDashboard, List, LogOut, RefreshCw } from 'lucide-react'
import type { Session, Delivery, Status } from './types'
import { labels } from './types'
export default function Dashboard({ session, onLogout }: { session: Session; onLogout: (message?: string) => void }) {
  const [mapDriver, setMapDriver] = useState('')
  const [editing, setEditing] = useState<Delivery | null>(null)
  const [reopening, setReopening] = useState<Delivery | null>(null)
  const [history, setHistory] = useState<Delivery | null>(null)
  const [assigning, setAssigning] = useState<Delivery | null>(null)
  const [creating, setCreating] = useState(false)
  const [success, setSuccess] = useState('')
  const [items, setItems] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [page, setPage] = useState('overview')
  const [selected, setSelected] = useState<Delivery | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close() }, [selected])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true); setError('')
      try {
        const response = await fetch('/api/deliveries', { signal: controller.signal })
        if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); return }
        if (response.status === 403) throw new Error('Seu perfil não tem acesso ao painel administrativo.')
        if (!response.ok) throw new Error('Não foi possível carregar as entregas. Tente novamente.')
        const data: Delivery[] = await response.json()
        if (!Array.isArray(data)) throw new Error('Resposta de entregas inválida.')
        if (!controller.signal.aborted) setItems(data)
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha de conexão com a API.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [session.user.id, refresh, onLogout])
  const query = search.trim().toLocaleLowerCase('pt-BR')
  const filtered = items.filter(d => (!status || status === d.status) && [d.customerName, d.address, d.product, d.driver?.name ?? ''].some(v => v.toLocaleLowerCase('pt-BR').includes(query)))
  const stats = [['Total de entregas', items.length], ['Pendentes', items.filter(d => d.status === 'PENDING').length], ['Em rota', items.filter(d => d.status === 'EN_ROUTE').length], ['Concluídas', items.filter(d => d.status === 'DELIVERED').length]]
  return <div className="dashboard-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-icon"><Flame /></div><span>Gás<span className="brand-highlight">Express</span></span></div><p className="eyebrow">PAINEL ADMINISTRATIVO</p><nav aria-label="Navegação principal"><button aria-current={page === 'overview' ? 'page' : undefined} onClick={() => setPage('overview')}><LayoutDashboard size={20} />Visão geral</button><button aria-current={page === 'deliveries' ? 'page' : undefined} onClick={() => setPage('deliveries')}><List size={20} />Entregas</button><button aria-current={page === 'drivers' ? 'page' : undefined} onClick={() => setPage('drivers')}>Motoboys</button><button aria-current={page === 'report' ? 'page' : undefined} onClick={() => setPage('report')}>Histórico de entregas</button><button aria-current={page === 'map' ? 'page' : undefined} onClick={() => setPage('map')}>Mapa e paradas</button></nav><div className="sidebar-account"><strong>{session.user.name}</strong><span>Administrador</span><button className="secondary-button" onClick={() => onLogout()}><LogOut size={18} />Sair da conta</button></div></aside>
    <div className="dashboard-main"><header className="dashboard-header"><div><p className="eyebrow">OPERAÇÃO DE ENTREGAS</p><h1>{page === 'overview' ? 'Visão geral' : page === 'drivers' ? 'Motoboys' : page === 'report' ? 'Histórico de entregas' : page === 'map' ? 'Mapa e paradas' : 'Entregas'}</h1></div><div className="header-actions"><button className="primary-button" onClick={() => { setSuccess(''); setCreating(true) }}>Nova entrega</button><button className="secondary-button" disabled={loading} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={17} />{loading ? 'Carregando…' : 'Atualizar'}</button></div></header><main className="dashboard-content">{success && <p className="success-message" role="status">{success}</p>}<div hidden={page === 'drivers' || page === 'report' || page === 'map'}><p className="scope-note">Entregas criadas hoje e pendências anteriores. Canceladas estão incluídas no total.</p>
    {page === 'overview' && <section className="stats-grid" aria-label="Indicadores">{stats.map(([label, value]) => <article className="stat-card" key={label}><p>{label}</p><strong>{loading || error ? '—' : value}</strong></article>)}</section>}
    <section className="deliveries-panel" aria-labelledby="list-title" aria-busy={loading}><div className="panel-heading"><h2 id="list-title">Acompanhe as entregas</h2><p>Dados reais da sua operação</p></div><div className="delivery-filters"><label>Pesquisar<input type="search" placeholder="Cliente, endereço, produto ou motoboy" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Status<select value={status} onChange={e => setStatus(e.target.value as Status | '')}><option value="">Todos os status</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    {loading ? <p className="panel-state" role="status">Carregando entregas…</p> : error ? <div className="panel-state" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setRefresh(v => v + 1)}>Tentar novamente</button></div> : filtered.length === 0 ? <div className="panel-state"><h3>{items.length ? 'Nenhuma entrega corresponde aos filtros' : 'Nenhuma entrega neste período'}</h3><p>{items.length ? 'Ajuste a pesquisa ou o status.' : 'As entregas cadastradas na API aparecerão aqui.'}</p>{(search || status) && <button className="secondary-button" onClick={() => { setSearch(''); setStatus('') }}>Limpar filtros</button>}</div> : <><p className="results-count" role="status">{filtered.length} de {items.length} entregas</p><div className="table-scroll"><table><thead><tr>{['Cliente', 'Endereço', 'Produto', 'Motoboy', 'Status', 'Ações'].map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{filtered.map(d => <tr key={d.id}><td><strong>{d.customerName}</strong></td><td>{d.address}</td><td>{d.quantity} × {d.product}</td><td>{d.driver?.name ?? 'Não atribuído'}</td><td><span className={`status-badge status-${d.status}`}>{labels[d.status]}</span></td><td><button className="detail-button" aria-label={`Ver detalhes da entrega de ${d.customerName}`} onClick={() => setSelected(d)}>Ver detalhes</button><button className="detail-button" onClick={() => setEditing(d)}>Editar entrega</button><button className="detail-button" onClick={() => setHistory(d)}>Histórico</button>{(d.status === 'DELIVERED' || d.status === 'CANCELED') && <button className="detail-button" onClick={() => setReopening(d)}>Reabrir entrega</button>}{d.status === 'PENDING' && <button className="detail-button" onClick={() => setAssigning(d)} aria-label={`Atribuir motoboy à entrega de ${d.customerName}`}>{d.driver ? 'Trocar motoboy' : 'Atribuir motoboy'}</button>}</td></tr>)}</tbody></table></div></>}
    </section></div>{page === 'map' && <><label className="map-driver-filter">Motoboy<select value={mapDriver} onChange={event => setMapDriver(event.target.value)}><option value="">Todos os motoboys</option><option value="unassigned">Não atribuídas</option>{Array.from(new Map(items.filter(d => d.driver).map(d => [d.driver!.id, d.driver!])).values()).map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>{loading ? <p role="status">Carregando destinos…</p> : error ? <p className="error-message" role="alert">{error}</p> : <RoutePanel deliveries={items.filter(d => !mapDriver || (mapDriver === 'unassigned' ? !d.driver : d.driver?.id === mapDriver))} onLogout={onLogout} title="Destinos da operação" />}</>}{page === 'report' && <DeliveryReport onLogout={onLogout} onInspect={setSelected} onEdit={setEditing} onReopen={setReopening} onHistory={setHistory} revision={refresh} />}{page === 'drivers' && <DriversPanel session={session} onLogout={onLogout} />}</main></div>
    {editing && <NewDeliveryForm delivery={editing} onLogout={onLogout} onClose={() => setEditing(null)} onCreated={() => { setEditing(null); setSuccess('Entrega atualizada.'); setRefresh(v => v + 1) }} />}
    {reopening && <ReopenDelivery delivery={reopening} onLogout={onLogout} onClose={() => setReopening(null)} onDone={() => { setReopening(null); setStatus(''); setSearch(''); setSuccess('Entrega reaberta como pendente. Comprovante anterior preservado no histórico.'); setRefresh(v => v + 1) }} />}
    {history && <DeliveryHistory delivery={history} onLogout={onLogout} onClose={() => setHistory(null)} />}
    {assigning && <AssignDriver session={session} onLogout={onLogout} delivery={assigning} onClose={() => setAssigning(null)} onAssigned={() => { setAssigning(null); setSuccess('Motoboy atribuído com sucesso.'); setRefresh(v => v + 1) }} />}
    {creating && <NewDeliveryForm onLogout={onLogout} onClose={() => setCreating(false)} onCreated={() => {
      setCreating(false)
      setSearch('')
      setStatus('')
      setSuccess('Entrega cadastrada com sucesso.')
      setRefresh(value => value + 1)
    }} />}
    <dialog ref={dialog} className="delivery-dialog" onCancel={() => setSelected(null)} aria-labelledby="detail-title">{selected && <><div className="dialog-heading"><h2 id="detail-title">Detalhes da entrega</h2><button className="secondary-button" autoFocus onClick={() => setSelected(null)}>Fechar</button></div><dl>{[['Cliente', selected.customerName], ['Telefone', selected.phone || 'Não informado'], ['Endereço', selected.address], ['Produto', `${selected.quantity} × ${selected.product}`], ['Motoboy', selected.driver?.name || 'Não atribuído'], ['Status', labels[selected.status]], ['Observações', selected.notes || 'Sem observações'], ['Criada em', new Date(selected.createdAt).toLocaleString('pt-BR')], ['Concluída em', selected.deliveredAt ? new Date(selected.deliveredAt).toLocaleString('pt-BR') : 'Não concluída']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></>}</dialog>
  </div>
}







