import type { AiImportRequest, AiItineraryDraft } from '../types/aiImport';
import { supabasePublishableKey, supabaseUrl } from './supabaseConfig';

export async function createAiImportDraft(accessToken: string, request: AiImportRequest, signal?: AbortSignal): Promise<AiItineraryDraft> {
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-itinerary-import`, {
    method: 'POST', signal,
    headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = await response.json().catch(() => ({})) as AiItineraryDraft & { message?: string };
  if (!response.ok) throw new Error(body.message || `AI import failed (${response.status})`);
  return body;
}
