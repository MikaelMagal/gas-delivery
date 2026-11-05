import test from 'node:test'
import assert from 'node:assert/strict'
import { navigationLinks, validPoint } from '../src/navigation.ts'
test('navigation links use the real destination with correct Google and Waze parameters', () => {
  const links = navigationLinks({ lat: -23.5505, lng: -46.6333 })
  assert.ok(links)
  const google = new URL(links.google)
  assert.equal(google.origin, 'https://www.google.com')
  assert.equal(google.searchParams.get('api'), '1')
  assert.equal(google.searchParams.get('destination'), '-23.5505,-46.6333')
  assert.equal(google.searchParams.get('dir_action'), 'navigate')
  const waze = new URL(links.waze)
  assert.equal(waze.origin, 'https://www.waze.com')
  assert.equal(waze.searchParams.get('ll'), '-23.5505,-46.6333')
  assert.equal(waze.searchParams.get('navigate'), 'yes')
  assert.ok(navigationLinks({ lat: 0, lng: 0 }))
})
test('invalid destinations never produce navigation URLs', () => {
  for (const point of [{ lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }]) {
    assert.equal(validPoint(point), false)
    assert.equal(navigationLinks(point), null)
  }
})
