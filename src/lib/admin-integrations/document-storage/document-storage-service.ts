import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdministrativeFile } from '../types'
import { getAdminConfig } from '../config'
import { AdminIntegrationError } from '../errors'

export interface StoreFileInput {
  companyId: string
  transactionId: string
  fileType: string
  fileName: string
  content: string | Buffer
}

export class DocumentStorageService {
  constructor(private supabase: SupabaseClient) {}

  sha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex')
  }

  async store(input: StoreFileInput): Promise<AdministrativeFile> {
    const config = getAdminConfig()
    const buffer = typeof input.content === 'string' ? Buffer.from(input.content, 'utf8') : input.content
    const hash = this.sha256(buffer)
    const storagePath = `${input.companyId}/${input.transactionId}/${input.fileName}`

    const { error: uploadError } = await this.supabase.storage
      .from(config.storageBucket)
      .upload(storagePath, buffer, { upsert: true, contentType: 'text/plain' })

    if (uploadError) {
      throw new AdminIntegrationError('STORAGE_ERROR', 'Error subiendo fichero', uploadError)
    }

    const { data, error } = await this.supabase
      .from('administrative_files')
      .insert({
        company_id: input.companyId,
        transaction_id: input.transactionId,
        file_type: input.fileType,
        file_name: input.fileName,
        storage_path: storagePath,
        sha256: hash,
      })
      .select('*')
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('STORAGE_ERROR', 'Error registrando fichero', error)
    }
    return data as AdministrativeFile
  }

  async getById(id: string, companyId?: string): Promise<AdministrativeFile> {
    let query = this.supabase.from('administrative_files').select('*').eq('id', id)
    if (companyId) query = query.eq('company_id', companyId)

    const { data, error } = await query.single()
    if (error || !data) {
      throw new AdminIntegrationError('FILE_NOT_FOUND', `Fichero no encontrado: ${id}`)
    }
    return data as AdministrativeFile
  }

  async download(file: AdministrativeFile): Promise<Buffer> {
    const config = getAdminConfig()
    const { data, error } = await this.supabase.storage
      .from(config.storageBucket)
      .download(file.storage_path)

    if (error || !data) {
      throw new AdminIntegrationError('STORAGE_ERROR', 'Error descargando fichero', error)
    }
    return Buffer.from(await data.arrayBuffer())
  }

  async getLatestForTransaction(transactionId: string): Promise<AdministrativeFile | null> {
    const { data, error } = await this.supabase
      .from('administrative_files')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new AdminIntegrationError('STORAGE_ERROR', 'Error obteniendo fichero', error)
    }
    return (data as AdministrativeFile) || null
  }
}
