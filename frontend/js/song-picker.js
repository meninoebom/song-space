/**
 * Song picker — fetches catalog and renders song cards.
 * Supports toggle: click playing song to stop, click another to switch.
 */

export class SongPicker {
  constructor(container, apiUrl) {
    this.container = container;
    this.apiUrl = apiUrl;
    this.onSongSelected = null;  // callback(songMetadata)
    this.onSongStopped = null;   // callback()
    this.onError = null;         // callback(message) — echo a load failure to the status bar
    this._activeSlug = null;
    this._cards = new Map();     // slug → card element
    this._banner = null;         // inline error/retry banner element (per-song failures)
  }

  /** A small inline retry button. Stops propagation so it never toggles a card. */
  _retryButton(label, onRetry) {
    const btn = document.createElement('button');
    btn.className = 'retry-btn';
    btn.textContent = label;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onRetry(); });
    return btn;
  }

  _clearBanner() {
    this._banner?.remove();
    this._banner = null;
  }

  /** Prepend a dismissible error + retry above the catalog (per-song failures,
   *  which must not wipe the card list the way catalog/empty states do). */
  _showBanner(message, retryLabel, onRetry) {
    this._clearBanner();
    const banner = document.createElement('div');
    banner.className = 'picker-error';
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = message;
    banner.appendChild(p);
    banner.appendChild(this._retryButton(retryLabel, onRetry));
    this.container.prepend(banner);
    this._banner = banner;
  }

  async load() {
    this._clearBanner();
    this.container.innerHTML = '<p class="loading">Loading songs...</p>';

    try {
      const res = await fetch(`${this.apiUrl}/api/library`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const catalog = await res.json();

      if (catalog.length === 0) {
        this.container.innerHTML = '';
        const emptyEl = document.createElement('p');
        emptyEl.className = 'empty';
        emptyEl.textContent = 'No songs in library yet.';
        this.container.appendChild(emptyEl);
        this.container.appendChild(this._retryButton('Refresh', () => this.load()));
        return;
      }

      this.container.innerHTML = '';
      for (const song of catalog) {
        const card = document.createElement('div');
        card.className = 'song-card';

        const h3 = document.createElement('h3');
        h3.textContent = song.name;
        card.appendChild(h3);

        // User-facing: a one-line vibe. Falls back to nothing if absent.
        if (song.description) {
          const desc = document.createElement('p');
          desc.className = 'song-description';
          desc.textContent = song.description;
          card.appendChild(desc);
        }

        // Developer metadata (BPM, loop count, sections) \u2014 only visible with ?debug.
        const meta = document.createElement('div');
        meta.className = 'song-meta debug-only';
        const bpmSpan = document.createElement('span');
        bpmSpan.textContent = `${song.bpm} BPM`;
        const loopSpan = document.createElement('span');
        loopSpan.textContent = `${song.total_loops} loops`;
        meta.append(bpmSpan, loopSpan);
        card.appendChild(meta);

        const sections = document.createElement('div');
        sections.className = 'song-sections debug-only';
        sections.textContent = song.sections.join(' \u00B7 ');
        card.appendChild(sections);

        card.addEventListener('click', () => this._select(song.slug));
        this._cards.set(song.slug, card);
        this.container.appendChild(card);
      }
    } catch (err) {
      this.container.innerHTML = '';
      const errEl = document.createElement('p');
      errEl.className = 'error';
      errEl.textContent = `Failed to load songs: ${err.message}`;
      this.container.appendChild(errEl);
      this.container.appendChild(this._retryButton('Retry', () => this.load()));
    }
  }

  async _select(slug) {
    // Toggle: click active song to stop
    if (slug === this._activeSlug) {
      this.clearState();
      if (this.onSongStopped) this.onSongStopped();
      return;
    }

    this._clearBanner();
    this._activeSlug = slug;
    this._setCardState(slug, 'loading');

    try {
      const res = await fetch(`${this.apiUrl}/api/library/${slug}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Check if a newer selection happened while we were fetching
      if (slug !== this._activeSlug) return;
      const metadata = await res.json();
      if (slug !== this._activeSlug) return;
      if (this.onSongSelected) this.onSongSelected(metadata);
    } catch (err) {
      // Previously this failed silently (console.error + clearState). Now it
      // surfaces in the status bar AND leaves an inline retry above the catalog.
      console.error('Failed to load song:', err);
      if (slug !== this._activeSlug) return;
      this.clearState();
      const message = `Couldn't load that song (${err.message}).`;
      if (this.onError) this.onError(message);
      this._showBanner(message, 'Retry', () => this._select(slug));
    }
  }

  setPlaying(slug) {
    this._setCardState(slug, 'playing');
  }

  clearState() {
    this._activeSlug = null;
    for (const card of this._cards.values()) {
      card.classList.remove('selected', 'loading', 'playing');
    }
  }

  _setCardState(slug, state) {
    for (const [s, card] of this._cards) {
      card.classList.remove('selected', 'loading', 'playing');
      if (s === slug) card.classList.add(state);
    }
  }
}
