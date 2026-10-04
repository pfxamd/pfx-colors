import type { ModifierKeys, Point, PointerKind } from './types.js';

/** @public */
export interface HoverInput {
  readonly phase: 'enter' | 'move' | 'leave';
  readonly timestamp: number;
  readonly position: Point;
  readonly pointerType: PointerKind;
  readonly modifiers: ModifierKeys;
}

/** @public */
export interface HoverState {
  readonly phase: 'start' | 'update' | 'end';
  readonly timestamp: number;
  readonly position: Point;
  readonly pointerType: PointerKind;
  readonly modifiers: ModifierKeys;
  readonly isHovering: boolean;
}

/** @public */
export class HoverRecognizer {
  private hovering = false;

  handle(input: HoverInput): HoverState | null {
    if (input.phase === 'enter') {
      this.hovering = true;
      return { ...input, phase: 'start', isHovering: true };
    }
    if (input.phase === 'move') {
      if (!this.hovering) return null;
      return { ...input, phase: 'update', isHovering: true };
    }
    if (!this.hovering) return null;
    this.hovering = false;
    return { ...input, phase: 'end', isHovering: false };
  }
}
