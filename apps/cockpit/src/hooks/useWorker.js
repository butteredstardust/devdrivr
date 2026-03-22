import { useEffect, useRef } from 'react';
import { wrap } from 'comlink';
/**
 * Creates a comlink-wrapped Web Worker. Terminates on unmount.
 *
 * Usage:
 *   const worker = useWorker<FormatterWorker>(
 *     () => new Worker(new URL('../workers/formatter.worker.ts', import.meta.url), { type: 'module' })
 *   )
 *
 * The factory function pattern ensures a new Worker is created per component instance,
 * not shared across renders.
 */
export function useWorker(factory) {
    const proxyRef = useRef(null);
    const workerRef = useRef(null);
    useEffect(() => {
        const worker = factory();
        workerRef.current = worker;
        proxyRef.current = wrap(worker);
        return () => {
            worker.terminate();
            workerRef.current = null;
            proxyRef.current = null;
        };
        // factory is stable when caller wraps in useCallback or passes inline arrow
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return proxyRef.current;
}
