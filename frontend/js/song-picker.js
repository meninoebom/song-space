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
    // Click playing song → stop
    if (this._activeSlug === slug) {
      this._clearPlaying();
      if (this.onSongStopped) this.onSongStopped();
      return;
    }

    // Highlight
    this._clearPlaying();
    card.classList.add('selected', 'playing');
    this._activeSlug = slug;

    try {
      const res = await fetch(`${this.apiUrl}/api/library/${slug}`);
      const metadata = await res.json();
      if (this.onSongSelected) this.onSongSelected(metadata);
    } catch (err) {
      console.error('Failed to load song:', err);
      this._clearPlaying();
    }
  }

  _clearPlaying() {
    this.container.querySelectorAll('.song-card').forEach(c => c.classList.remove('selected', 'playing'));
    this._activeSlug = null;
  }

  /** Called externally when playback ends (e.g. arc complete) */
  clearActive() {
    this._clearPlaying();
  }
}
