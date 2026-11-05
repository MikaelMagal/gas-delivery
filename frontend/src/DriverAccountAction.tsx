import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Driver } from './types'
export default function DriverAccountAction({ driver, mode, onLogout, onClose, onDone }: {
  driver: Driver; mode: 'remove' | 'password'; onLogout: (message?: string) => void; onClose: () => void; onDone: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  useEffect(() => { dialog.current?.showModal() }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') || '')
    if (mode === 'password') {
      if (password !== data.get('confirm')) { setError('As senhas não coincidem.'); return }
      if (new TextEncoder().encode(password).length > 72) { setError('Senha muito longa; use menos caracteres.'); return }
    }
    busy.current = true; setSaving(true); setError('')
    try {
      const response = await fetch(`/api/drivers/${encodeURIComponent(driver.id)}${mode === 'password' ? '/password' : ''}`, {
        method: mode === 'password' ? 'PATCH' : 'DELETE', headers: { 'Content-Type': 'application/json' },
        ...(mode === 'password' ? { body: JSON.stringify({ password }) } : {}),
      })
      if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); return }
      if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.error || 'Não foi possível concluir a operação.') }
      onDone()
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha na operação.') }
    finally { busy.current = false; setSaving(false) }
  }
  return <dialog ref={dialog} className="delivery-dialog" aria-labelledby="account-action-title" onCancel={event => { event.preventDefault(); if (!busy.current) onClose() }}><h2 id="account-action-title">{mode === 'remove' ? 'Remover motoboy' : 'Alterar senha'}: {driver.name}</h2><form onSubmit={submit}>{mode === 'remove' ? <p>A conta será desativada e perderá acesso. O histórico será preservado. Encerre o turno e reatribua ou finalize as entregas abertas antes de remover.</p> : <><p className="form-help">As sessões anteriores serão encerradas. Informe a nova senha ao motoboy.</p><label htmlFor="reset-driver-password">Nova senha</label><input id="reset-driver-password" name="password" type="password" autoComplete="new-password" minLength={6} maxLength={72} required disabled={saving} /><label htmlFor="confirm-driver-password">Confirmar nova senha</label><input id="confirm-driver-password" name="confirm" type="password" autoComplete="new-password" required disabled={saving} /></>}{error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Salvando…' : mode === 'remove' ? 'Confirmar remoção' : 'Salvar nova senha'}</button></div></form></dialog>
}


