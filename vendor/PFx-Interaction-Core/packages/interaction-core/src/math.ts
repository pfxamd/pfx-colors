import type { Point } from './types.js';

export const ZERO_POINT: Point = Object.freeze({ x: 0, y: 0 });

export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function magnitude(point: Point): number {
  return Math.hypot(point.x, point.y);
}

export function normalizeVector(point: Point): Point {
  const length = magnitude(point);
  if (length === 0) return ZERO_POINT;
  return { x: point.x / length, y: point.y / length };
}

export function distance(a: Point, b: Point): number {
  return magnitude(subtract(a, b));
}
