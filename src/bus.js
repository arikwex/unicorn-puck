let handlers = new Map();

function on(event, handler) {
  let eventHandlers = handlers.get(event);
  if (!eventHandlers) handlers.set(event, eventHandlers = new Set());
  eventHandlers.add(handler);
  return () => off(event, handler);
}

function once(event, handler) {
  const unsubscribe = on(event, (data) => {
    unsubscribe();
    handler(data);
  });
  return unsubscribe;
}

function off(event, handler) {
  const eventHandlers = handlers.get(event);
  eventHandlers?.delete(handler);
  if (!eventHandlers?.size) handlers.delete(event);
}

function emit(event, data) {
  // Copy so handlers can safely unsubscribe while an event is being emitted.
  [...(handlers.get(event) || [])].forEach((handler) => handler(data));
}

function clear() {
  handlers = new Map();
}

export { clear, emit, off, on, once };
