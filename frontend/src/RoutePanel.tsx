import { useEffect, useState } from 'react'
import DeliveryMap from './DeliveryMap'
import type { Delivery } from './types'
import { labels } from './types'
import { currentPosition } from './geolocation'
import { navigationLinks, validPoint } from './navigation'
import type { Point } from './navigation'
type RoadRoute = { coords: { latitude: number; longitude: number }[]; distanceM: number; durationS: number }
export function NavigationLinks({ delivery }: { delivery: Delivery }) {
  const links = navigationLinks(delivery)
  return links ? <div className="navigation-links"><a className="secondary-button" href={links.google} target="_blank" rel="noopener noreferrer">Google Maps</a><a className="secondary-button" href={links.waze} target="_blank" rel="noopener noreferrer">Waze</a></div> : <p className="form-help">Destino sem coordenadas válidas. Solicite a correção ao administrador.</p>
}
export default function RoutePanel({ deliveries, onLogout, title = 'Mapa e paradas' }: { deliveries: Delivery[]; onLogout: (message?: string) => void; title?: string }) {
  const stops = deliveries.filter(d => d.status !== 'CANCELED')
  const current = stops.find(d => d.status === 'EN_ROUTE')
  const [chosenId, setChosenId] = useState('')
  const selected = stops.find(d => d.id === chosenId) || current || stops.find(d => d.status === 'PENDING') || stops[0]
  const [settings, setSettings] = useState<{ roadRoutesAvailable: boolean; tilesEnabled: boolean } | null>(null)
  const [error, setError] = useState('')
  const [tileError, setTileError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [routeState, setRouteState] = useState<{ deliveryId: string; destination: Point; origin: Point; route: RoadRoute } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/route/status', { signal: controller.signal }).then(async response => {
      if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); return }
      if (!response.ok) throw new Error('Não foi possível consultar a disponibilidade de trajetos. Os links externos continuam disponíveis.')
      const data = await response.json()
      if (!controller.signal.aborted) { setSettings(data); setError('') }
    }).catch(err => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [onLogout, retry])
  const selectedId = selected?.id
  const selectedLat = selected?.lat
  const selectedLng = selected?.lng
  useEffect(() => {
    if (!loading || !selectedId || selectedLat === undefined || selectedLng === undefined) return
    const controller = new AbortController()
    async function loadRoute() {
      try {
        const origin = await currentPosition()
        if (controller.signal.aborted) return
        const params = new URLSearchParams({ fromLat: String(origin.lat), fromLng: String(origin.lng) })
        const response = await fetch(`/api/route/delivery/${encodeURIComponent(selectedId!)}?${params}`, { signal: controller.signal })
        if (response.status === 401) { onLogout('Sua sessão expirou. Entre novamente.'); return }
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Falha ao calcular trajeto.')
        if (!controller.signal.aborted) setRouteState({ deliveryId: selectedId!, destination: { lat: selectedLat!, lng: selectedLng! }, origin, route: data })
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha na consulta de trajeto.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void loadRoute()
    return () => controller.abort()
  }, [loading, selectedId, selectedLat, selectedLng, onLogout])
  const shownRoute = routeState?.deliveryId === selected?.id && routeState?.destination.lat === selected?.lat && routeState?.destination.lng === selected?.lng ? routeState : null
  return <section className="route-panel"><h2>{title}</h2><p className="form-help">Destinos numerados na sequência exibida. Marcador laranja: em rota. Não há otimização automática nem rastreamento contínuo.</p>{!stops.length ? <p>Nenhuma entrega disponível para exibir no mapa.</p> : <>
    <DeliveryMap deliveries={stops} currentId={current?.id} selectedId={selected?.id} onSelect={setChosenId} route={shownRoute?.route.coords.map(p => ({ lat: p.latitude, lng: p.longitude })) || []} origin={shownRoute?.origin || null} tilesEnabled={settings?.tilesEnabled !== false} onTileError={() => setTileError(true)} />
    {tileError && <p className="error-message" role="status">O fundo do mapa não carregou por completo. Use os destinos e links abaixo.</p>}{settings?.tilesEnabled === false && <p className="form-help">Fundo do mapa desativado pelo servidor. Os pontos e os links continuam disponíveis.</p>}
    {selected && <div className="route-destination"><h3>{selected.customerName}</h3><p>{selected.address}</p><NavigationLinks delivery={selected} /><button className="secondary-button" disabled={loading || !settings?.roadRoutesAvailable || !validPoint(selected)} onClick={() => { setError(''); setRouteState(null); setLoading(true) }}>{loading ? 'Consultando GPS e trajeto…' : 'Traçar da minha posição até este destino'}</button><p className="form-help">A localização só é solicitada ao tocar nesse botão. A navegação externa recebe as coordenadas do destino ao abrir.</p></div>}
    {!settings ? <p className="form-help">Consultando disponibilidade de trajetos…</p> : !settings.roadRoutesAvailable && <p className="form-help">Mapbox não configurado: o trajeto por ruas não está disponível aqui. Use Google Maps ou Waze; os marcadores continuam funcionando.</p>}
    {shownRoute && <p className="form-help">Trajeto estimado: {(shownRoute.route.distanceM / 1000).toFixed(1)} km · {Math.ceil(shownRoute.route.durationS / 60)} min. Consulte novamente se mudar de posição; não considera trânsito em tempo real.</p>}
    <ol className="route-stop-list">{stops.map(d => <li key={d.id}><button className={d.id === selected?.id ? 'secondary-button selected-stop' : 'secondary-button'} onClick={() => setChosenId(d.id)}>{d.customerName} · {labels[d.status]}{d.driver ? ` · ${d.driver.name}` : ''}</button></li>)}</ol>
    <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Informar problema no mapa</a>
  </>}{error && <div className="error-message" role="alert">{error}<button className="secondary-button" onClick={() => { setError(''); setRetry(v => v + 1) }}>Verificar disponibilidade novamente</button></div>}</section>
}

