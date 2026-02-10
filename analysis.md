ULTIMATE PROMPT: COMPLETE PAYROLL AUTOMATION SYSTEM FOR SPAIN
🎯 YOUR MISSION
You are a senior full-stack developer specialized in Spanish payroll systems. Your task is to build a complete, production-ready payroll automation system that complies with Spanish legislation (Social Security + IRPF 2025), integrated into an existing ERP.
This system will have a revolutionary feature: integrated financial education that helps employees understand their payslips - something NO competitor in the market currently offers.

📁 PROJECT STRUCTURE & DIRECTORIES
CRITICAL - File Organization:
v1/
├── vacly-nominas/              # ALL payroll-related code goes here
│   ├── contratos/              # Contracts management
│   ├── generacion/             # Payroll generation (RRHH view)
│   ├── conceptos/              # Salary concepts catalog
│   └── mis-nominas/            # Employee payslip view
│
└── vacly-app/                  # EXISTING app directory
    ├── empleados/              # ALREADY EXISTS - EXTEND, don't recreate
    └── configuracion/          # ALREADY EXISTS - EXTEND, don't recreate
Directory Rules:

NEVER create new files in vacly-app for payroll features
ALL new payroll pages go in vacly-nominas
ONLY extend existing files in vacly-app when adding employee/config fields
Keep clear separation: payroll logic in vacly-nominas, employee data in vacly-app


🗂️ EXISTING FILES - ANALYZE BEFORE CREATING ANYTHING
MANDATORY FIRST STEP - You must analyze these files:
File 1: vacly-app/empleados/ directory
What to check:

Current employee data schema (which fields already exist)
Existing components: AddEmployee, EditEmployee
Current UI patterns and structure
Database schema for employees table
Which fields are MISSING for payroll (Social Security number, family situation for IRPF, salary details)

What you'll ADD (not replace):
typescript// NEW fields to extend employee schema:
interface EmployeePayrollExtension {
  // Fiscal data (NEW)
  socialSecurityNumber: string;
  familySituation: {
    maritalStatus: 'single' | 'married' | 'widowed' | 'divorced' | 'domestic_partnership';
    numberOfChildren: number;
    childrenAges: number[];
    childrenWithDisability: Array<{ age: number; disabilityLevel: number }>;
    dependentAscendants: number;
    workerDisability?: number;
    singleParent: boolean;
  };
  
  // Current compensation (NEW/ENHANCED)
  compensation: {
    baseSalaryMonthly: number;
    cotizationGroup: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
    irpfPercentage: number;
    fixedComplements: Array<{
      conceptId: string;
      amount: number;
    }>;
    proratedBonuses: boolean;
    numberOfBonuses: number;
    bonusMonths: number[]; // [6, 12] by default
  };
  
  // Banking (verify if exists)
  iban: string;
  
  // Contract reference (NEW)
  currentContractId: string;
}
File 2: vacly-app/configuracion/ directory
What to check:

Current configuration structure
Existing tabs/sections
How company data is stored
UI patterns for configuration pages

What you'll ADD (new section):
typescript// NEW section: "Payroll Configuration"
interface PayrollConfiguration {
  // Company data
  companyData: {
    taxId: string;
    legalName: string;
    socialSecurityAccountCode: string; // CCC
    cnae: string;
    atEpRate: number; // Workplace accidents rate
  };
  
  // Collective agreements
  agreements: Array<{
    id: string;
    name: string;
    code: string;
    active: boolean;
    minimumSalaries: Array<{
      category: string;
      baseSalary: number;
    }>;
  }>;
  
  // Annual parameters (current year)
  annualParameters: {
    year: number;
    smi: number; // Minimum wage
    maxCotizationBase: number;
    minimumBases: Record<1|2|3|4|5|6|7|8|9|10|11, number>;
    cotizationRates: {
      commonContingencies: { company: 23.6; worker: 4.7 };
      unemployment: { 
        permanent: { company: 23.6; worker: 1.55 };
        temporary: { company: 25.5; worker: 1.6 };
      };
      fogasa: { company: 0.2 };
      training: { company: 0.6; worker: 0.1 };
    };
    irpfTable: {
      personalMinimum: number;
      childrenMinimums: number[];
      ascendantsMinimum: number;
    };
  };
}
File 3: Corporate Design System
What to extract:

Color palette from tailwind.config.js
CSS variables from globals.css
Existing component patterns
Icon library used (lucide-react, heroicons, etc.)

YOU MUST USE ONLY THESE COLORS - Do not create a new palette

🏗️ SYSTEM ARCHITECTURE - 5 MAIN PAGES
PAGE 1: Empleados (EXISTING - EXTEND)
Location: vacly-app/empleados/
Action: MODIFY, don't recreate
Changes needed:

Add new tabs to employee modal:

"Fiscal Data" (family situation for IRPF)
"Compensation" (salary, complements, IRPF%)


Extend database schema with new fields
Update AddEmployee and EditEmployee components
Maintain existing design patterns

UI must include:

All new fields in an organized, intuitive layout
Form validation for fiscal data
IRPF percentage calculator helper
Maintain corporate colors and styling


