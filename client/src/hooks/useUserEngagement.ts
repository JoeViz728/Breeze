import { useCallback, useEffect, useRef, useState } from 'react';

/** Disengage after this long with no meaningful input while the window stays focused. */
const ENGAGEMENT_IDLE_MS = 90_000;

export function useUserEngagement() {
  const [isEngaged, setIsEngaged] = useState(false);
  const engagedRef = useRef(false);
  const idleTimerRef = useRef<number | undefined>(undefined);

  const setEngaged = useCallback((value: boolean) => {
    if (engagedRef.current === value) return;
    engagedRef.current = value;
    setIsEngaged(value);
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== undefined) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = undefined;
    }
  }, []);

  const disengage = useCallback(() => {
    clearIdleTimer();
    setEngaged(false);
  }, [clearIdleTimer, setEngaged]);

  const markEngaged = useCallback(() => {
    setEngaged(true);
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      setEngaged(false);
    }, ENGAGEMENT_IDLE_MS);
  }, [clearIdleTimer, setEngaged]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isTrusted) markEngaged();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.isTrusted) markEngaged();
    };
    const onWheel = (event: WheelEvent) => {
      if (event.isTrusted) markEngaged();
    };
    const onBlur = () => disengage();

    window.addEventListener('keydown', onKeyDown, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', onBlur);
      clearIdleTimer();
    };
  }, [clearIdleTimer, disengage, markEngaged]);

  return { isEngaged, markEngaged, disengage };
}