'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SleepTimer } from '@/lib/sleep-timer';

/** Sleep timer state for a player. `onExpire` is read at fire time, so it may change between renders. Cancelled on unmount. */
export function useSleepTimer(onExpire: () => void) {
  const timerRef = useRef<SleepTimer | null>(null);
  if (timerRef.current === null) timerRef.current = new SleepTimer();
  const expireRef = useRef(onExpire);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const timer = timerRef.current!;
    return () => timer.cancel();
  }, []);

  const start = useCallback((minutes: number) => {
    timerRef.current!.start(minutes, () => expireRef.current(), setRemainingMs);
  }, []);

  const cancel = useCallback(() => {
    timerRef.current!.cancel();
    setRemainingMs(0);
  }, []);

  return { remainingMs, active: remainingMs > 0, start, cancel };
}
