import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Delivery, Status } from './types'
import { labels } from './types'
type Filters = { from: string; to: string; dateBy: 'createdAt' | 'deliveredAt'; status: Status | ''; driverId: string; search: string }
type Result = { items: Delivery[]; total: number; page: number; totalPages: number; drivers: { id: string; name: string; active: boolean }[] }
function businessDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-')
}
const formatTime = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Não concluída'
export default function DeliveryReport({ onLogout, onInspect, onEdit, onReopen, onHistory, revision }: {
  onLogout: (message?: string) => void; onInspect: (d: Delivery) => void; onEdit: (d: Delivery) => void; onReopen: (d: Delivery) => void; onHistory: (d: Delivery) => void; revision: number
}) {
  const [filters, setFilters] = useState<Filters>(() => {
    const today = businessDate(new Date())
    return { from: today.slice(0, 8) + '01', to: today, dateBy: 'deliveredAt', status: 'DELIVERED', driverId: '', search: '' }
  })
  const [applied, setApplied] = useState(filters)
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const params = new URLSearchParams({ from: applied.from, to: applied.to, dateBy: applied.dateBy, page: String(page) })
        for (const field of ['status', 'driverId', 'search'] as const) if (applied[field]) params.set(field, applied[field])
        const response = await fetch(`/api/deliveries/report?${params}`, { signal: controller.signal })
        if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); return }
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o histórico.')
        if (!controller.signal.aborted) { setResult(data); setError('') }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha ao consultar histórico.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [applied, page, refresh, revision, onLogout])
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (filters.from > filters.to) { setError('A data inicial não pode ser posterior à final.'); return }
    setError(''); setLoading(true); setPage(1); setApplied({ ...filters }); setRefresh(v => v + 1)
  }
  function changePage(value: number) { setError(''); setLoading(true); setPage(value) }
  return <section className="deliveries-panel" aria-labelledby="report-title"><div className="panel-heading"><h2 id="report-title">Histórico de entregas</h2><p>Consulte por período. Datas e horários de Brasília (UTC−03). Até 366 dias por consulta.</p></div>
    <form className="report-filters" onSubmit={submit}><label>Data inicial<input type="date" required value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label><label>Data final<input type="date" required min={filters.from} value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label><label>Filtrar por data de<select value={filters.dateBy} onChange={e => setFilters({ ...filters, dateBy: e.target.value as Filters['dateBy'] })}><option value="deliveredAt">Conclusão</option><option value="createdAt">Cadastro</option></select></label><label>Status<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value as Filters['status'] })}><option value="">Todos</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Motoboy<select value={filters.driverId} onChange={e => setFilters({ ...filters, driverId: e.target.value })}><option value="">Todos</option>{result?.drivers.map(d => <option key={d.id} value={d.id}>{d.name}{!d.active ? ' (inativo)' : ''}</option>)}</select></label><label>Pesquisar<input type="search" maxLength={120} placeholder="Cliente, endereço ou produto" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} /></label><button className="primary-button" disabled={loading}>Consultar</button></form>
    <p className="scope-note report-note">Por conclusão, aparecem apenas entregas com confirmação válida atualmente. Para localizar pendentes, canceladas ou reabertas, filtre por cadastro. Comprovantes desfeitos ficam em “Histórico de alterações”.</p>
    {loading ? <p className="panel-state" role="status">Consultando entregas…</p> : error ? <p className="panel-state" role="alert">{error}</p> : !result?.items.length ? <p className="panel-state">Nenhuma entrega encontrada no período e filtros selecionados.</p> : <><p className="results-count" role="status">{result.total} entregas encontradas · Página {result.page} de {result.totalPages}</p><div className="table-scroll"><table><thead><tr>{['Cliente', 'Produto', 'Motoboy', 'Status', 'Cadastrada em', 'Concluída em', 'Ações'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{result.items.map(d => <tr key={d.id}><td><strong>{d.customerName}</strong><br />{d.address}</td><td>{d.quantity} × {d.product}</td><td>{d.driver?.name || 'Não atribuído'}<br /><small>{d.status === 'DELIVERED' ? 'Responsável pela entrega' : 'Atribuição atual'}</small></td><td><span className={`status-badge status-${d.status}`}>{labels[d.status]}</span></td><td>{formatTime(d.createdAt)}</td><td>{formatTime(d.deliveredAt)}</td><td><button className="detail-button" onClick={() => onInspect(d)}>Ver detalhes</button><button className="detail-button" onClick={() => onEdit(d)}>Editar entrega</button>{['DELIVERED', 'CANCELED'].includes(d.status) && <button className="detail-button" onClick={() => onReopen(d)}>Reabrir entrega</button>}<button className="detail-button" onClick={() => onHistory(d)}>Histórico de alterações</button></td></tr>)}</tbody></table></div><div className="report-pagination"><button className="secondary-button" disabled={result.page <= 1} onClick={() => changePage(result.page - 1)}>Anterior</button><button className="secondary-button" disabled={result.page >= result.totalPages} onClick={() => changePage(result.page + 1)}>Próxima</button></div></>}
  </section>
}

