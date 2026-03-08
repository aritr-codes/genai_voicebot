/**
 * Timer — countdown timer with pause/resume support.
 * ES module, no dependencies.
 */
export class Timer {
  constructor() {
    this._intervalId = null;
    this._remaining = 0;
    this._total = 0;
    this._paused = false;
    this._running = false;
    this._tickCallbacks = [];
    this._expireCallbacks = [];
  }

  get isRunning() {
    return this._running;
  }

  get isPaused() {
    return this._paused;
  }

  get remaining() {
    return this._remaining;
  }

  onTick(callback) {
    this._tickCallbacks.push(callback);
  }

  onExpire(callback) {
    this._expireCallbacks.push(callback);
  }

  start(totalSeconds) {
    this.stop();
    this._total = totalSeconds;
    this._remaining = totalSeconds;
    this._paused = false;
    this._running = true;

    this._notifyTick();

    this._intervalId = setInterval(() => {
      if (this._paused) return;

      this._remaining--;
      this._notifyTick();

      if (this._remaining <= 0) {
        this._running = false;
        clearInterval(this._intervalId);
        this._intervalId = null;
        for (const cb of this._expireCallbacks) {
          cb();
        }
      }
    }, 1000);
  }

  pause() {
    if (this._running && !this._paused) {
      this._paused = true;
    }
  }

  resume() {
    if (this._running && this._paused) {
      this._paused = false;
    }
  }

  stop() {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._running = false;
    this._paused = false;
    this._remaining = 0;
    this._total = 0;
  }

  _notifyTick() {
    const info = {
      remaining: this._remaining,
      total: this._total,
      percent: this._total > 0 ? (this._remaining / this._total) * 100 : 0,
    };
    for (const cb of this._tickCallbacks) {
      cb(info);
    }
  }
}
