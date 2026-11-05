import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
export type LiveStatus = 'connecting' | 'connected' | 'offline' | 'reconnecting' | 'paused'
export function useLiveUpdates(userId: string) {
  const [revision, setRevision] = useState(0)
  const [status, setStatus] = useState<LiveStatus>('connecting')
  useEffect(() => {
    const socket = io({ autoConnect: false, withCredentials: true, reconnectionDelay: 1000, reconnectionDelayMax: 10000, timeout: 15000 })
    let timer: ReturnType<typeof setTimeout> | undefined
    function invalidate() {
      if (document.hidden || timer) return
      timer = setTimeout(() => { timer = undefined; setRevision(value => value + 1) }, 250)
    }
    socket.on('connect', () => { setStatus('connected'); invalidate() })
    socket.on('disconnect', () => { setStatus(document.hidden ? 'paused' : navigator.onLine ? 'reconnecting' : 'offline'); invalidate() })
    socket.on('connect_error', () => { setStatus(navigator.onLine ? 'reconnecting' : 'offline'); invalidate() })
    for (const event of ['delivery:updated', 'delivery:assigned', 'driver:shift', 'driver:location', 'driver:updated']) socket.on(event, invalidate)
    function resume() {
      if (document.hidden) { if (timer) clearTimeout(timer); timer = undefined; socket.disconnect(); setStatus('paused'); return }
      if (!navigator.onLine) { socket.disconnect(); setStatus('offline'); return }
      setStatus(socket.connected ? 'connected' : 'connecting')
      if (!socket.connected) socket.connect()
      invalidate()
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    window.addEventListener('offline', resume)
    // A visible screen can still recover if WebSocket is unavailable. No background keep-alive.
    const fallback = setInterval(() => {
      if (!document.hidden && navigator.onLine && !socket.connected) { invalidate(); socket.connect() }
    }, 60000)
    resume()
    return () => {
      if (timer) clearTimeout(timer)
      clearInterval(fallback)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', resume)
      socket.removeAllListeners(); socket.disconnect()
    }
  }, [userId])
  return { revision, status }
}
export const liveLabels: Record<LiveStatus, string> = {
  connecting: 'Conectando atualizações automáticas…', connected: 'Atualizações automáticas conectadas',
  offline: 'Sem internet. Reconecte para atualizar os dados.', reconnecting: 'Reconectando. Os dados podem estar desatualizados.',
  paused: 'Atualizações pausadas enquanto a aba está em segundo plano.',
}

