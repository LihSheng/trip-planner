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
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; nextController.abort(); }, 45_000);
    controller.current = nextController;
    setLoading(true); setError(undefined);
    try {
      const nextDraft = await createAiImportDraft(accessToken, request, nextController.signal);
      setDraft(nextDraft);
      return nextDraft;
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to create an AI draft.');
      else if (timedOut) setError('AI service timed out. Your trip was not changed; try again later.');
      return undefined;
    } finally {
      window.clearTimeout(timeout);
      if (controller.current === nextController) setLoading(false);
    }
  }, [accessToken]);

  const cancel = useCallback(() => { controller.current?.abort(); setLoading(false); }, []);
  const reset = useCallback(() => { cancel(); setDraft(undefined); setError(undefined); }, [cancel]);
  return { draft, setDraft, loading, error, createDraft, cancel, reset };
}
