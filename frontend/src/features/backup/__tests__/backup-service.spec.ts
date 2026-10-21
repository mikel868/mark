import { describe, expect, it } from 'vitest'

import { backupCounts, parseBackup } from '../backup-service'

describe('backup service', () => {
  it('parses a supported empty backup', () => {
    const backup = parseBackup(
      JSON.stringify({
        format: 'platform-appeal-manager-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          accounts: [],
          appealModules: [],
          appealSteps: [],
          appealRecords: [],
        },
      }),
    )

    expect(backupCounts(backup)).toEqual({
      accounts: 0,
      modules: 0,
      steps: 0,
      records: 0,
      images: 0,
    })
  })

  it('rejects invalid JSON and unknown backup versions', () => {
    expect(() => parseBackup('{')).toThrow('备份文件不是有效的 JSON')
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: 'platform-appeal-manager-backup',
          version: 3,
          exportedAt: new Date().toISOString(),
          data: {},
        }),
      ),
    ).toThrow('备份格式或版本不受支持')
  })

  it('accepts backups containing incomplete batch-imported accounts', () => {
    const now = new Date().toISOString()
    const backup = parseBackup(
      JSON.stringify({
        format: 'platform-appeal-manager-backup',
        version: 1,
        exportedAt: now,
        data: {
          accounts: [
            {
              id: 'account-1',
              platformId: 'ins',
              createdAt: now,
              updatedAt: now,
              archived: false,
              country: '美国',
              account: 'incomplete-account',
              password: '',
              emailAccount: '',
              emailPassword: '',
              twoFactor: '',
              note: '',
            },
          ],
          appealModules: [],
          appealSteps: [],
          appealRecords: [],
        },
      }),
    )

    expect(backup.data.accounts[0]).toMatchObject({
      account: 'incomplete-account',
      password: '',
      emailAccount: '',
      emailPassword: '',
      twoFactor: '',
    })
  })

  it('rejects invalid IP addresses and broken module links', () => {
    const now = new Date().toISOString()
    const base = {
      id: 'record-1',
      platformId: 'ins',
      createdAt: now,
      updatedAt: now,
      archived: false,
    }
    const document = {
      format: 'platform-appeal-manager-backup',
      version: 1,
      exportedAt: now,
      data: {
        accounts: [],
        appealModules: [],
        appealSteps: [
          {
            ...base,
            id: 'step-1',
            moduleId: 'missing-module',
            name: '步骤',
            instructions: '说明',
            sortOrder: 0,
            note: '',
          },
        ],
        appealRecords: [
          {
            ...base,
            status: '准备中',
            country: '美国',
            ip: '1:2:3',
            appealedAt: now,
            appealPlatform: 'INS',
            note: '',
            template1: '',
            template2: '',
          },
        ],
      },
    }

    expect(() => parseBackup(JSON.stringify(document))).toThrow('备份格式或版本不受支持')

    document.data.appealRecords = []
    expect(() => parseBackup(JSON.stringify(document))).toThrow('关联了无效模块')
  })

  it('accepts and normalizes appeal records with one IP address or CIDR per line', () => {
    const now = new Date().toISOString()
    const backup = parseBackup(
      JSON.stringify({
        format: 'platform-appeal-manager-backup',
        version: 1,
        exportedAt: now,
        data: {
          accounts: [],
          appealModules: [],
          appealSteps: [],
          appealRecords: [
            {
              id: 'record-1',
              platformId: 'ins',
              createdAt: now,
              updatedAt: now,
              archived: false,
              status: '准备中',
              country: '美国',
              ip: ' 1.1.1.1 \n\n194.179.156.0/24 \n2001:db8::/32 ',
              appealedAt: now,
              appealPlatform: 'Instagram',
              note: '',
              template1: '',
              template2: '',
            },
          ],
        },
      }),
    )

    expect(backup.data.appealRecords[0]?.ip).toBe('1.1.1.1\n194.179.156.0/24\n2001:db8::/32')
    expect(backup.data.appealRecords[0]?.completedIps).toEqual([])
    expect(backup.data.appealRecords[0]?.verificationIps).toEqual([])
  })

  it('accepts and normalizes partial verification IP credentials', () => {
    const now = new Date().toISOString()
    const backup = parseBackup(
      JSON.stringify({
        format: 'platform-appeal-manager-backup',
        version: 1,
        exportedAt: now,
        data: {
          accounts: [],
          appealModules: [],
          appealSteps: [],
          appealRecords: [
            {
              id: 'record-1',
              platformId: 'ins',
              createdAt: now,
              updatedAt: now,
              archived: false,
              status: '准备中',
              country: '美国',
              ip: '203.0.113.0/24\n198.51.100.0/24',
              verificationIps: [
                {
                  network: '198.51.100.0/24',
                  content: '198.51.100.25 proxy-user proxy-password',
                  ip: '',
                  account: '',
                  password: '',
                },
                {
                  network: '192.0.2.0/24',
                  ip: '192.0.2.10',
                  account: 'removed-network',
                  password: '',
                },
              ],
              appealedAt: now,
              appealPlatform: 'Instagram',
              note: '',
              template1: '',
              template2: '',
            },
          ],
        },
      }),
    )

    expect(backup.data.appealRecords[0]?.verificationIps).toEqual([
      {
        network: '198.51.100.0/24',
        content: '198.51.100.25 proxy-user proxy-password',
        ip: '',
        account: '',
        password: '',
      },
    ])
  })

  it('rejects a backup verification IP outside its network', () => {
    const now = new Date().toISOString()
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: 'platform-appeal-manager-backup',
          version: 1,
          exportedAt: now,
          data: {
            accounts: [],
            appealModules: [],
            appealSteps: [],
            appealRecords: [
              {
                id: 'record-1',
                platformId: 'ins',
                createdAt: now,
                updatedAt: now,
                archived: false,
                status: '准备中',
                country: '美国',
                ip: '203.0.113.0/24',
                verificationIps: [
                  {
                    network: '203.0.113.0/24',
                    ip: '203.0.114.1',
                    account: '',
                    password: '',
                  },
                ],
                appealedAt: now,
                appealPlatform: 'Instagram',
                note: '',
                template1: '',
                template2: '',
              },
            ],
          },
        }),
      ),
    ).toThrow('备份格式或版本不受支持')
  })
})
