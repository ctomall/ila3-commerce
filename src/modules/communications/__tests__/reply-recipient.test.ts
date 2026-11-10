import { describe, expect, it } from '@jest/globals'
import { pickReplyRecipient } from '../lib/reply-recipient'

describe('pickReplyRecipient', () => {
  it('uses the last inbound sender, not the external conversation id', () => {
    expect(
      pickReplyRecipient(
        [
          { direction: 'inbound', senderIdentifier: 'customer@example.test' },
          { direction: 'outbound', senderIdentifier: 'me@example.test' },
          { direction: 'inbound', senderIdentifier: 'newer@example.test' },
          { direction: 'outbound', senderIdentifier: 'me@example.test' },
        ],
        'thread-1',
      ),
    ).toBe('newer@example.test')
  })

  it('skips inbound rows without an identifier and falls back when none exist', () => {
    expect(pickReplyRecipient([{ direction: 'inbound', senderIdentifier: null }], 'thread-1')).toBe('thread-1')
    expect(pickReplyRecipient([], 'thread-1')).toBe('thread-1')
  })
})
