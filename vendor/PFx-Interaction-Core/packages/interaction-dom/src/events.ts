import type {
  KeyboardSample,
  ModifierKeys,
  PointerKind,
  PointerSample,
  Point,
  WheelDeltaMode,
  WheelSample,
} from '@pfx/interaction-core';

export function modifierKeys(
  event: Pick<
    KeyboardEvent | PointerEvent | WheelEvent,
    'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'
  >,
): ModifierKeys {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
  };
}

export function pointerKind(pointerType: string): PointerKind {
  if (pointerType === 'mouse' || pointerType === 'touch' || pointerType === 'pen') {
    return pointerType;
  }
  return 'unknown';
}

export function wheelDeltaMode(deltaMode: number): WheelDeltaMode {
  if (deltaMode === 0) return 'pixel';
  if (deltaMode === 1) return 'line';
  if (deltaMode === 2) return 'page';
  return 'unknown';
}

export function clientPoint(
  event: Pick<PointerEvent | WheelEvent, 'clientX' | 'clientY'>,
): Point {
  return { x: event.clientX, y: event.clientY };
}

export function keyboardSample(
  event: KeyboardEvent,
  phase: KeyboardSample['phase'],
): KeyboardSample {
  return {
    kind: 'keyboard',
    phase,
    timestamp: event.timeStamp,
    key: event.key,
    code: event.code,
    repeat: event.repeat,
    modifiers: modifierKeys(event),
  };
}

export function wheelSample(event: WheelEvent, position = clientPoint(event)): WheelSample {
  return {
    kind: 'wheel',
    timestamp: event.timeStamp,
    delta: { x: event.deltaX, y: event.deltaY },
    deltaMode: wheelDeltaMode(event.deltaMode),
    position,
    modifiers: modifierKeys(event),
  };
}

export function pointerSample(
  event: PointerEvent,
  phase: PointerSample['phase'],
  previous: Point | null,
  mapPosition: (event: PointerEvent) => Point = clientPoint,
): PointerSample {
  const position = mapPosition(event);
  return {
    kind: 'pointer',
    phase,
    timestamp: event.timeStamp,
    pointerId: event.pointerId,
    pointerType: pointerKind(event.pointerType),
    position,
    delta: previous ? { x: position.x - previous.x, y: position.y - previous.y } : { x: 0, y: 0 },
    pressure: event.pressure,
    buttons: event.buttons,
    modifiers: modifierKeys(event),
  };
}
