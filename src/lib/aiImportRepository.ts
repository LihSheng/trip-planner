import type { AiImportRequest, AiItineraryDraft } from '../types/aiImport';
import { supabasePublishableKey, supabaseUrl } from './supabaseConfig';

const aiImportFunctionName = import.meta.env.VITE_AI_IMPORT_FUNCTION_NAME ?? 'ai-itinerary-import';

export async function createAiImportDraft(accessToken: string, request: AiImportRequest, signal?: AbortSignal): Promise<AiItineraryDraft> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${aiImportFunctionName}`, {
    method: 'POST', signal,
    headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = await response.json().catch(() => ({})) as AiItineraryDraft & { message?: string };
  if (!response.ok) throw new Error(body.message || `AI import failed (${response.status})`);
  return body;
}
