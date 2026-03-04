/**
 * Readings meter — DOM-based bars showing current reading values and active state.
 */

export class ReadingsMeter {
  constructor(container) {
    this.container = container;
    this.bars = {};
  }

  render(readings) {
    if (!this.container) return;

    for (const r of readings) {
      let bar = this.bars[r.id];
      if (!bar) {
        bar = this._createBar(r.id);
        this.bars[r.id] = bar;
      }
      bar.fill.style.width = `${(r.value * 100).toFixed(1)}%`;
      bar.el.classList.toggle('active', r.active);
    }
  }

  _createBar(id) {
    const el = document.createElement('div');
    el.className = 'meter-bar';

    const label = document.createElement('div');
    label.className = 'meter-label';
    label.textContent = id;

    const track = document.createElement('div');
    track.className = 'meter-track';

    const fill = document.createElement('div');
    fill.className = 'meter-fill';
    fill.style.width = '0%';

    track.appendChild(fill);
    el.appendChild(label);
    el.appendChild(track);
    this.container.appendChild(el);

    return { el, fill };
  }
}
