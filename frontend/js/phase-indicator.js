/**
 * PhaseIndicator — segmented progress bar showing arc phases.
 *
 * Each phase gets a proportional-width segment. Past segments are filled,
 * the current segment fills left-to-right, future segments are empty.
 */

export class PhaseIndicator {
  /**
   * @param {HTMLElement} containerEl — the #phase-indicator overlay
   * @param {Array} phases — arc.phases array (each has id, duration)
   */
  constructor(containerEl, phases) {
    this.container = containerEl;
    this.phases = phases;

    // Clear any previous content
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild);

    // Calculate proportional widths from durations
    // duration can be null (await phase) or [min, max] — use midpoint for proportional sizing
    const durations = phases.map(p => {
      if (p.duration === null) return 10; // small fixed size for await
      if (Array.isArray(p.duration)) return (p.duration[0] + p.duration[1]) / 2;
      return p.duration;
    });
    const totalDuration = durations.reduce((s, d) => s + d, 0);

    // Build DOM
    const bar = document.createElement('div');
    bar.className = 'phase-bar';

    const segments = document.createElement('div');
    segments.className = 'phase-segments';

    this.segmentEls = [];
    this.fillEls = [];
    this.nameEls = [];

    for (let i = 0; i < phases.length; i++) {
      const seg = document.createElement('div');
      seg.className = 'phase-segment future';
      seg.style.width = `${(durations[i] / totalDuration) * 100}%`;

      const fill = document.createElement('div');
      fill.className = 'phase-segment-fill';
      fill.style.width = '0%';
      seg.appendChild(fill);

      segments.appendChild(seg);
      this.segmentEls.push(seg);
      this.fillEls.push(fill);
    }

    bar.appendChild(segments);

    // Phase name label below the bar
    const name = document.createElement('div');
    name.className = 'phase-name';
    name.textContent = '';

    bar.appendChild(name);
    this.nameEl = name;

    this.container.appendChild(bar);
  }

  /**
   * @param {number} phaseIndex — current phase index
   * @param {number} progress — 0..1 within the current phase
   */
  update(phaseIndex, progress) {
    for (let i = 0; i < this.segmentEls.length; i++) {
      const seg = this.segmentEls[i];
      const fill = this.fillEls[i];

      if (i < phaseIndex) {
        seg.className = 'phase-segment past';
        fill.style.width = '100%';
      } else if (i === phaseIndex) {
        seg.className = 'phase-segment current';
        fill.style.width = `${Math.round(progress * 100)}%`;
      } else {
        seg.className = 'phase-segment future';
        fill.style.width = '0%';
      }
    }

    if (phaseIndex >= 0 && phaseIndex < this.phases.length) {
      this.nameEl.textContent = this.phases[phaseIndex].id.toUpperCase();
    }
  }

  show() {
    this.container.style.display = 'block';
  }

  hide() {
    this.container.style.display = 'none';
  }
}
