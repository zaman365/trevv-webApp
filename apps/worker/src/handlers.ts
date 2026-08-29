import {
  auditWorkerEventTypes,
  collaborationWorkerEventTypes,
  internalWorkerEventTypes,
  type InternalEventResult,
  type WorkerTransactionRepositories,
} from "@founderhq/db";

export interface WorkerHandler {
  name: string;
  eventTypes: readonly string[];
  process: (
    repositories: WorkerTransactionRepositories,
    now: Date,
  ) => Promise<InternalEventResult>;
}

export interface WorkerHandlerRegistry {
  handlers: readonly WorkerHandler[];
  activeHandlers: readonly WorkerHandler[];
  disabledHandlerNames: readonly string[];
  handlerEventTypes: readonly string[];
  activeEventTypes: readonly string[];
  resolve: (eventType: string) => WorkerHandler | undefined;
  isActive: (handlerName: string) => boolean;
}

export const attentionWorkerHandler: WorkerHandler = {
  name: "attention",
  eventTypes: internalWorkerEventTypes,
  process: (repositories, now) => repositories.processInternalEvent(now),
};

export const collaborationWorkerHandler: WorkerHandler = {
  name: "collaboration",
  eventTypes: collaborationWorkerEventTypes,
  process: (repositories, now) => repositories.processInternalEvent(now),
};

export const auditWorkerHandler: WorkerHandler = {
  name: "audit",
  eventTypes: auditWorkerEventTypes,
  process: (repositories, now) => repositories.processInternalEvent(now),
};

export const defaultWorkerHandlers = [
  attentionWorkerHandler,
  auditWorkerHandler,
  collaborationWorkerHandler,
] as const;

export function createWorkerHandlerRegistry(
  handlers: readonly WorkerHandler[] = defaultWorkerHandlers,
  disabledHandlerNames: Iterable<string> = [],
): WorkerHandlerRegistry {
  const disabled = new Set(disabledHandlerNames);
  const handlerNames = new Set<string>();
  const handlersByEventType = new Map<string, WorkerHandler>();

  for (const handler of handlers) {
    assertHandlerName(handler.name);
    if (handlerNames.has(handler.name))
      throw new Error(`Worker handler “${handler.name}” is registered twice.`);
    if (handler.eventTypes.length === 0)
      throw new Error(
        `Worker handler “${handler.name}” must own at least one event type.`,
      );
    handlerNames.add(handler.name);
    for (const eventType of handler.eventTypes) {
      assertEventType(eventType);
      const owner = handlersByEventType.get(eventType);
      if (owner)
        throw new Error(
          `Worker event type “${eventType}” is owned by both “${owner.name}” and “${handler.name}”.`,
        );
      handlersByEventType.set(eventType, handler);
    }
  }

  for (const name of disabled)
    if (!handlerNames.has(name))
      throw new Error(`Unknown disabled worker handler “${name}”.`);

  const activeHandlers = handlers.filter(({ name }) => !disabled.has(name));
  const activeEventTypes = activeHandlers.flatMap(({ eventTypes }) => [
    ...eventTypes,
  ]);
  const activeNames = new Set(activeHandlers.map(({ name }) => name));

  return {
    handlers: [...handlers],
    activeHandlers,
    disabledHandlerNames: [...disabled].sort(),
    handlerEventTypes: [...handlersByEventType.keys()],
    activeEventTypes,
    resolve(eventType) {
      const handler = handlersByEventType.get(eventType);
      return handler && activeNames.has(handler.name) ? handler : undefined;
    },
    isActive: (handlerName) => activeNames.has(handlerName),
  };
}

function assertHandlerName(value: string): void {
  if (!/^[a-z][a-z0-9_-]{1,63}$/u.test(value))
    throw new Error(
      "Worker handler names must be 2-64 lowercase URL-safe characters.",
    );
}

function assertEventType(value: string): void {
  if (!/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u.test(value))
    throw new Error(`Invalid worker event type “${value}”.`);
}
