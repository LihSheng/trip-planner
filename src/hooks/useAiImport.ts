import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createAiImportDraft } from '../lib/aiImportRepository';
import type { AiImportRequest, AiItineraryDraft } from '../types/aiImport';

export function useAiImport() {
  const { accessToken } = useAuth();
  const controller = useRef<AbortController | undefined>(undefined);
  const [draft, setDraft] = useState<AiItineraryDraft>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const createDraft = useCallback(async (request: AiImportRequest) => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setLoading(true); setError(undefined);
    try {
      const nextDraft = await createAiImportDraft(accessToken, request, nextController.signal);
      setDraft(nextDraft);
      return nextDraft;
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to create an AI draft.');
      return undefined;
    } finally { if (controller.current === nextController) setLoading(false); }
  }, [accessToken]);

  const reset = useCallback(() => { controller.current?.abort(); setDraft(undefined); setError(undefined); setLoading(false); }, []);
  return { draft, setDraft, loading, error, createDraft, reset };
}
