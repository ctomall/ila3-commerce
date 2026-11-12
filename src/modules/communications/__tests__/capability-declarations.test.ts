import { describe, expect, it } from '@jest/globals'
import { createWhatsAppAdapter } from '../../channel_whatsapp/lib/adapter'
import { createMessengerAdapter } from '../../channel_messenger/lib/adapter'

/**
 * Pins the capability declarations the delivery matrix in
 * `core-restart/slices/S81-support-matrix/` is built from.
 *
 * The matrix must describe what the product actually promises, not what the
 * platforms advertise. A capability flag drives UI affordances (attachment
 * button, delivery tick, template picker), so an accidental flip is a product
 * change and has to be a deliberate one — this test makes that flip loud and
 * points at the document that then needs updating.
 */
describe('connector capability declarations', () => {
  it('WhatsApp declares the receipts, media and template surface it actually handles', () => {
    const { capabilities } = createWhatsAppAdapter()

    expect(capabilities).toMatchObject({
      threading: true,
      fileSharing: true,
      readReceipts: true,
      deliveryReceipts: true,
      // Inbound interactive replies are parsed, but nothing builds outbound
      // interactive messages — the outbound capability stays false.
      interactiveComponents: false,
      inlineImages: true,
      voiceNotes: true,
      stickers: true,
      realtimePush: true,
      recipientFormat: 'provider-native',
      // WhatsApp Cloud API text is plain text; formatting lives in templates.
      richText: false,
      maxBodyLength: 4096,
    })
    expect(capabilities.supportedBodyFormats).toEqual(['text'])
  })

  it('Messenger does not promise delivery receipts — it only sends a read watermark', () => {
    const { capabilities } = createMessengerAdapter()

    expect(capabilities).toMatchObject({
      threading: true,
      fileSharing: true,
      readReceipts: true,
      // A `deliveryReceipts: true` here would make the UI show a status the
      // platform never emits; the read watermark is the only per-conversation
      // signal Messenger sends.
      deliveryReceipts: false,
      interactiveComponents: false,
      stickers: false,
      voiceNotes: true,
      realtimePush: true,
      recipientFormat: 'provider-native',
      maxBodyLength: 2000,
    })
    expect(capabilities.supportedBodyFormats).toEqual(['text'])
  })
})
