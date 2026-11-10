export type ProviderKey = 'whatsapp-business' | 'messenger'

export type CredentialField = {
  key: string
  label: string
  description?: string
  required: boolean
  secret?: boolean
  placeholder?: string
}

export type ProviderDef = {
  key: ProviderKey
  label: string
  defaultDisplayName: string
  fields: CredentialField[]
}

const GRAPH_BASE = 'https://graph.facebook.com'

export const PROVIDERS: ProviderDef[] = [
  {
    key: 'whatsapp-business',
    label: 'WhatsApp Business (Cloud API)',
    defaultDisplayName: 'WhatsApp 客服号',
    fields: [
      { key: 'accessToken', label: 'System user access token', description: '包含 whatsapp_business_messaging 权限', required: true, secret: true },
      { key: 'phoneNumberId', label: 'Phone number ID', description: 'Cloud API 的号码 ID，不是显示号码', required: true },
      { key: 'appSecret', label: 'App secret', description: '用于校验入站 webhook 签名', required: true, secret: true },
      { key: 'graphBaseUrl', label: 'Graph base URL（可选）', description: `默认 ${GRAPH_BASE}`, required: false, placeholder: GRAPH_BASE },
    ],
  },
  {
    key: 'messenger',
    label: 'Facebook Page Messenger',
    defaultDisplayName: 'Messenger 客服页',
    fields: [
      { key: 'pageAccessToken', label: 'Page access token', description: '包含 pages_messaging 权限', required: true, secret: true },
      { key: 'pageId', label: 'Page ID', description: 'Facebook 主页 ID', required: true },
      { key: 'appSecret', label: 'App secret', description: '用于校验入站 webhook 签名', required: true, secret: true },
      { key: 'graphBaseUrl', label: 'Graph base URL（可选）', description: `默认 ${GRAPH_BASE}`, required: false, placeholder: GRAPH_BASE },
    ],
  },
]

export function buildCredentials(provider: ProviderDef, values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of provider.fields) {
    const raw = values[field.key]
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (value.length > 0) out[field.key] = value
  }
  return out
}

export function mapConnectError(status: number, serverError: string | null): string {
  if (status === 403) return '没有连接渠道的权限（需要“连接租户级渠道”）'
  if (status === 404) return serverError ?? '渠道适配器未安装'
  if (status === 400) {
    if (serverError === 'provider_not_tenant_scoped') return '该渠道需要按员工个人方式连接'
    return serverError ?? '请求参数不正确'
  }
  if (status === 422) return serverError ? `凭据校验未通过：${serverError}` : '凭据校验未通过，请检查字段'
  if (status >= 500) return '服务端暂时不可用，请稍后重试'
  return serverError ?? `连接失败（HTTP ${status}）`
}