PAGE 2: Contratos (NEW)
Location: vacly-nominas/contratos/
Action: CREATE from scratch
Purpose: Complete contract lifecycle management
Data model:
typescriptinterface Contract {
  id: string;
  employeeId: string;
  contractType: 'permanent' | 'temporary' | 'training' | 'internship' | 'specific_work';
  startDate: Date;
  endDate?: Date;
  cotizationGroup: 1-11;
  professionalCategory: string;
  agreementId: string;
  fullTime: boolean;
  workdayPercentage: number;
  weeklyHours: number;
  shiftType: 'continuous' | 'split' | 'rotating' | 'night';
  agreedBaseSalary: number;
  status: 'active' | 'expired' | 'cancelled';
  signedPdfUrl?: string;
  notes?: string;
}
Features required:

Filterable table (by employee, type, status, expiration date)
Alert view: contracts expiring in 30 days
Create/edit contract modal
PDF upload for signed contract
Historical view per employee
Bulk actions (renew, terminate)

UI must have:

Clean table with sorting/filtering
Status badges (active: green, expired: red, etc.)
Expiration warnings
Quick actions menu
Corporate color scheme


PAGE 3: Conceptos (NEW)
Location: vacly-nominas/conceptos/
Action: CREATE from scratch
Purpose: Master catalog of reusable salary concepts
Data model:
typescriptinterface SalaryConcept {
  id: string;
  code: string;
  name: string;
  description: string;
  type: 'salary' | 'non_salary';
  cotizesToSS: boolean;
  tributesIRPF: boolean;
  calculationFormula?: string; // e.g., "baseSalary * 0.1"
  agreementId?: string;
  active: boolean;
}
Features required:

CRUD table with all concepts
Search and filters
Visual indicators: salary (green badge) vs non-salary (blue badge)
Assignment to specific agreements
Predefined concepts library (seniority bonus, night shift, transport, etc.)

UI must have:

Clean, scannable table
Color-coded concept types
Quick create button
Inline editing where possible


