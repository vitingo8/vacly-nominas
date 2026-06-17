import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminConfig } from '../config'
import { AdminIntegrationError } from '../errors'

export async function storeNotificationDocument(
  supabase: SupabaseClient,
  input: {
    companyId: string
    notificationId: string
    provider: string
    externalId: string
    fileName: string
    content: Buffer
    contentType?: string
  },
): Promise<{ storagePath: string; sha256: string }> {
  const config = getAdminConfig()
  const sha256 = createHash('sha256').update(input.content).digest('hex')
  const storagePath = `${input.companyId}/notifications/${input.provider}/${input.externalId}/${input.fileName}`

  const { error } = await supabase.storage
    .from(config.storageBucket)
    .upload(storagePath, input.content, {
      upsert: true,
      contentType: input.contentType || 'application/pdf',
    })

  if (error) {
    throw new AdminIntegrationError('STORAGE_ERROR', 'Error guardando documento de notificación', error)
  }

  await supabase.from('admin_notification_documents').upsert(
    {
      notification_id: input.notificationId,
      company_id: input.companyId,
      document_type: input.fileName.includes('cert') ? 'certificate_pdf' : 'notification_pdf',
      storage_path: storagePath,
      sha256,
      mime_type: input.contentType || 'application/pdf',
    },
    { onConflict: 'notification_id,document_type' },
  )

  return { storagePath, sha256 }
}
