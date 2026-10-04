/** @public */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** @public */
export type PointerKind = 'mouse' | 'touch' | 'pen' | 'unknown';

/** @public */
export interface ModifierKeys {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
}

/** @public */
export interface PointerSample {
  readonly kind: 'pointer';
  readonly phase: 'down' | 'move' | 'up' | 'cancel';
  readonly timestamp: number;
  readonly pointerId: number;
  readonly pointerType: PointerKind;
  readonly position: Point;
  readonly delta: Point;
  readonly pressure: number;
  readonly buttons: number;
  readonly modifiers: ModifierKeys;
}

/** @public */
export interface KeyboardSample {
  readonly kind: 'keyboard';
  readonly phase: 'down' | 'up';
  readonly timestamp: number;
  readonly key: string;
  readonly code: string;
  readonly repeat: boolean;
  readonly modifiers: ModifierKeys;
}

/** @public */
export type WheelDeltaMode = 'pixel' | 'line' | 'page' | 'unknown';

/** @public */
export interface WheelSample {
  readonly kind: 'wheel';
  readonly timestamp: number;
  readonly delta: Point;
  readonly deltaMode: WheelDeltaMode;
  readonly position: Point;
  readonly modifiers: ModifierKeys;
}

/** @public */
export type InputSample = PointerSample | KeyboardSample | WheelSample;

/** @public */
export type InteractionPhase = 'idle' | 'possible' | 'start' | 'update' | 'end' | 'cancel';

/** @public */
export interface InteractionSnapshot {
  readonly phase: InteractionPhase;
  readonly timestamp: number;
  readonly position: Point;
  readonly delta: Point;
  readonly offset: Point;
  readonly distance: number;
  readonly direction: Point;
  readonly velocity: Point;
  readonly isActive: boolean;
  readonly pointerType: PointerKind;
  readonly pointerId: number | null;
  readonly pressure: number;
  readonly modifiers: ModifierKeys;
}

/** @public */
export interface MotionState {
  readonly position: number;
  readonly velocity: number;
}

/** @public */
export interface Scheduler {
  now(): number;
  request(callback: (timestamp: number) => void): number;
  cancel(id: number): void;
}

/** @public */
export interface Cancelable {
  cancel(): void;
  readonly running: boolean;
}
