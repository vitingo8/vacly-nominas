export interface ExpenseSettings {
  maxExpenseAmount: number
  expenseApprovalRequired?: boolean
  expenseReceiptRequired?: boolean
}

export interface EmployeeExpenseConfig {
  categories?: string[]
  limit?: string | null
}

export function parseExpenseSettingsFromCompany(
  expensesCategoriesRaw: unknown
): ExpenseSettings {
  const defaults: ExpenseSettings = {
    maxExpenseAmount: 1000,
    expenseApprovalRequired: true,
    expenseReceiptRequired: true,
  }
  if (!expensesCategoriesRaw) return defaults

  try {
    const parsed =
      typeof expensesCategoriesRaw === 'string'
        ? JSON.parse(expensesCategoriesRaw)
        : expensesCategoriesRaw

    if (parsed && typeof parsed === 'object' && parsed.settings) {
      return {
        maxExpenseAmount: Number(parsed.settings.maxExpenseAmount) || defaults.maxExpenseAmount,
        expenseApprovalRequired: parsed.settings.expenseApprovalRequired ?? defaults.expenseApprovalRequired,
        expenseReceiptRequired: parsed.settings.expenseReceiptRequired ?? defaults.expenseReceiptRequired,
      }
    }
  } catch {
    /* usar defaults */
  }
  return defaults
}

function normalizeCategoryName(value: string): string {
  return value.trim().toLowerCase()
}

export function isCategoryAllowedForEmployee(
  subcategory: string,
  employeeConfig: EmployeeExpenseConfig | null | undefined
): boolean {
  const allowed = employeeConfig?.categories
  if (!allowed || allowed.length === 0) return true
  const norm = normalizeCategoryName(subcategory)
  return allowed.some(cat => normalizeCategoryName(cat) === norm)
}

export function validateExpenseAmount(
  amount: number,
  employeeConfig: EmployeeExpenseConfig | null | undefined,
  companySettings: ExpenseSettings
): { ok: boolean; error?: string } {
  const parsedAmount = Number(amount)
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return { ok: false, error: 'El importe debe ser mayor que cero' }
  }

  if (parsedAmount > companySettings.maxExpenseAmount) {
    return {
      ok: false,
      error: `El importe supera el límite global de ${companySettings.maxExpenseAmount}€`,
    }
  }

  const employeeLimit = employeeConfig?.limit
    ? parseFloat(String(employeeConfig.limit))
    : null

  if (employeeLimit && Number.isFinite(employeeLimit) && parsedAmount > employeeLimit) {
    return {
      ok: false,
      error: `El importe supera el límite del empleado de ${employeeLimit}€`,
    }
  }

  return { ok: true }
}

export function validateExpenseSubmission(params: {
  subcategory?: string | null
  amount: number
  employeeConfig?: EmployeeExpenseConfig | null
  companySettings: ExpenseSettings
  hasReceipt?: boolean
}): { ok: boolean; error?: string } {
  const subcategory = params.subcategory?.trim()
  if (subcategory && !isCategoryAllowedForEmployee(subcategory, params.employeeConfig)) {
    return {
      ok: false,
      error: `La categoría "${subcategory}" no está permitida para este empleado`,
    }
  }

  const amountCheck = validateExpenseAmount(
    params.amount,
    params.employeeConfig,
    params.companySettings
  )
  if (!amountCheck.ok) return amountCheck

  if (params.companySettings.expenseReceiptRequired && params.hasReceipt === false) {
    return { ok: false, error: 'El comprobante es obligatorio para registrar gastos' }
  }

  return { ok: true }
}
