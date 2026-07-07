// Generic polling hook used by the job-detail page (queued/running) and the
// seller-submission detail page (pending), per PLATFORM_CONTRACT.md §9:
// "Poll GET /api/jobs/{job_id} every few seconds while status is
// queued/running; stop polling once terminal. Same polling pattern for
// seller submission status while pending."

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_INTERVAL_MS = 3000;

export interface UsePollOptions<T> {
  /** Fetches the latest snapshot. Receives an AbortSignal tied to unmount/refetch. */
  fetcher: (signal: AbortSignal) => Promise<T>;
  /** Returns true once polling should stop (terminal state reached). */
  isTerminal: (data: T) => boolean;
  intervalMs?: number;
  /** Set to false to disable polling entirely (e.g. no id yet). */
  enabled?: boolean;
}

export interface UsePollResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  /** Manually re-fetch immediately (e.g. right after an action like hire/accept). */
  refetch: () => void;
}

export function usePoll<T>({ fetcher, isTerminal, intervalMs = DEFAULT_INTERVAL_MS, enabled = true }: UsePollOptions<T>): UsePollResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetcherRef = useRef(fetcher);
  const isTerminalRef = useRef(isTerminal);
  fetcherRef.current = fetcher;
  isTerminalRef.current = isTerminal;

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const tick = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await fetcherRef.current(controller.signal);
      setData(result);
      setError(null);
      setIsLoading(false);
      if (!isTerminalRef.current(result)) {
        timeoutRef.current = setTimeout(tick, intervalMs);
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      setError(err as Error);
      setIsLoading(false);
      // Keep polling even after a transient error — a job that's mid-run
      // shouldn't get permanently stuck in the UI over one flaky request.
      timeoutRef.current = setTimeout(tick, intervalMs);
    }
  }, [intervalMs]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    tick();
    return () => {
      clearTimer();
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const refetch = useCallback(() => {
    clearTimer();
    tick();
  }, [clearTimer, tick]);

  return { data, error, isLoading, refetch };
}
