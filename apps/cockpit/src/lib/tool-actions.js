const listeners = new Set();
export function subscribeToolAction(listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
export function dispatchToolAction(action) {
    listeners.forEach((fn) => fn(action));
}
