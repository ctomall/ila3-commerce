import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: jest.fn(),
}))
jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(),
}))

import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'

const mockAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>

const ID = '11111111-1111-4111-8111-111111111111'
const signedIn = {sub: 'u1', tenantId: 't1', orgId: 'o1'} as never

type Row = Record<string, unknown>

function sharedRow(overrides: Row = {}): Row {
  return {
    tenant_id: 't1',
    organization_id: 'o1',
    entity_id: 'communication_channels.external_message',
    partition_code: 'privateAttachments',
    storage_path: 't1/o1/hello.txt',
    file_name: '客户附件.txt',
    mime_type: 'text/plain',
    file_size: 5,
    channel_user_id: null,
    channel_organization_id: 'o1',
    ...overrides,
  }
}

function wire(options: {rows?: Row[]; read?: () => Promise<{buffer: Buffer}>; noFactory?: boolean} = {}) {
  const executed: Array<{query: string; params: unknown[]}> = []
  const driver = {read: jest.fn(options.read ?? (async () => ({buffer: Buffer.from('hello')})))}
  const resolveForPartition = jest.fn(
    async (_partitionCode: string, _scope: {tenantId: string; organizationId: string}) => driver,
  )
  mockContainer.mockResolvedValue({
    resolve: (name: string) => {
      if (name === 'em') {
        return {
          getConnection: () => ({
            execute: async (query: string, params: unknown[]) => {
              executed.push({query, params})
              return options.rows ?? [sharedRow()]
            },
          }),
        }
      }
      if (name === 'storageDriverFactory') {
        if (options.noFactory) throw new Error('not registered')
        return {resolveForPartition}
      }
      throw new Error(`unexpected resolve: ${name}`)
    },
  } as never)
  return {executed, driver, resolveForPartition}
}

async function call(id: string = ID) {
  const {GET} = await import('../api/me/attachments/[id]/route')
  return GET(new Request(`http://localhost/api/communications/me/attachments/${id}`), {
    params: Promise.resolve({id}),
  })
}

describe('GET /api/communications/me/attachments/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('streams bytes for a shared-channel attachment and never inlines them', async () => {
    wire()
    const res = await call()
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('hello')
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment; filename=')
    expect(disposition).toContain("filename*=UTF-8''")
    expect(disposition).toContain(encodeURIComponent('客户附件.txt'))
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(res.headers.get('content-length')).toBe('5')
  })

  it('requires a session and masks a malformed id without querying', async () => {
    mockAuth.mockResolvedValue(null as never)
    expect((await call()).status).toBe(401)
    mockAuth.mockResolvedValue(signedIn)
    const {executed} = wire()
    expect((await call('not-a-uuid')).status).toBe(404)
    expect(executed).toHaveLength(0)
  })

  it('masks a missing row, a foreign attachment entity and a personal channel owned by somebody else', async () => {
    wire({rows: []})
    expect((await call()).status).toBe(404)
    wire({rows: [sharedRow({entity_id: 'customers:customer'})]})
    expect((await call()).status).toBe(404)
    wire({rows: [sharedRow({channel_user_id: 'someone-else'})]})
    expect((await call()).status).toBe(404)
  })

  it('accepts the caller’s own personal channel and the tenant-wide channel in another org only when scope matches', async () => {
    wire({rows: [sharedRow({channel_user_id: 'u1', channel_organization_id: 'o1'})]})
    expect((await call()).status).toBe(200)
    wire({rows: [sharedRow({channel_organization_id: null})]})
    expect((await call()).status).toBe(200)
    wire({rows: [sharedRow({channel_organization_id: 'o-other'})]})
    expect((await call()).status).toBe(404)
  })

  it('fails cleanly when the driver cannot read or no storage factory is registered', async () => {
    wire({read: async () => { throw new Error('missing object') }})
    expect((await call()).status).toBe(404)
    wire({noFactory: true})
    expect((await call()).status).toBe(503)
  })

  it('queries the caller tenant and reads the partition with the attachment scope', async () => {
    const {executed, resolveForPartition} = wire({rows: [sharedRow({organization_id: 'tenant-fallback'})]})
    await call()
    expect(executed[0].params).toEqual([ID, 't1'])
    expect(resolveForPartition).toHaveBeenCalledWith('privateAttachments', {
      tenantId: 't1',
      organizationId: 'tenant-fallback',
    })
  })
})
