import type { Account, EntityInput } from '../../domain/entities'
import { getAccountFields } from '../../domain/account-fields'
import type { PlatformId } from '../../domain/platform'
import { accountImportInputSchema } from '../../domain/validation'

type AccountImportField =
  | 'country'
  | 'account'
  | 'password'
  | 'emailAccount'
  | 'emailPassword'
  | 'token'
  | 'decodeLink'
  | 'twoFactor'
  | 'note'

export interface AccountImportRow {
  lineNumber: number
  values: Record<AccountImportField, string>
  input: EntityInput<Account> | null
  missingFields: string[]
  errors: string[]
}

export interface AccountImportResult {
  rows: AccountImportRow[]
  error: string
}

const headerAliases: Record<string, AccountImportField> = {
  国家: 'country',
  地区: 'country',
  country: 'country',
  账号: 'account',
  account: 'account',
  username: 'account',
  密码: 'password',
  password: 'password',
  邮箱: 'emailAccount',
  邮箱账号: 'emailAccount',
  email: 'emailAccount',
  emailaccount: 'emailAccount',
  邮箱密码: 'emailPassword',
  emailpassword: 'emailPassword',
  令牌: 'token',
  token: 'token',
  解码连接: 'decodeLink',
  解码链接: 'decodeLink',
  decodelink: 'decodeLink',
  '2fa': 'twoFactor',
  twofactor: 'twoFactor',
  二次验证: 'twoFactor',
  备注: 'note',
  note: 'note',
}

const emptyValues = (): Record<AccountImportField, string> => ({
  country: '',
  account: '',
  password: '',
  emailAccount: '',
  emailPassword: '',
  token: '',
  decodeLink: '',
  twoFactor: '',
  note: '',
})

export function parseAccountImport(text: string, platformId: PlatformId): AccountImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((value, index) => ({ lineNumber: index + 1, value: value.trim() }))
    .filter((line) => line.value.length > 0)

  if (lines.length === 0) return { rows: [], error: '请粘贴要导入的账号表格' }

  if (platformId === 'tiktok' && lines[0]!.value.includes('----')) {
    return parseTikTokDelimiterImport(lines)
  }

  const format = detectFormat(lines[0]!.value)
  const markdown = format === 'markdown'
  const header = parseLine(lines[0]!.value, format)
  if (header.error) return { rows: [], error: `表头格式错误：${header.error}` }

  const headerFields = header.cells.map((cell) => headerAliases[normalizeHeader(cell, markdown)])
  const accountFields = getAccountFields(platformId)
  if (!accountFields.some(({ key }) => headerFields.includes(key))) {
    return { rows: [], error: '表头中没有识别到账号字段' }
  }

  const rows: AccountImportRow[] = []
  for (const line of lines.slice(1)) {
    const parsedLine = parseLine(line.value, format)
    if (isSeparatorRow(parsedLine.cells)) continue
    if (parsedLine.cells.every((cell) => normalizeCell(cell, markdown) === '')) continue

    const values = emptyValues()
    headerFields.forEach((field, index) => {
      if (!field) return
      values[field] = normalizeFieldValue(field, parsedLine.cells[index] ?? '', markdown)
    })

    const errors = parsedLine.error ? [parsedLine.error] : []
    if (parsedLine.cells.length !== header.cells.length) errors.push('列数与表头不一致')
    const missingFields = accountFields.filter(({ key }) => !values[key]).map(({ label }) => label)

    const candidate: EntityInput<Account> = { platformId, ...values }
    const validated = accountImportInputSchema.safeParse(candidate)
    if (!validated.success) errors.push(...validated.error.issues.map((issue) => issue.message))

    const uniqueErrors = [...new Set(errors)]
    rows.push({
      lineNumber: line.lineNumber,
      values,
      input: uniqueErrors.length === 0 && validated.success ? validated.data : null,
      missingFields,
      errors: uniqueErrors,
    })
  }

  return rows.length > 0 ? { rows, error: '' } : { rows: [], error: '没有找到可导入的账号数据' }
}

function detectFormat(header: string): 'markdown' | 'tsv' | 'csv' {
  if (header.includes('\t')) return 'tsv'
  if (header.includes('|')) return 'markdown'
  return 'csv'
}

function parseTikTokDelimiterImport(
  lines: Array<{ lineNumber: number; value: string }>,
): AccountImportResult {
  const accountFields = getAccountFields('tiktok')
  const delimiterFields = accountFields.filter(({ key }) => key !== 'token')
  const dataLines = isTikTokDelimiterHeader(lines[0]!.value) ? lines.slice(1) : lines
  const rows = dataLines.map((line) => {
    const values = emptyValues()
    const parsed = parseTikTokDelimiterLine(line.value)
    const errors = parsed.error ? [parsed.error] : []

    if (parsed.fields) Object.assign(values, parsed.fields)

    const missingFields = delimiterFields
      .filter(({ key }) => !values[key])
      .map(({ label }) => label)
    const candidate: EntityInput<Account> = { platformId: 'tiktok', ...values }
    const validated = accountImportInputSchema.safeParse(candidate)
    if (!validated.success) errors.push(...validated.error.issues.map((issue) => issue.message))

    const uniqueErrors = [...new Set(errors)]
    return {
      lineNumber: line.lineNumber,
      values,
      input: uniqueErrors.length === 0 && validated.success ? validated.data : null,
      missingFields,
      errors: uniqueErrors,
    }
  })

  return rows.length > 0 ? { rows, error: '' } : { rows: [], error: '没有找到可导入的账号数据' }
}

