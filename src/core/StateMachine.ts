/**
 * Minimal generic finite state machine.
 * Each state is an object with optional enter/exit and an update per tick.
 */
export interface State<C, K extends string> {
  enter?(ctx: C, prev: K | null): void;
  update(ctx: C, dt: number): void;
  exit?(ctx: C, next: K): void;
}

export class StateMachine<C, K extends string> {
  private _current: K;
  private _previous: K | null = null;
  /** Seconds since entering the current state. */
  time = 0;

  constructor(
    private readonly ctx: C,
    private readonly states: Record<K, State<C, K>>,
    initial: K,
    private readonly onChange?: (from: K | null, to: K) => void,
  ) {
    this._current = initial;
  }

  get current(): K {
    return this._current;
  }

  get previous(): K | null {
    return this._previous;
  }

  /** Call once after construction so the initial state's enter() runs. */
  start(): void {
    this.states[this._current].enter?.(this.ctx, null);
    this.onChange?.(null, this._current);
  }

  transition(next: K): void {
    const prev = this._current;
    this.states[prev].exit?.(this.ctx, next);
    this._previous = prev;
    this._current = next;
    this.time = 0;
    this.states[next].enter?.(this.ctx, prev);
    this.onChange?.(prev, next);
  }

  update(dt: number): void {
    this.time += dt;
    this.states[this._current].update(this.ctx, dt);
  }
}
