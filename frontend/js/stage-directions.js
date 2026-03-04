/**
 * Stage directions — displays arc phase hints as centered overlay text.
 * Fades in on phase change, dims as phase progress approaches 1.0.
 */

export class StageDirections {
  constructor(el) {
    this.el = el;
    this._currentHint = null;
  }

  show(phase) {
    if (!this.el) return;
    const hint = phase.hint || phase.id;
    if (hint === this._currentHint) return;
    this._currentHint = hint;
    this.el.textContent = hint;
    this.el.classList.add('visible');
    this.el.style.opacity = '';
  }

  update(progress) {
    if (!this.el) return;
    if (progress > 0.8) {
      const fade = 1 - (progress - 0.8) / 0.2;
      this.el.style.opacity = Math.max(0, fade).toFixed(2);
    }
  }

  complete(text = 'complete') {
    if (!this.el) return;
    this._currentHint = text;
    this.el.textContent = text;
    this.el.classList.add('visible');
    this.el.style.opacity = '';
  }

  hide() {
    if (!this.el) return;
    this.el.classList.remove('visible');
    this._currentHint = null;
  }
}
