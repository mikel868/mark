import { describe, expect, it } from 'vitest'
import type { BackupDocument } from '../backup-service'
import { parseBackup, serializeBackup } from '../backup-service'

describe('record evidence images in backups', () => {
  it('serializes image blobs and restores them from a version 2 backup', async () => {
    const now = new Date().toISOString()
    const backup: BackupDocument = {
      format: 'platform-appeal-manager-backup',
      version: 2,
      exportedAt: now,
      data: {
        accounts: [],
        appealModules: [],
        appealSteps: [],
        appealRecords: [
          {
            id: 'record-1',
            platformId: 'ins',
            status: '准备中',
            country: '美国',
            ip: '203.0.113.0/24',
            appealedAt: now,
            appealPlatform: 'Instagram',
            note: '',
            template1: '',
            template2: '',
            createdAt: now,
            updatedAt: now,
            archived: false,
          },
        ],
        evidenceImages: [
          {
            id: 'image-1',
            platformId: 'ins',
            recordId: 'record-1',
            fileName: 'proof.png',
            mimeType: 'image/png',
            size: 5,
            blob: new Blob(['proof'], { type: 'image/png' }),
            createdAt: now,
          },
        ],
      },
    }

    const restored = parseBackup(await serializeBackup(backup))
    const [image] = restored.data.evidenceImages ?? []

    expect(restored.version).toBe(2)
    expect(image).toMatchObject({
      id: 'image-1',
      recordId: 'record-1',
      fileName: 'proof.png',
      mimeType: 'image/png',
      size: 5,
    })
    await expect(image?.blob.text()).resolves.toBe('proof')
  })

  it('keeps version 1 backups compatible by defaulting evidence images to empty', () => {
    const restored = parseBackup(
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

    expect(restored.data.evidenceImages).toEqual([])
  })
})
