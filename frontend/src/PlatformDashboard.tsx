import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from './types'

type Company = { id: string; name: string; active: boolean; users: { id: string; name: string; email: string; active: boolean }[] }
export default function PlatformDashboard({ onSession, onLogout }: { onSession: (s: Session) => void; onLogout: (message?: string) => void }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [target, setTarget] = useState('')
  async function request(path: string, method = 'GET', body?: unknown) {
    const r = await fetch(`/api/platform${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    if (r.status === 401) { onLogout('Sua sessão expirou.'); throw new Error('Entre novamente.') }
    const data = await r.json().catch(() => null)
    if (!r.ok) throw new Error(data?.error || 'Não foi possível concluir a operação.')
    return data
  }
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/platform/companies', { signal: controller.signal }).then(async r => {
      if (r.status === 401) { onLogout('Sua sessão expirou.'); return }
      if (!r.ok) throw new Error('Não foi possível carregar empresas.')
      setCompanies(await r.json())
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [revision, onLogout])
  async function perform(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await work(); setRevision(v => v + 1) } catch (e) { setError(e instanceof Error ? e.message : 'Falha de conexão. Confira os registros antes de repetir.') } finally { setBusy(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const admin = { name: String(data.get('adminName')), email: String(data.get('email')), password: String(data.get('password')) }
    void perform(async () => {
      if (target) await request(`/companies/${encodeURIComponent(target)}/admins`, 'POST', admin)
      else await request('/companies', 'POST', { name: String(data.get('companyName')), admin })
      form.reset(); setTarget('')
    })
  }
  return <main className="driver-content"><header><h1>Administração da plataforma</h1><button className="secondary-button" onClick={() => onLogout()}>Sair</button></header><p>Escolha uma empresa para acessar sua operação. Administradores de loja acessam somente sua empresa.</p>{error && <p className="error-message" role="alert">{error}</p>}<button className="secondary-button" disabled={busy} onClick={() => setRevision(v => v + 1)}>Atualizar empresas</button>
    <section className="driver-card"><h2>{target ? 'Adicionar administrador' : 'Criar empresa e administrador'}</h2><form onSubmit={submit}><fieldset disabled={busy} className="delivery-form-fields"><label>Empresa<select value={target} onChange={e => setTarget(e.target.value)}><option value="">Nova empresa</option>{companies.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{!target && <label>Nome da empresa<input name="companyName" required maxLength={160} /></label>}<label>Nome do administrador<input name="adminName" required maxLength={120} /></label><label>E-mail exclusivo<input name="email" type="email" required autoComplete="off" /></label><label>Senha inicial<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label><p>Senha única: de 12 caracteres a 72 bytes.</p><button className="primary-button">{busy ? 'Aguarde…' : 'Cadastrar'}</button></fieldset></form></section>
    {companies.map(c => <section className="driver-card" key={c.id}><h2>{c.name} · {c.active ? 'Ativa' : 'Desativada'}</h2><button className="primary-button" disabled={busy || !c.active} onClick={() => void perform(async () => { onSession(await request('/access', 'POST', { companyId: c.id })) })}>Acessar operação</button><button className="secondary-button" disabled={busy} onClick={() => { if (window.confirm(`${c.active ? 'Desativar' : 'Ativar'} ${c.name}?`)) void perform(async () => { await request(`/companies/${c.id}`, 'PATCH', { active: !c.active }) }) }}>{c.active ? 'Desativar empresa' : 'Ativar empresa'}</button>{c.users.map(u => <article key={u.id}><h3>{u.name}</h3><p>{u.email} · {u.active ? 'Ativo' : 'Desativado'}</p><button className="secondary-button" disabled={busy} onClick={() => { if (window.confirm('Alterar acesso deste administrador?')) void perform(async () => { await request(`/admins/${u.id}`, 'PATCH', { active: !u.active }) }) }}>{u.active ? 'Desativar administrador' : 'Ativar administrador'}</button><form onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const password = String(new FormData(form).get('password')); void perform(async () => { await request(`/admins/${u.id}`, 'PATCH', { password }); form.reset() }) }}><label>Nova senha<input name="password" type="password" required minLength={12} autoComplete="new-password" disabled={busy} /></label><button className="secondary-button" disabled={busy}>Redefinir senha</button></form></article>)}</section>)}
  </main>
}
