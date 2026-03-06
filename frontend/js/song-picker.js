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
    this._activeSlug = null;
    this._cards = new Map();     // slug → card element
  }

  async load() {
    this.container.innerHTML = '<p class="loading">Loading songs...</p>';

    try {
      const res = await fetch(`${this.apiUrl}/api/library`);
      const catalog = await res.json();

      if (catalog.length === 0) {
        this.container.innerHTML = '<p class="empty">No songs in library yet.</p>';
        return;
      }

      this.container.innerHTML = '';
      for (const song of catalog) {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.innerHTML = `
          <h3>${song.name}</h3>
          <div class="song-meta">
            <span>${song.bpm} BPM</span>
            <span>${song.total_loops} loops</span>
          </div>
          <div class="song-sections">${song.sections.join(' · ')}</div>
        `;
        card.addEventListener('click', () => this._select(song.slug));
        this._cards.set(song.slug, card);
        this.container.appendChild(card);
      }
    } catch (err) {
      this.container.innerHTML = `<p class="error">Failed to load songs: ${err.message}</p>`;
    }
  }

  async _select(slug) {
    // Toggle: click active song to stop
    if (slug === this._activeSlug) {
      this.clearState();
      if (this.onSongStopped) this.onSongStopped();
      return;
    }

    this._activeSlug = slug;
    this._setCardState(slug, 'loading');

    try {
      const res = await fetch(`${this.apiUrl}/api/library/${slug}`);
      // Check if a newer selection happened while we were fetching
      if (slug !== this._activeSlug) return;
      const metadata = await res.json();
      if (slug !== this._activeSlug) return;
      if (this.onSongSelected) this.onSongSelected(metadata);
    } catch (err) {
      console.error('Failed to load song:', err);
      if (slug === this._activeSlug) this.clearState();
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
