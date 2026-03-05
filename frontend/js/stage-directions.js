/**
 * Stage directions — simple intro/status overlay text.
 * Project-specific instructional UI, not a composer-facing concept.
 */

export class StageDirections {
  constructor(el) {
    this.el = el;
  }

  show(text) {
    if (!this.el) return;
    this.el.textContent = text;
    this.el.classList.add('visible');
    this.el.style.opacity = '';
  }

  hide() {
    if (!this.el) return;
    this.el.classList.remove('visible');
  }
}
