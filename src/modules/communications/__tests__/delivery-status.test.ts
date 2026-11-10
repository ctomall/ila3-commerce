import { describe, expect, it } from '@jest/globals'
import { deliveryStatusLabel } from '../lib/delivery-status'

describe('deliveryStatusLabel', () => {
  it('labels the known lifecycle states', () => {
    expect(deliveryStatusLabel('queued')).toBe('排队中')
    expect(deliveryStatusLabel('sent')).toBe('已发送')
    expect(deliveryStatusLabel('delivered')).toBe('已送达')
    expect(deliveryStatusLabel('failed')).toBe('发送失败')
  })

  it('never renders unknown as success', () => {
    expect(deliveryStatusLabel('unknown')).toBe('结果未知（勿重发）')
  })

  it('falls back to the raw status and to an em dash', () => {
    expect(deliveryStatusLabel('some_new_state')).toBe('some_new_state')
    expect(deliveryStatusLabel(null)).toBe('—')
  })
})
