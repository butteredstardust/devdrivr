import { useEffect, useRef } from 'react';
import { subscribeToolAction } from '@/lib/tool-actions';
export function useToolAction(handler) {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    useEffect(() => {
        return subscribeToolAction((action) => handlerRef.current(action));
    }, []);
}