function parseTikTokDelimiterLine(value: string): {
  fields: Partial<Record<AccountImportField, string>> | null
  error: string
} {
  const content = value.trim().replace(/\\+$/, '')
  const cells: string[] = []
  let remainder = content

  for (let index = 0; index < 4; index += 1) {
    const separatorIndex = remainder.indexOf('----')
    if (separatorIndex < 0) {
      return { fields: null, error: 'TikTok 快速导入每行至少需要 5 个字段' }
    }
    cells.push(remainder.slice(0, separatorIndex))
    remainder = remainder.slice(separatorIndex + 4)
  }

  const [account, password, emailAccount, emailPassword] = cells.map((cell) =>
    normalizeLooseCell(cell),
  )
  const { country, token, decodeLink } = parseTikTokTail(remainder)

  return {
    fields: {
      account,
      password,
      emailAccount: emailAccount.replace(/^mailto:/i, ''),
      emailPassword,
      country,
      token,
      decodeLink,
    },
    error: '',
  }
}

function parseTikTokTail(value: string): { country: string; token: string; decodeLink: string } {
  let content = normalizeLooseCell(value)
  const markdownLink = unwrapMarkdownLink(content)

  if (markdownLink) {
    content = markdownLink.target
    if (markdownLink.suffix) {
      const country = normalizeTikTokCountry(markdownLink.suffix)
      return {
        country,
        token: country ? '' : normalizeLooseCell(markdownLink.suffix),
        decodeLink: normalizeLooseCell(markdownLink.target),
      }
    }
  }

  if (isHttpLink(content)) {
    const separatorIndex = content.lastIndexOf('----')
    if (separatorIndex < 0) return { country: '', token: '', decodeLink: content }
    const suffix = normalizeLooseCell(content.slice(separatorIndex + 4))
    const country = normalizeTikTokCountry(suffix)
    return {
      country,
      token: country ? '' : suffix,
      decodeLink: normalizeLooseCell(content.slice(0, separatorIndex)),
    }
  }

  const separatorIndex = content.indexOf('----')
  if (separatorIndex < 0) return { country: '', token: content, decodeLink: '' }

  const token = normalizeLooseCell(content.slice(0, separatorIndex))
  const rawLink = normalizeLooseCell(content.slice(separatorIndex + 4))
  const nestedMarkdownLink = unwrapMarkdownLink(rawLink)
  return {
    country: '',
    token,
    decodeLink: normalizeLooseCell(nestedMarkdownLink?.target ?? rawLink),
  }
}

function normalizeTikTokCountry(value: string): string {
  const normalized = normalizeLooseCell(value)
  if (/\p{Script=Han}/u.test(normalized)) return normalized
  if (!/^[a-z]{2}$/i.test(normalized)) return ''

  const countryCode = normalized.toUpperCase()
  const country = new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(countryCode)
  return country && country !== countryCode ? country : ''
}

function unwrapMarkdownLink(value: string): { target: string; suffix: string } | null {
  if (!value.startsWith('[')) return null

  const targetStart = value.indexOf('](')
  const targetEnd = value.lastIndexOf(')')
  if (targetStart < 0 || targetEnd <= targetStart + 2) return null

  const suffix = value.slice(targetEnd + 1).replace(/^\s*----\s*/, '')
  return {
    target: normalizeLooseCell(value.slice(targetStart + 2, targetEnd)),
    suffix: normalizeLooseCell(suffix),
  }
}

function isTikTokDelimiterHeader(value: string): boolean {
  const normalized = normalizeLooseCell(value).toLowerCase()
  return normalized.startsWith('账号----密码----邮箱----邮箱密码----')
}

function isHttpLink(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function normalizeLooseCell(value: string): string {
  return value.trim().replace(/\\([\\|_*@#$^])/g, '$1')
}

function parseLine(
  value: string,
  format: 'markdown' | 'tsv' | 'csv',
): { cells: string[]; error: string } {
  if (format === 'markdown') return parseMarkdownLine(value)
  if (format === 'tsv') return { cells: value.split('\t'), error: '' }
  return parseCsvLine(value)
}

function parseMarkdownLine(value: string): { cells: string[]; error: string } {
  let content = value.trim()
  if (content.startsWith('|')) content = content.slice(1)
  if (hasUnescapedTrailingPipe(content)) content = content.slice(0, -1)

  const cells: string[] = []
  let current = ''
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!
    if (character === '\\' && index + 1 < content.length) {
      current += character + content[index + 1]
      index += 1
    } else if (character === '|') {
      cells.push(current)
      current = ''
    } else {
      current += character
    }
  }
  cells.push(current)
  return { cells, error: '' }
}

function parseCsvLine(value: string): { cells: string[]; error: string } {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      cells.push(current)
      current = ''
    } else {
      current += character
    }
  }

  cells.push(current)
  return { cells, error: quoted ? '存在未闭合的引号' : '' }
}

function normalizeHeader(value: string, markdown: boolean): string {
  return normalizeCell(value, markdown)
    .toLowerCase()
    .replace(/[\s_-]/g, '')
}

function normalizeFieldValue(field: AccountImportField, value: string, markdown: boolean): string {
  const normalized = normalizeCell(value, markdown)
  return field === 'emailAccount' ? normalized.replace(/^mailto:/i, '') : normalized
}

function normalizeCell(value: string, markdown: boolean): string {
  const normalized = value.trim()
  return markdown ? normalized.replace(/\\([\\|_*@#$^])/g, '$1') : normalized
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()))
}

function hasUnescapedTrailingPipe(value: string): boolean {
  if (!value.endsWith('|')) return false

  let backslashes = 0
  for (let index = value.length - 2; index >= 0 && value[index] === '\\'; index -= 1) {
    backslashes += 1
  }
  return backslashes % 2 === 0
}
