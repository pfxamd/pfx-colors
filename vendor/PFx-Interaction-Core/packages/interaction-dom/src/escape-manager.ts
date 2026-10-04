type EscapeHandler = (event: KeyboardEvent) => void;

interface EscapeRegistry {
  readonly handlers: Set<EscapeHandler>;
  readonly listener: (event: KeyboardEvent) => void;
}

const registries = new WeakMap<Document, EscapeRegistry>();

export function subscribeEscape(document: Document, handler: EscapeHandler): () => void {
  let registry = registries.get(document);
  if (!registry) {
    const handlers = new Set<EscapeHandler>();
    const listener = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      for (const current of handlers) current(event);
    };
    registry = { handlers, listener };
    registries.set(document, registry);
    document.addEventListener('keydown', listener);
  }

  registry.handlers.add(handler);

  return () => {
    const current = registries.get(document);
    if (!current) return;
    current.handlers.delete(handler);
    if (current.handlers.size > 0) return;
    document.removeEventListener('keydown', current.listener);
    registries.delete(document);
  };
}
