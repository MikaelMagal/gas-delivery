import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Delivery } from './types'
import type { Point } from './navigation'
import { validPoint } from './navigation'
export default function DeliveryMap({ deliveries, currentId, selectedId, onSelect, route, origin, tilesEnabled, onTileError }: {
  deliveries: Delivery[]; currentId?: string; selectedId?: string; onSelect: (id: string) => void;
  route: Point[]; origin: Point | null; tilesEnabled: boolean; onTileError: () => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const group = useRef<L.FeatureGroup | null>(null)
  const onTileErrorRef = useRef(onTileError)
  useEffect(() => { onTileErrorRef.current = onTileError }, [onTileError])
  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { scrollWheelZoom: false, attributionControl: true })
    instance.setView([0, 0], 2)
    map.current = instance
    group.current = L.featureGroup().addTo(instance)
    let tiles: L.TileLayer | undefined
    if (tilesEnabled) {
      tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(instance)
      tiles.on('tileerror', () => onTileErrorRef.current())
    }
    const resize = new ResizeObserver(() => instance.invalidateSize())
    resize.observe(container.current)
    return () => { resize.disconnect(); instance.remove(); map.current = null; group.current = null }
  }, [tilesEnabled])
  useEffect(() => {
    const instance = map.current
    const markers = group.current
    if (!instance || !markers) return
    markers.clearLayers()
    deliveries.forEach((delivery, index) => {
      if (!validPoint(delivery)) return
      const label = document.createElement('span')
      label.textContent = `${index + 1}. ${delivery.customerName} — ${delivery.address}`
      const number = document.createElement('span')
      number.textContent = String(index + 1)
      const active = delivery.id === currentId || delivery.status === 'EN_ROUTE'
      const chosen = delivery.id === selectedId
      const icon = L.divIcon({ html: number, className: `delivery-map-marker${active ? ' marker-current' : ''}${chosen ? ' marker-selected' : ''}`, iconSize: active ? [36, 36] : [28, 28], iconAnchor: active ? [18, 18] : [14, 14] })
      const marker = L.marker([delivery.lat, delivery.lng], { icon, title: `${index + 1}. ${delivery.customerName}`, keyboard: true }).bindTooltip(label)
      marker.on('click', () => onSelect(delivery.id))
      marker.addTo(markers)
    })
    if (origin && validPoint(origin)) L.circleMarker([origin.lat, origin.lng], { radius: 8, color: '#1d4ed8', fillOpacity: 1 }).bindTooltip('Sua posição na última consulta de trajeto').addTo(markers)
    if (route.length > 1) L.polyline(route.filter(validPoint).map((p): L.LatLngTuple => [p.lat, p.lng]), { color: '#2563eb', weight: 5 }).addTo(markers)
    const bounds = markers.getBounds()
    if (bounds.isValid()) instance.fitBounds(bounds, { padding: [36, 36], maxZoom: 16, animate: false })
  }, [deliveries, currentId, selectedId, onSelect, route, origin, tilesEnabled])
  return <div ref={container} className="delivery-map" role="region" aria-label="Mapa dos destinos de entrega. Use a lista abaixo como alternativa acessível." />
}


