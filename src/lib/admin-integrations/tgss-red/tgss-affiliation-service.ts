import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateAffiliationInput, AdministrativeTransaction } from '../types'
import { getAdminConfig } from '../config'
import { AdminIntegrationError } from '../errors'
import { TransactionService } from '../transaction-engine/transaction-service'
import { AuditService } from '../audit/audit-service'
import { DocumentStorageService } from '../document-storage/document-storage-service'
import { AfiFileGenerator } from './afi-generator'
import { validateAfiPayload } from './afi-validator'
import type { AfiAffiliationPayload } from './afi-types'

export class TgssAffiliationService {
  private txService: TransactionService
  private audit: AuditService
  private storage: DocumentStorageService
  private generator = new AfiFileGenerator()

  constructor(private supabase: SupabaseClient) {
    this.txService = new TransactionService(supabase)
    this.audit = new AuditService(supabase)
    this.storage = new DocumentStorageService(supabase)
  }

  async createAffiliationRequest(input: CreateAffiliationInput): Promise<{
    transaction: AdministrativeTransaction
    fileId?: string
  }> {
    const config = getAdminConfig()
    if (!config.enabled) {
      throw new AdminIntegrationError('INTEGRATIONS_DISABLED', 'Integraciones administrativas deshabilitadas')
    }

    const employee = await this.loadEmployee(input.companyId, input.employeeId)
    const company = await this.loadCompany(input.companyId)
    const payrollConfig = await this.loadPayrollConfig(input.companyId)

    const payload = this.buildPayload(input, employee, company, payrollConfig)
    const validation = validateAfiPayload(payload)
    if (!validation.valid) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'Datos de afiliación inválidos', validation.errors)
    }

    const procedureCode = AfiFileGenerator.procedureCodeForType(input.requestType)
    let tx = await this.txService.create({
      companyId: input.companyId,
      provider: 'tgss',
      procedureCode,
      subjectType: 'employee',
      subjectId: input.employeeId,
      requestedBy: input.requestedBy,
      certificateId: input.certificateId,
      authorizationId: input.authorizationId,
    })

    await this.audit.log({
      companyId: input.companyId,
      transactionId: tx.id,
      eventType: 'affiliation_created',
      actorUserId: input.requestedBy,
      metadata: { requestType: input.requestType, employeeId: input.employeeId },
    })

    tx = await this.txService.transition(tx.id, 'validated')

    const fileContent = this.generator.generate(payload)
    const fileName = `AFI_${input.requestType}_${input.employeeId.slice(0, 8)}_${Date.now()}.txt`

    tx = await this.txService.transition(tx.id, 'file_generated')

    const file = await this.storage.store({
      companyId: input.companyId,
      transactionId: tx.id,
      fileType: 'afi',
      fileName,
      content: fileContent,
    })

    await this.supabase.from('tgss_affiliation_requests').insert({
      company_id: input.companyId,
      transaction_id: tx.id,
      employee_id: input.employeeId,
      request_type: input.requestType,
      nss: payload.nss,
      ipf: payload.ipf,
      ccc: payload.ccc,
      fecha_real: input.fechaReal || payload.fechaReal,
      fecha_efecto: input.fechaEfecto || payload.fechaEfecto,
      contract_snapshot: input.contractSnapshot ?? payload.contractSnapshot ?? {},
    })

    await this.audit.log({
      companyId: input.companyId,
      transactionId: tx.id,
      eventType: 'file_generated',
      metadata: { fileId: file.id, sha256: file.sha256, fileName },
    })

    tx = await this.txService.transition(tx.id, 'queued')

    return { transaction: tx, fileId: file.id }
  }

  private buildPayload(
    input: CreateAffiliationInput,
    employee: Record<string, unknown>,
    company: Record<string, unknown>,
    payrollConfig: Record<string, unknown> | null,
  ): AfiAffiliationPayload {
    const nss =
      input.nss ||
      String(employee.social_security_number || '').replace(/\s/g, '') ||
      '000000000000'
    const ipf = input.ipf || String(employee.nif || '').replace(/\s/g, '').toUpperCase()
    const ccc =
      input.ccc ||
      String(payrollConfig?.ss_account_code || '').replace(/\s/g, '') ||
      '00000000000'
    const today = new Date().toISOString().slice(0, 10)

    return {
      requestType: input.requestType,
      nss,
      ipf,
      ccc,
      fechaReal: input.fechaReal || today,
      fechaEfecto: input.fechaEfecto || today,
      companyName: String(company.company || payrollConfig?.company_legal_name || ''),
      companyCif: String(company.cif || payrollConfig?.company_tax_id || ''),
      employeeName: `${employee.first_name || ''} ${employee.last_name || ''}`.trim(),
      contractSnapshot: input.contractSnapshot,
    }
  }

  private async loadEmployee(companyId: string, employeeId: string) {
    const { data, error } = await this.supabase
      .from('employees')
      .select('id, first_name, last_name, nif, social_security_number')
      .eq('company_id', companyId)
      .eq('id', employeeId)
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('EMPLOYEE_NOT_FOUND', 'Empleado no encontrado')
    }
    return data
  }

  private async loadCompany(companyId: string) {
    const { data, error } = await this.supabase
      .from('companies')
      .select('company_id, company, cif')
      .eq('company_id', companyId)
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Empresa no encontrada')
    }
    return data
  }

  private async loadPayrollConfig(companyId: string) {
    const { data } = await this.supabase
      .from('payroll_config')
      .select('ss_account_code, company_legal_name, company_tax_id')
      .eq('company_id', companyId)
      .maybeSingle()
    return data
  }
}
