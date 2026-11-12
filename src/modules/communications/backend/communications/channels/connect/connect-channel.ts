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

/**
 * Email providers cannot be provisioned from this app's form (design rev2 F1-08).
 *
 * The installed tenant-credentials route deliberately refuses providers that do not
 * declare `channelScope: 'tenant'` — an admin must not force a mailbox-bound
 * credential set into a shared channel — and the email connectors (resend, imap,
 * ses, gmail) declare no tenant scope. Their connect widgets live in the installed
 * profile page, which owns the per-user scope rules. So the wizard names them and
 * sends the operator to that surface instead of duplicating a credentials form that
 * the hub would reject.
 */
export type ExternalProviderDef = {
  key: 'resend' | 'imap' | 'ses' | 'gmail'
  label: string
  defaultDisplayName: string
  /** Where the operator actually connects it. */
  connectHref: string
  connectLabel: string
  requiredFields: CredentialField[]
  note: string
}

const PROFILE_CHANNELS_HREF = '/backend/profile/communication-channels'

export const EXTERNAL_PROVIDERS: ExternalProviderDef[] = [
  {
    key: 'resend',
    label: 'Resend（邮件，只发不收）',
    defaultDisplayName: '客服邮箱',
    connectHref: PROFILE_CHANNELS_HREF,
    connectLabel: '去「我的资料 → 连接渠道」连接',
    requiredFields: [
      { key: 'apiKey', label: 'API key', required: true, secret: true },
      { key: 'fromAddress', label: '发件地址（已验证）', required: true, placeholder: 'service@your-domain.com' },
    ],
    note:
      '一期邮件出站用 Resend；它没有入站能力，客户回信不会出现在收件箱。要收信需要另接 IMAP 渠道（当前受环境限制）。',
  },
  {
    key: 'imap',
    label: 'IMAP + SMTP（邮件，可收可发）',
    defaultDisplayName: '客服邮箱',
    connectHref: PROFILE_CHANNELS_HREF,
    connectLabel: '去「我的资料 → 连接渠道」连接',
    requiredFields: [
      { key: 'host', label: 'IMAP 主机', required: true },
      { key: 'username', label: '用户名', required: true },
      { key: 'password', label: '密码', required: true, secret: true },
    ],
    note: '需要可达的 IMAP 主机；当前部署到公网邮箱主机的出口未核实，连之前先确认网络可达。',
  },
  {
    key: 'ses',
    label: 'Amazon SES（邮件，只发不收）',
    defaultDisplayName: '客服邮箱',
    connectHref: PROFILE_CHANNELS_HREF,
    connectLabel: '去「我的资料 → 连接渠道」连接',
    requiredFields: [
      { key: 'region', label: 'AWS region', required: true },
      { key: 'accessKeyId', label: 'Access key id', required: true },
      { key: 'secretAccessKey', label: 'Secret access key', required: true, secret: true },
    ],
    note: 'SES 无入站；需要 AWS 侧发件人验证与授权，一期不作为首选（D-2 选 Resend）。',
  },
  {
    key: 'gmail',
    label: 'Gmail（邮件，可收可发）',
    defaultDisplayName: '客服邮箱',
    connectHref: PROFILE_CHANNELS_HREF,
    connectLabel: '去「我的资料 → 连接渠道」连接',
    requiredFields: [],
    note: 'Gmail 走 OAuth 授权，不是填表；当前部署到 Google 端点不可达。',
  },
]

export function findExternalProvider(key: string): ExternalProviderDef | undefined {
  return EXTERNAL_PROVIDERS.find((entry) => entry.key === key)
}
