import { describe, expect, it } from '@jest/globals'
import { describeMedia, extractMediaSummary } from '../lib/media'

describe('extractMediaSummary', () => {
  it('reads WhatsApp _meta media', () => {
    expect(extractMediaSummary({_meta: {media: {id: 'm1', kind: 'image', mimeType: 'image/jpeg', fileName: 'a.jpg'}}}))
      .toEqual({kind: 'image', fileName: 'a.jpg', mimeType: 'image/jpeg', externalId: 'm1', downloaded: false})
  })

  it('reads Messenger message attachments', () => {
    expect(extractMediaSummary({message: {attachments: [{type: 'image', payload: {url: 'https://x'}}]}}))
      .toEqual({kind: 'image', downloaded: false})
  })

  it('reads email attachment descriptors by filename', () => {
    expect(extractMediaSummary({attachments: [{filename: '合同.pdf', contentType: 'application/pdf'}]}))
      .toEqual({kind: 'document', fileName: '合同.pdf', mimeType: 'application/pdf', downloaded: false})
  })

  it('returns null when there is no attachment metadata', () => {
    expect(extractMediaSummary(null)).toBeNull()
    expect(extractMediaSummary({})).toBeNull()
    expect(extractMediaSummary({text: 'hello'})).toBeNull()
  })

  it('describes media with a file name, a mime type or a bare kind', () => {
    expect(describeMedia({kind: 'document', fileName: 'a.pdf', downloaded: false})).toContain('a.pdf')
    expect(describeMedia({kind: 'image', mimeType: 'image/png', downloaded: false})).toContain('image/png')
    expect(describeMedia({kind: 'sticker', downloaded: false})).toContain('sticker')
    expect(describeMedia({kind: 'sticker', downloaded: false})).toContain('未下载')
  })

  it('reports 已下载 with size once the worker stored an attachment', () => {
    const summary = extractMediaSummary({
      _meta: {
        media: {
          id: 'media-1',
          kind: 'image',
          mimeType: 'image/png',
          download: {
            attachmentId: 'att-1',
            fileName: 'photo.png',
            mimeType: 'image/png',
            fileSize: 2048,
            url: '/api/attachments/att-1',
          },
        },
      },
    })
    expect(summary).toMatchObject({downloaded: true, attachmentId: 'att-1', fileName: 'photo.png', fileSize: 2048})
    expect(describeMedia(summary!)).toContain('已下载')
    expect(describeMedia(summary!)).toContain('2.0 KB')
  })
})
