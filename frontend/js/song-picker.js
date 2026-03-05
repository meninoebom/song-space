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
    this._activeCard = null;
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
        card.addEventListener('click', () => this._select(song.slug, card));
        this.container.appendChild(card);
      }
    } catch (err) {
      this.container.innerHTML = `<p class="error">Failed to load songs: ${err.message}</p>`;
    }
  }

  async _select(slug, card) {
    // Toggle: clicking the active song stops it
    if (this._activeSlug === slug) {
      this._clearState();
      if (this.onSongStopped) this.onSongStopped();
      return;
    }

    // Highlight selected card
    this.container.querySelectorAll('.song-card').forEach(c => {
      c.classList.remove('selected', 'playing', 'loading');
    });
    card.classList.add('loading');
    this._activeSlug = slug;
    this._activeCard = card;

    try {
      const res = await fetch(`${this.apiUrl}/api/library/${slug}`);
      const metadata = await res.json();
      if (this._activeSlug !== slug) return; // cancelled during fetch
      card.classList.remove('loading');
      card.classList.add('playing');
      if (this.onSongSelected) this.onSongSelected(metadata);
    } catch (err) {
      console.error('Failed to load song:', err);
      card.classList.remove('loading');
    }
  }

  clearActive() {
    this._clearState();
  }

  _clearState() {
    this._activeSlug = null;
    if (this._activeCard) {
      this._activeCard.classList.remove('selected', 'playing', 'loading');
      this._activeCard = null;
    }
  }
}
