import test from 'node:test'
import assert from 'node:assert/strict'
import { currentPosition } from '../src/geolocation.ts'
test('geolocation handles HTTPS, unavailable API, denied, timeout, failure and success', async () => {
  const originalWindow = globalThis.window
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    globalThis.window = { isSecureContext: false }
    await assert.rejects(currentPosition(), /HTTPS/)
    globalThis.window.isSecureContext = true
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
    await assert.rejects(currentPosition(), /navegador/)
    for (const [code, message] of [[1, /negada/], [2, /indisponível/], [3, /demorou/]]) {
      globalThis.navigator.geolocation = { getCurrentPosition: (_success, failure) => failure({ code }) }
      await assert.rejects(currentPosition(), message)
    }
    globalThis.navigator.geolocation = { getCurrentPosition: (success, _failure, options) => {
      assert.equal(options.maximumAge, 0)
      assert.equal(options.enableHighAccuracy, true)
      success({ coords: { latitude: -23, longitude: -46 } })
    } }
    assert.deepEqual(await currentPosition(), { lat: -23, lng: -46 })
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator
  }
})