PAGE 4: GeneracionNominas (NEW - CORE SYSTEM)
Location: vacly-nominas/generacion/
Action: CREATE from scratch
Purpose: Monthly payroll generation and management (RRHH view)
This is the HEART of the system - requires:
A) Monthly Variables Input Interface
typescriptinterface MonthlyVariables {
  employeeId: string;
  month: number;
  year: number;
  
  // Worked time
  workedDays: number;
  ordinaryHours: number;
  
  // Overtime breakdown
  overtime: {
    structural: number;
    nonStructural: number;
    night: number;
    holiday: number;
  };
  
  // Absences
  vacation: number; // days
  temporaryDisability: {
    days: number;
    type: 'common_illness' | 'professional_illness' | 'work_accident' | 'non_work_accident';
  };
  maternityPaternity: number; // days
  paidLeave: number;
  unpaidLeave: number;
  strike: number;
  
  // Variable compensation
  commissions: number;
  incentives: number;
  bonuses: number;
  
  // Others
  advances: number; // to deduct
  benefitsInKind: Array<{ concept: string; value: number }>;
}
B) Calculation Engine - CRITICAL LOGIC
You MUST implement accurate Spanish payroll calculations:
typescript// Main calculation function
function calculatePayslip(employee, variables, config) {
  
  // 1. CALCULATE ACCRUALS
  const accruals = {
    baseSalary: calculateProportionalBaseSalary(employee, variables),
    fixedComplements: calculateFixedComplements(employee),
    proratedBonuses: calculateProratedBonuses(employee),
    overtime: calculateOvertime(variables, employee),
    incentives: variables.commissions + variables.incentives + variables.bonuses,
    total: 0
  };
  accruals.total = Object.values(accruals).reduce((a,b) => a+b, 0);
  
  // 2. CALCULATE COTIZATION BASES
  const bases = {
    commonContingencies: calculateCCBase(accruals, employee, config),
    unemployment: calculateUnemploymentBase(accruals, employee, config),
    training: calculateTrainingBase(accruals, employee, config),
    overtime: calculateOvertimeBase(variables, employee, config)
  };
  
  // 3. APPLY MIN/MAX LIMITS TO BASES
  bases.commonContingencies = applyBaseLimits(
    bases.commonContingencies, 
    employee.cotizationGroup, 
    config
  );
  
  // 4. CALCULATE WORKER COTIZATIONS
  const cotizations = {
    commonContingencies: bases.commonContingencies * 0.047,
    unemployment: bases.unemployment * (employee.contractType === 'permanent' ? 0.0155 : 0.016),
    training: bases.training * 0.001,
    overtime: bases.overtime * 0.02, // if exceeds 80h/year exemption
    total: 0
  };
  cotizations.total = Object.values(cotizations).reduce((a,b) => a+b, 0);
  
  // 5. CALCULATE IRPF
  const irpf = accruals.total * (employee.irpfPercentage / 100);
  
  // 6. CALCULATE NET SALARY
  const netTotal = accruals.total - cotizations.total - irpf - variables.advances;
  
  // 7. CALCULATE COMPANY COTIZATIONS (doesn't appear in employee payslip)
  const companyCotizations = {La respuesta de Claude fue interrumpidaReintentargive me a prompt in english! DONT DO CODE because that it will be created by Opus not Sonnet. i want and optimeized prompt to Opus do. PLEASE all related with Finanzas (nominas, convenios, contratos, education payroll etc) -> directory v1/vacly-nominas. only Nominas.tsx (employee version)-> vacly-app (this file will be where you implement the education guide -that you create in vacly-nominas) 
all related with empleados, configuraciones etc -> directory v1/vacly-app14:13ULTIMATE PROMPT FOR OPUS 4.5: SPANISH PAYROLL AUTOMATION SYSTEM
🎯 YOUR MISSION
You are an expert full-stack developer building a complete payroll automation system for Spain that must:

Comply 100% with Spanish legislation (Social Security + IRPF 2025)
Enable RRHH to generate payslips in under 5 minutes
Include a revolutionary feature: financial education integrated into employee payslips (something NO competitor offers)

You will work systematically through planned phases. Do NOT write all code at once - follow the phased approach.

📁 CRITICAL: PROJECT STRUCTURE
Two separate directories - NEVER mix them:
v1/
├── vacly-nominas/                    # ALL payroll business logic
│   ├── contratos/                    # Contracts management (NEW)
│   ├── generacion/                   # Payroll generation - RRHH view (NEW)
│   ├── conceptos/                    # Salary concepts catalog (NEW)
│   └── educacion/                    # Educational components library (NEW)
│       └── (tooltips, explainers, calculators)
│
└── vacly-app/                        # EXISTING application
    ├── empleados/                    # EXISTS - You will EXTEND
    ├── configuracion/                # EXISTS - You will EXTEND  
    └── nominas/                      # EXISTS - You will ENHANCE
        └── Nominas.tsx               # Employee view - imports from vacly-nominas/educacion
Rules:

vacly-nominas/ = All new payroll pages, calculation engines, generators
vacly-app/ = Only extend existing employee/config/payslip viewer
Employee payslip viewer (vacly-app/nominas/Nominas.tsx) imports educational components from vacly-nominas/educacion/
NEVER duplicate code between directories


🔍 PHASE 0: MANDATORY ANALYSIS (DO THIS FIRST)
Before writing ANY code, you MUST:
Step 0.1: Analyze existing files
Use the view tool to examine:

vacly-app/empleados/ - Current employee structure

What fields exist in employee schema?
How is AddEmployee component structured?
How is EditEmployee component structured?
What's the database schema?
What UI patterns are used?


vacly-app/configuracion/ - Current configuration

What sections already exist?
How is company data stored?
What's the tab structure?
What config data is already available?


vacly-app/nominas/Nominas.tsx - Employee payslip viewer

Current structure and tabs
How payslip data is displayed
Existing components used
What data comes from backend


Design system - Extract corporate identity

tailwind.config.js - Color palette
globals.css - CSS variables
Existing component patterns
Icon library (lucide-react, heroicons, etc.)



Step 0.2: Create analysis document
Output a markdown file: ANALYSIS.md containing:

Existing employee fields vs. missing fields needed for payroll
Existing config sections vs. new sections needed
Current color palette (hex codes)
UI patterns to follow
Database schema modifications needed
Clear plan: what to modify vs. what to create new

DELIVERABLE: ANALYSIS.md file before proceeding to Phase 1

📊 COMPLETE DATA MODEL - ALL INPUTS NEEDED
Employee Payroll Extension (add to existing employee schema)
typescriptinterface EmployeePayrollData {
  // Fiscal identification
  socialSecurityNumber: string;
  taxId: string; // DNI/NIE
  
  // Family situation (for IRPF calculation)
  familySituation: {
    maritalStatus: 'single' | 'married' | 'widowed' | 'divorced' | 'domestic_partnership';
    numberOfChildren: number;
    childrenAges: number[];
    childrenWithDisability: Array<{ age: number; disabilityLevel: number }>; // >=33%
    dependentAscendants: number; // >65 or >75 years
    workerDisability?: number; // percentage if applicable
    spouseDisability?: number;
    singleParent: boolean;
  };
  
  // Current compensation
  compensation: {
    baseSalaryMonthly: number;
    cotizationGroup: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
    irpfPercentage: number; // can be calculated or manual
    fixedComplements: Array<{
      conceptId: string; // reference to salary concepts
      amount: number;
    }>;
    proratedBonuses: boolean; // distribute extra pays monthly?
    numberOfBonuses: number; // typically 2
    bonusMonths: number[]; // [6, 12] by default
  };
  
  // Banking
  iban: string;
  
  // Contract reference
  currentContractId: string;
  contractHistory: string[]; // array of contract IDs
}
Contract Model (NEW table)
typescriptinterface Contract {
  id: string;
  employeeId: string;
  
  // Contract details
  contractType: 'permanent' | 'temporary' | 'training' | 'internship' | 'specific_work';
  startDate: Date;
  endDate?: Date; // only for temporary
  
  // Classification
  cotizationGroup: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  professionalCategory: string;
  occupationCode: string; // CNO code
  agreementId: string; // collective agreement reference
  
  // Working conditions
  fullTime: boolean;
  workdayPercentage: number; // if part-time
  weeklyHours: number;
  shiftType: 'continuous' | 'split' | 'rotating' | 'night';
  
  // Compensation agreed
  agreedBaseSalary: number;
  
  // Status
  status: 'active' | 'expired' | 'cancelled';
  
  // Documentation
  signedPdfUrl?: string;
  notes?: string;
}
Salary Concept Model (NEW table)
typescriptinterface SalaryConcept {
  id: string;
  code: string; // e.g., "PLUS_TRANS"
  name: string; // e.g., "Plus Transporte"
  description: string; // detailed explanation
  
  // Classification
  type: 'salary' | 'non_salary'; // affects SS cotization
  cotizesToSS: boolean;
  tributesIRPF: boolean;
  
  // Calculation
  calculationFormula?: string; // e.g., "baseSalary * 0.1" (optional)
  
  // Association
  agreementId?: string; // if specific to collective agreement
  
  // Status
  active: boolean;
  
  // Educational content (for employee explanation)
  educationalTooltip?: string; // plain language explanation
}
Monthly Variables Model (NEW table)
typescriptinterface MonthlyVariables {
  id: string;
  employeeId: string;
  month: number; // 1-12
  year: number;
  
  // Time worked
  workedDays: number;
  ordinaryHours: number;
  
  // Overtime breakdown
  overtime: {
    structural: number; // hours
    nonStructural: number;
    night: number; // 10pm-6am
    holiday: number;
  };
  
  // Absences
  vacation: number; // days
  temporaryDisability?: {
    days: number;
    type: 'common_illness' | 'professional_illness' | 'work_accident' | 'non_work_accident';
    startDate: Date;
  };
  maternityPaternity: number; // days
  paidLeave: number; // days
  unpaidLeave: number; // days
  strike: number; // days
  
  // Variable compensation
  commissions: number;
  incentives: number;
  bonuses: number;
  
  // Deductions
  advances: number; // already paid, to deduct
  loanPayment: number; // company loan installment
  
  // Benefits in kind
  benefitsInKind: Array<{
    concept: string;
    value: number; // monetary valuation
  }>;
  
  // Flexible compensation
  flexibleCompensation?: {
    childcareCheques: number;
    mealVouchers: number;
    privateHealthInsurance: number;
    training: number;
    publicTransport: number;
  };
}
Payslip Model (NEW table - generated result)
typescriptinterface Payslip {
  id: string;
  employeeId: string;
  month: number;
  year: number;
  generatedDate: Date;
  
  // Accruals (what employee earns)
  accruals: {
    baseSalary: number;
    fixedComplements: Array<{ conceptId: string; amount: number }>;
    proratedBonuses: number;
    overtime: number;
    commissions: number;
    incentives: number;
    totalSalary: number; // salary items
    totalNonSalary: number; // non-salary items (diets, expenses)
    totalAccruals: number;
  };
  
  // Cotization bases
  bases: {
    commonContingencies: number;
    unemployment: number;
    training: number;
    overtime: number;
  };
  
  // Worker deductions
  deductions: {
    socialSecurity: {
      commonContingencies: number;
      unemployment: number;
      training: number;
      overtime: number;
      total: number;
    };
    irpf: number;
    advances: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  
  // Company cotizations (not shown to employee, but calculated)
  companyCotizations: {
    commonContingencies: number;
    unemployment: number;
    fogasa: number;
    training: number;
    atEp: number; // workplace accidents
    overtime: number;
    total: number;
  };
  
  // Final amounts
  netSalary: number; // what employee receives
  totalCostCompany: number; // gross + company cotizations
  
  // Files
  pdfUrl?: string;
  sentToEmployee: boolean;
  sentDate?: Date;
  
  // Status
  status: 'draft' | 'generated' | 'sent' | 'paid';
}
Configuration - Payroll Section (extend existing config)
typescriptinterface PayrollConfiguration {
  // Company data
  companyData: {
    taxId: string; // CIF
    legalName: string;
    address: string;
    socialSecurityAccountCode: string; // CCC
    cnae: string; // economic activity code
    atEpRate: number; // AT/EP rate (varies by company activity)
    companySize: '<250' | '>=250'; // employees count
  };
  
  // Collective agreements
  collectiveAgreements: Array<{
    id: string;
    name: string;
    code: string;
    active: boolean;
    minimumSalaries: Array<{
      category: string;
      baseSalary: number;
    }>;
    specificConcepts: string[]; // concept IDs specific to this agreement
  }>;
  
  // Annual parameters (updates every January)
  annualParameters: {
    year: number; // 2025
    
    // Minimum wage
    smi: number; // 1,184€/month in 14 pays (2025)
    
    // Cotization bases
    maxCotizationBase: number; // 4,720.50€/month (2025)
    minimumBases: {
      1: number;  // Group 1 minimum
      2: number;  // Group 2 minimum
      3: number;  // etc.
      4: number;
      5: number;
      6: number;
      7: number;
      8: number;
      9: number;
      10: number;
      11: number;
    };
    
    // Cotization rates (Social Security 2025)
    cotizationRates: {
      commonContingencies: {
        company: 23.6;
        worker: 4.7;
      };
      unemployment: {
        permanent: {
          company: 23.6;
          worker: 1.55;
        };
        temporary: {
          company: 25.5;
          worker: 1.6;
        };
      };
      fogasa: {
        company: 0.2; // only company pays
      };
      training: {
        company: 0.6;
        worker: 0.1;
      };
      // overtime rates (if exceeds 80h/year exemption)
      overtime: {
        company: 12.0;
        worker: 2.0;
      };
    };
    
    // IRPF table
    irpfTable: {
      personalMinimum: 5550; // €/year
      childrenMinimums: [2400, 2700, 4000, 4500]; // 1st, 2nd, 3rd, 4th+ child
      ascendantsMinimum: {
        over65: 1150;
        over75: 1400;
      };
      disabilityMinimums: {
        worker33to65: 3000;
        workerOver65: 9000;
        assistanceNeeded: 3000; // additional
      };
    };
    
    // Legal limits
    legalLimits: {
      maxOvertimeHoursYear: 80; // exempt from cotization
      maxDietWithoutReceipt: {
        spain: 26.67; // €/day
        spainOvernight: 53.34;
        abroad: 48.08;
        abroadOvernight: 91.35;
      };
    };
  };
  
  // Bonifications available
  availableBonifications: Array<{
    id: string;
    name: string;
    type: string; // young, disability, over45, etc.
    reductionPercentage: number;
    conditions: string;
    active: boolean;
  }>;
}

🎯 PHASE-BY-PHASE EXECUTION PLAN
PHASE 1: DATA FOUNDATION
Objective: Extend existing schemas without breaking anything
Tasks:

Extend Employee Schema (in vacly-app/empleados/)

Add all payroll fields to employee model
Update database migration
Extend AddEmployee component with new tabs:

"Fiscal Data" tab (family situation)
"Compensation" tab (salary, complements, IRPF)


Extend EditEmployee component similarly
Add validation for new fields
Keep existing UI patterns and corporate colors


Extend Configuration Schema (in vacly-app/configuracion/)

Add new tab "Payroll" to configuration
Create form for company payroll data
Create CRUD for collective agreements
Create form for annual parameters
Add 2025 default values
Keep existing UI patterns


Create New Database Tables

contracts table
salary_concepts table
monthly_variables table
payslips table
All with proper indexes and foreign keys



Deliverables:

Modified employee schema + updated forms
Modified configuration with payroll tab
Database migrations
Seed data for 2025 parameters


PHASE 2: CONTRACTS & CONCEPTS MANAGEMENT
Objective: Build foundational CRUD pages in vacly-nominas/
Tasks:

Create Contracts Page (vacly-nominas/contratos/)

Filterable table (by employee, type, status, expiration)
Create/Edit contract modal
PDF upload for signed contract
Alert widget: "Contracts expiring in 30 days"
Historical view per employee
Status badges (active/expired/cancelled)
Bulk actions (export, renew)


Create Concepts Page (vacly-nominas/conceptos/)

CRUD table for salary concepts
Visual indicators: salary (green) vs non-salary (blue)
Search and filter functionality
Predefined concepts library (dropdown to add common ones):

Plus Antigüedad (seniority)
Plus Nocturnidad (night shift)
Plus Transporte (transport - non-salary)
Plus Peligrosidad (hazard pay)
Dietas (diets - non-salary)


Assignment to specific agreements
Educational tooltip editor (for employee explanations)



Deliverables:

Fully functional Contracts CRUD
Fully functional Concepts CRUD
Seed data with common Spanish concepts


PHASE 3: PAYROLL CALCULATION ENGINE
Objective: Build the mathematical core - 100% accuracy required
Tasks:

Create Calculation Library (vacly-nominas/lib/calculadora/)

You must implement these functions with EXACT Spanish legal formulas:
typescript// Core calculation function
calculatePayslip(employee, variables, config, concepts)

// Supporting functions:
calculateProportionalBaseSalary(employee, variables)
calculateFixedComplements(employee, concepts)
calculateProratedBonuses(employee)
calculateOvertime(variables, employee, config)
calculateCotizationBases(accruals, employee, config)
applyBaseLimits(base, cotizationGroup, config)
calculateWorkerCotizations(bases, employee, config)
calculateCompanyCotizations(bases, employee, config)
calculateIRPF(accruals, employee)
calculateTemporaryDisability(variables, employee, config)

Key Legal Rules to Implement:

Temporary Disability (IT) calculation:

Days 1-3: 0€ (not paid)
Days 4-15 (common illness): 60% of regulatory base (company pays)
Days 4-20 (work accident): 75% of regulatory base (company pays)
Day 16+ (common illness): 60% of regulatory base (Social Security pays)
Day 21+ (work accident): 75% of regulatory base (Mutua pays)

Cotization bases:

Must be >= minimum for cotization group
Must be <= maximum (4,720.50€ in 2025)
If employee's salary is below minimum → cotize on minimum
If above maximum → cotize on maximum (excess doesn't cotize)

Overtime:

First 80 hours/year: exempt from cotization
Above 80h: cotizes at 14% (12% company + 2% worker)
Calculate separately from regular hours

IRPF:

Apply percentage to total salary accruals (not non-salary items)
Percentage depends on employee's family situation
Minimum 2% if annual salary < 22,000€


Create Validators (vacly-nominas/lib/validadores/)


Validate salary >= proportional SMI
Validate worked days <= days in month
Validate IT days + worked days + vacations <= month days
Validate IRPF percentage (0-47%)
Validate overtime hours <= legal maximums

Deliverables:

Complete calculation engine library
Comprehensive test suite (20+ test cases)
Validation library
Documentation of all formulas used


PHASE 4: PAYROLL GENERATION PAGE (RRHH VIEW)
Objective: The operational interface where RRHH generates monthly payslips
Create: vacly-nominas/generacion/
Features Required:

Month Selection Interface

Dropdown: select month + year
Load all active employees for that month
Show count: "25 employees to process"


Editable Variables Table

One row per employee
Columns for all monthly variables:

Worked days (default: days in month)
Overtime hours (structured, non-structured, night, holiday)
Vacation days
IT days + type selector
Commissions
Incentives
Advances


Real-time calculation: change value → net salary updates instantly
Inline validation with error indicators


Preview & Actions

"Preview Payslip" button per employee → modal with PDF preview
"Generate All" button → bulk generation
"Generate Selected" → checkboxes to select employees
Progress indicator during generation


Post-Generation Actions

"Download All PDFs" (ZIP file)
"Generate SEPA File" (bank transfer format)
"Generate RED File" (Social Security format)
"Email to Employees" (bulk send)
"Export to Accounting" (CSV/Excel)


Historical View

Tab: "Generated Payslips"
Filter by month, employee, status
View/download previously generated payslips
Regenerate if needed (with warning)



UI Requirements:

Excel-like table for data entry
Keyboard navigation (Tab, Enter)
Autosave every 30 seconds
Undo/Redo functionality
Corporate color scheme
Loading states for calculations
Error messages in Spanish

Deliverables:

Fully functional generation interface
Real-time calculation integration
File generators (PDF, SEPA, RED)
Email sending integration


PHASE 5: DOCUMENT GENERATORS
Objective: Generate legally compliant Spanish documents
Create: vacly-nominas/lib/generadores/
Required Generators:

PDF Payslip Generator (generadorPDF.ts)

Use library: @react-pdf/renderer or pdfmake
Official Spanish payslip format:

Header: company data + employee data
Accruals section: all salary items
Deductions section: SS cotizations + IRPF
Footer: net salary + signatures


Include month/year, generation date
Must be print-ready
Digital signature placeholder


SEPA File Generator (generadorSEPA.ts)

XML format for bank transfers
SEPA standard compliance
One credit transfer per employee
Include payment reference (employee name + month)
Company account as debtor
Employee IBANs as creditors


RED File Generator (generadorRED.ts)

Spanish Social Security format (positional, 900 chars/line)
File structure:

Header record (company data)
Detail records (one per employee with cotization data)
Total record (summary)


Exact field positions per RED specification
Include CCC (Social Security account code)



Deliverables:

PDF generator with official format
SEPA XML generator
RED file generator
Test files for validation


PHASE 6: REVOLUTIONARY FEATURE - PAYSLIP EDUCATION
Objective: Make employees UNDERSTAND their money (unique in market)
Create Educational Components Library (vacly-nominas/educacion/)
Components to Build:

PayslipExplanation.tsx (main container)

Props: { payslipData, employeeData }
Container for all educational sections


SalaryBreakdown.tsx (interactive accruals chart)

Stacked bar chart showing salary construction
Each segment clickable → opens tooltip
Segments: Base | Complements | Prorated Bonuses | Overtime | Incentives
Visual: green shades (corporate colors)


ConceptTooltip.tsx (educational popover)

Plain language explanations (no jargon)
Context-specific to employee's situation
Examples with employee's actual numbers
Props: { concept, amount, employeeContext }



Tooltip Content Library (write in Spanish):
typescriptconst EDUCATIONAL_TOOLTIPS = {
  baseSalary: {
    title: "💼 Salario Base",
    template: `
Es tu sueldo mensual según contrato.
Está fijado en tu convenio colectivo para tu categoría profesional.

- Tu categoría: {category}
- Convenio: {agreement}
- Salario mínimo convenio: {minimumSalary}€

✅ Tu empresa te paga {actualSalary}€ (por encima del mínimo)
    `
  },
  
  proratedBonuses: {
    title: "🎁 Prorrata de Pagas Extras",
    template: `
Tu empresa reparte las {numberOfBonuses} pagas extras en 12 meses.

📊 Cálculo:
(Salario base × {numberOfBonuses}) ÷ 12 = {amount}€/mes

✅ Ventaja: cobras más cada mes
⚠️  Desventaja: no recibirás paga extra separada

💡 Equivale a recibir {totalPays} pagas anuales repartidas en 12 meses
    `
  },
  
  socialSecurity: {
    title: "🏛️ Cotización a la Seguridad Social",
    template: `
Es el {percentage}% de tu salario bruto.

💡 ¿Para qué sirve?
- Derecho a pensión de jubilación
- Cobertura sanitaria pública
- Protección por baja médica (IT)
- Prestación por desempleo

📊 Tu empresa TAMBIÉN aporta {companyAmount}€
   (no lo ves en tu nómina, pero es el 23.6% de tu salario)

🎯 Total aportado este mes a tu protección social: {totalMonth}€
    `
  },
  
  irpf: {
    title: "🏦 Retención IRPF ({percentage}%)",
    template: `
Es un adelanto del impuesto sobre la renta que pagarás en abril.

💡 ¿Por qué {percentage}%?
Se calcula según:
- Tu salario anual estimado: {annualSalary}€
- Tu situación familiar: {maritalStatus}
- Hijos a cargo: {children}

💰 En abril 2026, Hacienda te devolverá o pedirá la diferencia.

🔧 Si crees que es muy alto/bajo, habla con RRHH para ajustarlo
    `
  },
  
  overtime: {
    title: "⏰ Horas Extraordinarias",
    template: `
Has trabajado {hours} horas extra este mes.

📊 Cálculo:
{hours} horas × {ratePerHour}€/hora = {grossAmount}€ bruto

Tras IRPF y Seguridad Social:
+ {netAmount}€ neto en tu cuenta

💡 Las horas extra cotizan igual que tu salario normal
   y generan más pensión futura.
    `
  },
  
  temporaryDisability: {
    title: "🏥 Incapacidad Temporal (IT)",
    template: `
Has estado {days} días de baja médica.

📊 Cómo se paga según ley:
- Días 1-3: Sin cobrar (0€)
- Días 4-15: 60% salario (empresa paga)
- Día 16+: 60% salario (Seguridad Social paga)

💰 Este mes has cobrado: {amountIT}€ por IT

⚠️  La empresa NO puede pagarte los primeros 3 días por ley
    `
  }
};

DeductionsFlow.tsx (where money goes)

Visual breakdown of deductions
Show both worker + company cotizations (unique!)
Section: "What you pay" vs "What company pays"
Clickable items with tooltips


InvisibleBenefits.tsx (future value)

Show accumulated contributions:

"Pension accrual this month: +195€"
"Unemployment protection: +38€"
"In 1 year you'll have contributed 2,340€ to your pension"


Make invisible benefits visible


SmartComparison.tsx (contextual insights)

Compare to previous month: "+50€ (+2.7%)"
Compare to year average: "-15€ (-0.8%)"
Explain differences: "This month you had 3 days IT, that's why your net is slightly lower"


ContextualAlerts.tsx (intelligent notifications)

IT alert: explain 3-day unpaid period
Overtime alert: "You accumulated 150€ in overtime this quarter"
Positive reinforcement: "Your contributions this year: 8,500€ toward pension"


SankeyChart.tsx (optional - visual money flow)

Company pays 3,020€
Your gross: 2,450€
Deductions flow to: SS, IRPF, etc.
Your account: 1,837.50€



THEN: Enhance Employee Payslip Viewer (vacly-app/nominas/Nominas.tsx)
Modifications:

Import all educational components from vacly-nominas/educacion/
Add new section in "Monthly Summary" tab:

💡 "My Payslip Explained"
Use <PayslipExplanation> component
Pass employee's payslip data
Render all educational sub-components


Keep existing PDF viewer and download buttons
Maintain existing tabs (Monthly Summary, Historical, Documents)
Use corporate colors throughout

Deliverables:

Complete educational component library in vacly-nominas/educacion/
Enhanced Nominas.tsx in vacly-app/nominas/
All tooltips written in clear Spanish
Responsive mobile design
Accessibility (ARIA labels, keyboard navigation)


🎨 DESIGN SYSTEM COMPLIANCE
CRITICAL: You MUST use existing corporate colors
Before creating any UI, you must:

Extract color variables from tailwind.config.js
Extract CSS variables from globals.css
Document primary, secondary, accent, success, error, warning colors
Use ONLY these colors in all new components

Example color usage:
typescript// DON'T create new palette
const colors = {
  accrual: 'bg-green-50 text-green-700 border-green-200', // ❌ WRONG
}

// DO use existing variables
const colors = {
  accrual: 'bg-primary-50 text-primary-700 border-primary-200', // ✅ CORRECT
}
Maintain consistency:

Use existing button styles
Use existing form input styles
Use existing modal/dialog styles
Use existing table styles
Use existing icon library
Use existing font families and sizes


✅ TESTING REQUIREMENTS
For Calculation Engine - MANDATORY Test Cases:
typescript// Test 1: Standard payslip
{
  employee: { baseSalary: 2000, group: 3, contractType: 'permanent', irpf: 15%, proratedBonuses: true },
  variables: { workedDays: 30, overtime: 0, absences: 0 },
  expected: { gross: 2333.33, ssCotization: 147.33, irpf: 350, net: 1836 }
}

// Test 2: With temporary disability
{
  variables: { workedDays: 20, IT: { days: 10, type: 'common_illness' } },
  expected: { 
    days1to3: 0, 
    days4to10: 60% of daily salary,
    totalIT: calculatedAmount
  }
}

// Test 3: With overtime
{
  variables: { overtime: { structural: 10, night: 5 } },
  expected: { overtimeGross: X, overtimeNet: Y, overtimeCotization: Z }
}

// Test 4: Base below minimum
{
  employee: { baseSalary: 800, group: 7 },
  expected: { baseCC: 1323 (group 7 minimum 2025), adjusted: true }
}

// Test 5: Base above maximum
{
  employee: { baseSalary: 5000, group: 1 },
  expected: { baseCC: 4720.50 (max 2025), excess: 279.50 (doesn't cotize) }
}

// Test 6: Part-time worker
{
  employee: { baseSalary: 1500, workdayPercentage: 50% },
  expected: { proportionalSalary, proportionalBases }
}

// Test 7: Multiple concepts
{
  employee: { 
    baseSalary: 1800,
    fixedComplements: [
      { conceptId: 'transport', amount: 100 },
      { conceptId: 'seniority', amount: 200 }
    ]
  },
  expected: { baseCC calculation with complements }
}
```

**Each test must:**
- Have expected values calculated manually using 2025 Spanish legislation
- Include edge cases
- Validate all deductions are within legal ranges
- Check rounding (2 decimals)

---

## 📦 DELIVERABLES PER PHASE

### Phase 0:
- `ANALYSIS.md` - Complete analysis document

### Phase 1:
- Modified employee schema + UI
- Modified configuration schema + UI
- Database migrations
- Seed data (2025 parameters)

### Phase 2:
- Contracts CRUD page
- Concepts CRUD page
- Seed data (common concepts)

### Phase 3:
- Calculation engine library
- Validator library
- Test suite (20+ cases, all passing)
- Formula documentation

### Phase 4:
- Payroll generation interface
- Real-time calculation integration
- Historical view

### Phase 5:
- PDF generator (Spanish format)
- SEPA XML generator
- RED file generator
- Sample output files

### Phase 6:
- Educational components library (`vacly-nominas/educacion/`)
- Enhanced employee payslip viewer (`vacly-app/nominas/Nominas.tsx`)
- All tooltips in Spanish
- Mobile-responsive design
- Accessibility features

---

## 🚦 EXECUTION INSTRUCTIONS

**START HERE:**

1. **Run Phase 0 first**
   - Use `view` tool to analyze existing files
   - Create `ANALYSIS.md`
   - Get explicit approval before proceeding

2. **Then proceed sequentially:**
   - Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
   - DO NOT skip phases
   - DO NOT work on multiple phases simultaneously
   - Complete all deliverables of current phase before moving to next

3. **After each phase:**
   - Create summary markdown: `PHASE_X_COMPLETE.md`
   - List what was created/modified
   - Note any deviations from plan
   - Highlight any issues encountered

4. **Code quality standards:**
   - TypeScript strict mode
   - Proper error handling (try/catch)
   - Loading states for async operations
   - Input validation on all forms
   - Accessibility (ARIA labels, semantic HTML)
   - Comments for complex logic (Spanish legal formulas)
   - Consistent naming conventions

5. **File organization:**
   - Keep `vacly-nominas/` separate from `vacly-app/`
   - Shared utilities can go in `vacly-nominas/lib/`
   - Educational components in `vacly-nominas/educacion/`
   - No circular dependencies

---

## 🎯 SUCCESS CRITERIA

**The system is complete when:**

✅ RRHH can generate 25 payslips in under 5 minutes
✅ All calculations match manual calculations (100% accuracy)
✅ Generated PDFs comply with Spanish legal format
✅ SEPA and RED files validate against official validators
✅ Employees can understand their payslips via educational tooltips
✅ System handles all edge cases (IT, overtime, part-time, bonifications)
✅ Mobile responsive and accessible (WCAG 2.1 AA)
✅ All tests pass
✅ Zero TypeScript errors
✅ Corporate design system maintained throughout

---

## 📞 WHEN TO ASK FOR CLARIFICATION

**Ask the user if:**
- Existing employee/config schema conflicts with required fields
- Corporate colors are insufficient for new UI needs
- Business logic rule is ambiguous
- Need credentials for external services (email, bank API)
- Database migration would cause data loss
- Performance optimization needed for calculations

**Do NOT ask about:**
- Spanish legal formulas (they're provided above)
- UI/UX decisions (follow existing patterns)
- Code structure (follow the plan)
- Technology choices (use what's in existing project)

---

## 🚀 BEGIN EXECUTION

**Your first action should be:**
```
I will now begin Phase 0: Analysis.

Using the view tool, I will examine:
1. vacly-app/empleados/ structure
2. vacly-app/configuracion/ structure  
3. vacly-app/nominas/Nominas.tsx
4. tailwind.config.js for color palette
5. globals.css for design tokens

Then I will create ANALYSIS.md documenting all findings.

Proceeding now...
```

**After completing each phase, report:**
```
Phase X Complete.

Created/Modified:
- [list files]

Deliverables:
- [checklist]

Ready to proceed to Phase X+1? (yes/no)

GO! Start with Phase 0 analysis now.