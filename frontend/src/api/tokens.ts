import { api } from './client'
import type { PMPin, SignedTokenResponse } from './types'

/**
 * Build the external-portal URL that a signed token resolves to.
 *
 * The token is embedded as a path segment — same shape the backend's
 * `/portal/{kind}/:token` routes expect.
 */
export function portalUrlForToken(kind: 'lender' | 'vendor', token: string): string {
  const origin = window.location.origin
  return `${origin}/portal/${kind}/${token}`
}

export async function issueLenderToken(
  entityType: string,
  entityId: string,
): Promise<SignedTokenResponse> {
  return api.post<SignedTokenResponse>('/auth/tokens/lender', {
    token_type: 'lender_receipt',
    entity_type: entityType,
    entity_id: entityId,
  })
}

export async function issueVendorToken(
  entityType: string,
  entityId: string,
): Promise<SignedTokenResponse> {
  return api.post<SignedTokenResponse>('/auth/tokens/vendor', {
    token_type: 'vendor_compliance_upload',
    entity_type: entityType,
    entity_id: entityId,
  })
}

// ---- PM PIN management ----

export async function listPmPins(propertyId: string): Promise<PMPin[]> {
  return api.get<PMPin[]>(`/properties/${propertyId}/pm-pins`)
}

export async function createPmPin(
  propertyId: string,
  body: { pm_name: string; pm_email?: string | null; pin: string },
): Promise<PMPin> {
  return api.post<PMPin>(`/properties/${propertyId}/pm-pins`, body)
}

export async function revokePmPin(
  propertyId: string,
  pinId: string,
): Promise<PMPin> {
  return api.post<PMPin>(`/properties/${propertyId}/pm-pins/${pinId}/revoke`)
}
