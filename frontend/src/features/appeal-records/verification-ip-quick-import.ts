import { isIpAddressWithinNetwork, isValidIpOrCidr } from '../../domain/validation'

export interface VerificationIpQuickImportLine {
  lineNumber: number
  value: string
}

export interface VerificationIpQuickImportAssignment {
  network: string
  content: string
}

export interface VerificationIpQuickImportResult {
  assignments: VerificationIpQuickImportAssignment[]
  invalidLines: VerificationIpQuickImportLine[]
  unmatchedLines: VerificationIpQuickImportLine[]
  duplicateNetworks: string[]
}

export function parseVerificationIpQuickImport(
  networks: string[],
  text: string,
): VerificationIpQuickImportResult {
  const assignmentByNetwork = new Map<string, string>()
  const invalidLines: VerificationIpQuickImportLine[] = []
  const unmatchedLines: VerificationIpQuickImportLine[] = []
  const duplicateNetworks = new Set<string>()

  text.split(/\r?\n/).forEach((rawValue, index) => {
    const value = rawValue
      .trim()
      .replace(/\\+\s*$/, '')
      .trim()
    if (!value) return

    const line = { lineNumber: index + 1, value }
    const parsed = parseCredentialLine(value)
    if (!parsed) {
      invalidLines.push(line)
      return
    }

    const network = networks.find((item) => isIpAddressWithinNetwork(parsed.ip, item))
    if (!network) {
      unmatchedLines.push(line)
      return
    }

    if (assignmentByNetwork.has(network)) duplicateNetworks.add(network)
    assignmentByNetwork.set(network, parsed.content)
  })

  return {
    assignments: networks.flatMap((network) => {
      const content = assignmentByNetwork.get(network)
      return content ? [{ network, content }] : []
    }),
    invalidLines,
    unmatchedLines,
    duplicateNetworks: [...duplicateNetworks],
  }
}

function parseCredentialLine(value: string): { ip: string; content: string } | undefined {
  const match = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5}):([^:\s]+):(.+)$/)
  if (!match) return undefined

  const [, ip = '', portText = '', account = '', passwordText = ''] = match
  const port = Number(portText)
  const password = passwordText.trim()
  if (!isValidIpOrCidr(ip) || port < 1 || port > 65_535 || !password) return undefined

  return {
    ip,
    content: `${ip}:${portText}:${account}:${password}`,
  }
}
