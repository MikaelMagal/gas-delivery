import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyDraft, parseDeliveryDraft } from '../src/deliveryForm.ts'
const valid = { ...emptyDraft, customerName: ' Cliente ', address: ' Rua Central, 10 ', product: ' Gás P13 ', lat: '-23,5505', lng: '-46.6333' }
test('converte coordenadas e quantidade e normaliza campos opcionais', () => {
  assert.deepEqual(parseDeliveryDraft(valid), { customerName: 'Cliente', address: 'Rua Central, 10', product: 'Gás P13', quantity: 1, lat: -23.5505, lng: -46.6333 })
  assert.equal(parseDeliveryDraft({ ...valid, phone: ' 11999999999 ', notes: ' Portão azul ' }).notes, 'Portão azul')
  assert.equal(parseDeliveryDraft({ ...valid, phone: ' 11999999999 ' }).phone, '11999999999')
})
test('rejeita campos vazios ou compostos de espaços', () => {
  for (const key of ['customerName', 'address', 'product', 'lat', 'lng', 'quantity']) {
    for (const value of ['', '   ']) assert.throws(() => parseDeliveryDraft({ ...valid, [key]: value }))
  }
  assert.throws(() => parseDeliveryDraft({ ...valid, address: 'Rua' }))
})
test('valida limites das coordenadas e não confunde zero com ausência', () => {
  for (const value of ['91', '-91', 'Infinity', 'NaN', 'abc']) assert.throws(() => parseDeliveryDraft({ ...valid, lat: value }))
  for (const value of ['181', '-181', 'Infinity', 'NaN', 'abc']) assert.throws(() => parseDeliveryDraft({ ...valid, lng: value }))
  assert.equal(parseDeliveryDraft({ ...valid, lat: '0', lng: '0' }).lat, 0)
  assert.equal(parseDeliveryDraft({ ...valid, lat: '-90', lng: '180' }).lng, 180)
})
test('rejeita quantidades negativas, fracionárias ou inválidas', () => {
  for (const value of ['0', '-1', '1.5', 'Infinity', 'abc']) assert.throws(() => parseDeliveryDraft({ ...valid, quantity: value }))
})
