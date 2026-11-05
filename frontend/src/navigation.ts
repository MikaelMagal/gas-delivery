export type Point = { lat: number; lng: number }
export function validPoint(point: Point): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
}
export function navigationLinks(point: Point) {
  if (!validPoint(point)) return null
  const destination = `${point.lat},${point.lng}`
  return {
    google: `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination, travelmode: 'driving', dir_action: 'navigate' })}`,
    waze: `https://www.waze.com/ul?${new URLSearchParams({ ll: destination, navigate: 'yes' })}`,
  }
}
