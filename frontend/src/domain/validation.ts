import { z } from 'zod'

import { getAccountFields } from './account-fields'
import { appealStatuses, type VerificationIpCredential } from './entities'
import { platformIds } from './platform'

const requiredText = (label: string) => z.string().trim().min(1, `${label}不能为空`)
const optionalText = z.string().trim().default('')
const ipOrCidrSchema = z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()])
const ipAddressSchema = z.union([z.ipv4(), z.ipv6()])

export const accountImportInputSchema = z.object({
  platformId: z.enum(platformIds),
  used: z.boolean().default(false),
  country: optionalText,
  account: optionalText,
  password: optionalText,
  emailAccount: optionalText,
  emailPassword: optionalText,
  token: optionalText,
  decodeLink: optionalText,
  twoFactor: optionalText,
  note: optionalText,
})

export const accountInputSchema = accountImportInputSchema.superRefine((value, context) => {
  for (const field of getAccountFields(value.platformId)) {
    if (value[field.key]) continue
    context.addIssue({
      code: 'custom',
      path: [field.key],
      message: `${field.label}不能为空`,
    })
  }
})

export const appealModuleInputSchema = z.object({
  platformId: z.enum(platformIds),
  name: requiredText('模块名称'),
  description: optionalText,
  enabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  note: optionalText,
})

export const appealStepInputSchema = z.object({
  platformId: z.enum(platformIds),
  moduleId: requiredText('所属模块'),
  name: requiredText('步骤名称'),
  instructions: requiredText('操作说明'),
  sortOrder: z.number().int().nonnegative(),
  note: optionalText,
})

export function isValidIpOrCidr(value: string): boolean {
  return ipOrCidrSchema.safeParse(value).success
}

export function isIpAddressWithinNetwork(ip: string, network: string): boolean {
  if (!ipAddressSchema.safeParse(ip).success || !ipOrCidrSchema.safeParse(network).success) {
    return false
  }

  const parsedIp = parseIpAddress(ip)
  const [networkAddress, prefixText] = network.split('/')
  const parsedNetwork = parseIpAddress(networkAddress ?? '')
  if (!parsedIp || !parsedNetwork || parsedIp.bits !== parsedNetwork.bits) return false

  const prefix = prefixText === undefined ? parsedNetwork.bits : Number(prefixText)
  const hostBits = BigInt(parsedNetwork.bits - prefix)
  return parsedIp.value >> hostBits === parsedNetwork.value >> hostBits
}

export const verificationIpCredentialSchema = z
  .object({
    network: z.string().trim().pipe(ipOrCidrSchema),
    content: z.string().trim().optional(),
    ip: optionalText.refine(
      (value) => !value || ipAddressSchema.safeParse(value).success,
      '请输入完整的 IPv4 或 IPv6 地址，不能填写网段',
    ),
    account: optionalText,
    password: optionalText,
  })
  .superRefine((value, context) => {
    if (value.ip && !isIpAddressWithinNetwork(value.ip, value.network)) {
      context.addIssue({
        code: 'custom',
        path: ['ip'],
        message: `验证 IP 不属于网段 ${value.network}`,
      })
    }

    const contentIp = extractVerificationIpAddress(value.content ?? '')
    if (contentIp && !isIpAddressWithinNetwork(contentIp, value.network)) {
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: `验证 IP 不属于网段 ${value.network}`,
      })
    }
  })

export function verificationIpCredentialContent(credential: VerificationIpCredential): string {
  return (
    credential.content?.trim() ||
    [credential.ip, credential.account, credential.password].filter(Boolean).join(' ')
  )
}

export function normalizeVerificationIpCredentials(
  networks: string[],
  credentials: VerificationIpCredential[],
): VerificationIpCredential[] {
  const credentialByNetwork = new Map(
    credentials.filter(verificationIpCredentialContent).map((item) => [item.network, item]),
  )
  return networks.flatMap((network) => {
    const credential = credentialByNetwork.get(network)
    return credential ? [credential] : []
  })
}

