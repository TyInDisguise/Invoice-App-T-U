export interface FirmUser {
  id: string
  firm_id: string
  email: string
  full_name: string | null
}

export interface Property {
  id: string
  firm_id: string
  portfolio_id: string | null
  name: string
  address_line1: string | null
  city: string | null
  state_region: string | null
}

export interface Loan {
  id: string
  firm_id: string
  property_id: string
  lender_name: string
  loan_number: string | null
  original_balance: string
  current_balance: string
  status: string
}

export interface PropertyDashboard {
  property: Property
  active_loans: Array<{
    id: string
    lender_name: string
    current_balance: string
    status: string
  }>
  budget_summary: {
    count: number
    total_amount: string
    active_count: number
  }
  draw_count: number
}

export interface Invoice {
  id: string
  firm_id: string
  property_id: string
  vendor_id: string | null
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: string | null
  currency: string
  status: string
  on_hold_reason: string | null
  rejected_reason: string | null
  payment_method: string | null
  paid_at: string | null
  expense_classification: string
  intake_source: string
  intake_received_at: string
}

export interface InvoiceExtraction {
  invoice_id: string
  status: string
  ai_provider: string | null
  ai_model_id: string | null
  ai_confidence_score: string | null
  ai_extracted_payload: Record<string, unknown> | null
  ai_field_status: Record<string, string> | null
  suggested_vendor_id: string | null
}

export interface InvoiceAttachment {
  id: string
  invoice_id: string
  attachment_ref: string
  attachment_type: string
  upload_source: string
}

export interface Draw {
  id: string
  firm_id: string
  property_id: string
  loan_id: string
  budget_id: string | null
  draw_number: number
  period_start: string
  period_end: string
  status: string
  revision_number: number
  submitted_at: string | null
  funded_at: string | null
  revision_requested_at: string | null
  revision_feedback: string | null
}

export interface DrawItem {
  id: string
  draw_id: string
  invoice_id: string
  invoice_line_item_id: string | null
  allocated_amount: string
  excluded_for_period: boolean
  deferred_to_next_draw: boolean
  deferral_reason: string | null
}

export interface DrawPreflight {
  ready: boolean
  blocking_issues: Array<{ vendor_id: string; reason: string }>
}

export interface DrawPackage {
  id: string
  draw_id: string
  version: number
  lender_template_id: string | null
  pdf_attachment_ref: string | null
  excel_attachment_ref: string | null
  generated_at: string
  sent_at: string | null
}

export interface Budget {
  id: string
  firm_id: string
  property_id: string
  name: string
  status: string
  total_amount: string
}

export interface PMPin {
  id: string
  property_id: string
  pm_name: string
  pm_email: string | null
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

export interface Vendor {
  id: string
  firm_id: string
  name: string
  contact_email: string | null
  contact_phone: string | null
  city: string | null
  state_region: string | null
  is_active: boolean
}

export interface SignedTokenResponse {
  token: string
  jti: string
  expires_at: string
}

export interface BudgetLineItem {
  id: string
  budget_id: string
  code: string
  description: string
  funding_source: string | null
  sort_order: number
  original_amount: string
  retainage_percent: string | null
  is_contingency: boolean
}
