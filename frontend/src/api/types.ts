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
  address_line1: string
  address_line2: string | null
  city: string
  state_region: string
  postal_code: string
  country: string
  property_type: string
  status: string
  custom_fields: Record<string, unknown>
}

export interface PropertyDashboard {
  property: Property
  open_review_count: number
  approved_count: number
}

export interface Portfolio {
  id: string
  firm_id: string
  name: string
  description: string | null
}

export interface PropertyContact {
  id: string
  property_id: string
  name: string
  contact_role: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

export interface PropertyEntity {
  id: string
  property_id: string
  legal_name: string
  notes: string | null
}

export interface PropertyPattern {
  id: string
  property_id: string
  pattern_type: string
  pattern_text: string
  confirmed_by_user: boolean
}

export interface Invoice {
  id: string
  firm_id: string
  property_id: string | null
  proposed_property_id: string | null
  property_match_signal: string | null
  vendor_id: string | null
  proposed_vendor_id: string | null
  vendor_name: string | null
  bill_to_entity: string | null
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  tax_amount: string | null
  total_amount: string | null
  currency: string
  category: string | null
  status: string
  on_hold_reason: string | null
  rejected_reason: string | null
  extraction_status: string
  extraction_attempts: number
  extraction_failure_reason: string | null
  page_count: number | null
  pages_extracted: number | null
  validation_flags: Record<string, unknown> | null
  duplicate_of_invoice_id: string | null
  intake_source: string
  intake_received_at: string
  ai_confidence_score: string | null
  ai_provider: string | null
  ai_model_id: string | null
}

export interface InvoiceLineItem {
  id: string
  invoice_id: string
  description: string
  amount: string
  sort_order: number
}

export interface InvoiceExtractionView {
  invoice_id: string
  status: string
  extraction_status: string
  ai_provider: string | null
  ai_model_id: string | null
  ai_confidence_score: number | null
  ai_extracted_payload: Record<string, unknown> | null
  ai_field_status: Record<string, unknown> | null
  validation_flags: Record<string, unknown> | null
  proposed_vendor_id: string | null
  proposed_property_id: string | null
  property_match_signal: string | null
  page_count: number | null
  pages_extracted: number | null
}

export interface ExtractionCorrection {
  vendor_id?: string | null
  property_id?: string | null
  vendor_name?: string | null
  bill_to_entity?: string | null
  invoice_number?: string | null
  invoice_date?: string | null
  due_date?: string | null
  tax_amount?: string | null
  total_amount?: string | null
  currency?: string | null
  category?: string | null
}

export interface InvoiceAttachment {
  id: string
  invoice_id: string
  attachment_ref: string
  attachment_type: string
  upload_source: string
}

export interface Vendor {
  id: string
  firm_id: string
  name: string
  contact_email: string | null
  contact_phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state_region: string | null
  postal_code: string | null
  country: string | null
  notes: string | null
}

export interface VendorPattern {
  id: string
  vendor_id: string
  pattern_type: string
  pattern_text: string
  confirmed_by_user: boolean
}