function extractVerificationIpAddress(content: string): string | undefined {
  const trimmed = content.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith('[')) {
    const closingBracket = trimmed.indexOf(']')
    const candidate = closingBracket > 1 ? trimmed.slice(1, closingBracket) : ''
    return ipAddressSchema.safeParse(candidate).success ? candidate : undefined
  }

  const ipv4Match = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?=$|[\s:|,])/)
  if (ipv4Match?.[1] && ipAddressSchema.safeParse(ipv4Match[1]).success) {
    return ipv4Match[1]
  }

  const firstToken = trimmed.split(/[\s|,]+/, 1)[0] ?? ''
  return ipAddressSchema.safeParse(firstToken).success ? firstToken : undefined
}

export const ipListSchema = z
  .string()
  .transform((value) => {
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    return [...new Set(lines)].join('\n')
  })
  .pipe(
    z
      .string()
      .min(1, 'IP不能为空')
      .refine(
        (value) => value.split('\n').every(isValidIpOrCidr),
        '请输入有效的 IPv4、IPv6 地址或 CIDR 网段，每行一个',
      ),
  )

export const appealRecordInputSchema = z
  .object({
    platformId: z.enum(platformIds),
    status: z.enum(appealStatuses),
    country: requiredText('国家'),
    ip: ipListSchema,
    completedIps: z.array(ipOrCidrSchema).default([]),
    verificationIps: z.array(verificationIpCredentialSchema).default([]),
    appealedAt: requiredText('申诉时间').refine(
      (value) => !Number.isNaN(Date.parse(value)),
      '请输入有效的申诉时间',
    ),
    appealPlatform: requiredText('申诉平台'),
    accountId: z.string().optional(),
    moduleId: z.string().optional(),
    stepId: z.string().optional(),
    note: optionalText,
    template1: optionalText,
    template2: optionalText,
  })
  .superRefine((value, context) => {
    const networks = new Set(value.ip.split('\n'))
    const seenNetworks = new Set<string>()

    value.verificationIps.forEach((credential, index) => {
      if (!networks.has(credential.network)) {
        context.addIssue({
          code: 'custom',
          path: ['verificationIps', index, 'network'],
          message: `验证 IP 关联的网段 ${credential.network} 不在当前记录中`,
        })
      }
      if (seenNetworks.has(credential.network)) {
        context.addIssue({
          code: 'custom',
          path: ['verificationIps', index, 'network'],
          message: `网段 ${credential.network} 只能填写一组验证 IP 信息`,
        })
      }
      seenNetworks.add(credential.network)
    })
  })

interface ParsedIpAddress {
  bits: 32 | 128
  value: bigint
}

function parseIpAddress(value: string): ParsedIpAddress | undefined {
  return value.includes(':') ? parseIpv6Address(value) : parseIpv4Address(value)
}

function parseIpv4Address(value: string): ParsedIpAddress | undefined {
  const parts = value.split('.')
  if (parts.length !== 4) return undefined

  let result = 0n
  for (const part of parts) {
    const number = Number(part)
    if (!/^\d+$/.test(part) || number < 0 || number > 255) return undefined
    result = (result << 8n) | BigInt(number)
  }
  return { bits: 32, value: result }
}

function parseIpv6Address(value: string): ParsedIpAddress | undefined {
  let normalized = value.toLowerCase()
  const ipv4Match = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)
  if (ipv4Match) {
    const parsedIpv4 = parseIpv4Address(ipv4Match[1] ?? '')
    if (!parsedIpv4) return undefined
    const high = ((parsedIpv4.value >> 16n) & 0xffffn).toString(16)
    const low = (parsedIpv4.value & 0xffffn).toString(16)
    normalized = normalized.slice(0, -(ipv4Match[1]?.length ?? 0)) + `${high}:${low}`
  }

  const compressedParts = normalized.split('::')
  if (compressedParts.length > 2) return undefined
  const left = compressedParts[0] ? compressedParts[0].split(':') : []
  const right = compressedParts[1] ? compressedParts[1].split(':') : []
  const missing = 8 - left.length - right.length
  if (compressedParts.length === 1 ? missing !== 0 : missing < 1) return undefined

  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right]
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return undefined
  }

  let result = 0n
  for (const group of groups) result = (result << 16n) | BigInt(`0x${group}`)
  return { bits: 128, value: result }
}

export function firstValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? '输入内容不正确'
}
