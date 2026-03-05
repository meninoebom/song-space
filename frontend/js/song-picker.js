/**
 * Song picker — fetches catalog and renders song cards.
 */

export class SongPicker {
  constructor(container, apiUrl) {
    this.container = container;
    this.apiUrl = apiUrl;
    this.onSongSelected = null; // callback(songMetadata)
    this.onSongStopped = null;  // callback()
    this._activeSlug = null;
    this._loading = false;
    this._cards = {};
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
        card.addEventListener('click', () => this._toggle(song.slug, card));
        this._cards[song.slug] = card;
        this.container.appendChild(card);
      }
    } catch (err) {
      this.container.innerHTML = `<p class="error">Failed to load songs: ${err.message}</p>`;
    }
  }

  async _toggle(slug, card) {
    // Ignore clicks while loading
    if (this._loading) return;

    // Click playing song → stop
    if (this._activeSlug === slug) {
      if (this.onSongStopped) this.onSongStopped();
      this._clearAll();
      return;
    }

    // Show loading state
    this._clearAll();
    card.classList.add('selected', 'loading');
    this._activeSlug = slug;
    this._loading = true;

    try {
      const res = await fetch(`${this.apiUrl}/api/library/${slug}`);
      const metadata = await res.json();
      // Switch from loading → playing
      card.classList.remove('loading');
      card.classList.add('playing');
      this._loading = false;
      if (this.onSongSelected) this.onSongSelected(metadata);
    } catch (err) {
      console.error('Failed to load song:', err);
      this._clearAll();
      this._loading = false;
    }
  }

  _clearAll() {
    this.container.querySelectorAll('.song-card').forEach(c =>
      c.classList.remove('selected', 'playing', 'loading')
    );
    this._activeSlug = null;
  }

  /** Called externally when playback ends naturally (arc complete) */
  clearActive() {
    this._clearAll();
  }
}
