/**
 * GeoQuest — app.js
 * Logica del gioco principale
 */

// ─── Stato globale ────────────────────────────────────────────────────────────

const state = {
  currentImageId: null,
  userMarker:     null,
  realMarker:     null,
  guessLine:      null,
  userLat:        null,
  userLng:        null,
  bestScore:      null,   // null = no game finished yet
  gamesPlayed:    0,
  answered:       false,
  map:            null,
};

// ─── Elementi DOM ─────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const els = {
  loadingScreen: $('loadingScreen'),
  errorScreen:   $('errorScreen'),
  gameLayout:    $('gameLayout'),
  locationImg:   $('locationImg'),
  map:           null, // inizializzato dopo
  mapHint:       $('mapHint'),
  guessInfo:     $('guessInfo'),
  guessCoords:   $('guessCoords'),
  btnConfirm:    $('btnConfirm'),
  resultPanel:   $('resultPanel'),
  resultPlace:   $('resultPlace'),
  resultDist:    $('resultDist'),
  resultScore:   $('resultScore'),
  scoreCircle:   $('scoreCircle'),
  btnNext:       $('btnNext'),
  bestScore:     $('bestScore'),
  gamesPlayed:   $('gamesPlayed'),
  toast:         $('toast'),
};

// ─── Utils ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'info', duration = 3000) {
  const t = els.toast;
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => { t.className = 'toast'; }, duration);
}

function show(el) { el.style.display = ''; }
function hide(el) { el.style.display = 'none'; }

// ─── Inizializzazione Mappa ───────────────────────────────────────────────────

function initMap() {
  const map = L.map('map', {
    center: [20, 0],
    zoom:   2,
    minZoom: 2,
    maxZoom: 18,
    zoomControl: true,
  });

  // Tile layer OpenStreetMap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  state.map = map;

  // Click sulla mappa → posiziona marker utente
  map.on('click', (e) => {
    if (state.answered) return; // blocca dopo risposta

    const { lat, lng } = e.latlng;
    placeUserMarker(lat, lng);
  });

  return map;
}

// ─── Marker personalizzati ────────────────────────────────────────────────────

function createDivIcon(className) {
  return L.divIcon({
    className: '',
    html: `<div class="${className}"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

function placeUserMarker(lat, lng) {
  // Rimuovi vecchio marker
  if (state.userMarker) state.map.removeLayer(state.userMarker);

  state.userMarker = L.marker([lat, lng], {
    icon: createDivIcon('marker-user'),
    zIndexOffset: 10,
  })
  .addTo(state.map)
  .bindTooltip('La tua scelta', { permanent: false, direction: 'top' });

  // Aggiorna stato
  state.userLat = lat;
  state.userLng = lng;

  // Abilita bottone conferma
  els.btnConfirm.disabled = false;

  // Mostra coordinate
  show(els.guessInfo);
  els.guessCoords.textContent =
    `📍 ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;

  // Nascondi hint mappa
  els.mapHint.classList.add('hidden');
}

// ─── Carica immagine casuale ──────────────────────────────────────────────────

async function loadRandomImage() {
  // Reset stato round
  state.answered = false;
  state.userLat  = null;
  state.userLng  = null;

  // Pulisci mappa
  if (state.userMarker) { state.map.removeLayer(state.userMarker); state.userMarker = null; }
  if (state.realMarker) { state.map.removeLayer(state.realMarker); state.realMarker = null; }
  if (state.guessLine)  { state.map.removeLayer(state.guessLine);  state.guessLine  = null; }

  // Reset UI
  els.btnConfirm.disabled = true;
  hide(els.guessInfo);
  hide(els.resultPanel);
  els.mapHint.classList.remove('hidden');

  // Reset mappa alla vista mondo
  state.map.setView([20, 0], 2);

  try {
    const res = await fetch(`/api/random-image?exclude=${state.currentImageId || 0}`);
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();

    // Se il server non trova immagini con exclude, riprova senza per ciclare
    if (data.error) {
      const res2 = await fetch('/api/random-image?exclude=0');
      if (!res2.ok) throw new Error('Server error');
      const data2 = await res2.json();

      if (data2.error) {
        // Davvero nessuna immagine nel database
        hide(els.loadingScreen);
        show(els.errorScreen);
        return;
      }

      return loadImageData(data2);
    }

    loadImageData(data);

  } catch (err) {
    console.error(err);
    showToast('Errore di caricamento. Riprova.', 'error');
    hide(els.loadingScreen);
    show(els.errorScreen);
  }
}

function loadImageData(data) {
  state.currentImageId = data.id;

  // Carica immagine con fade
  const img = els.locationImg;
  img.style.opacity = '0';
  img.onload  = () => { img.style.transition = 'opacity .4s'; img.style.opacity = '1'; };
  img.onerror = () => { img.style.opacity = '1'; };
  img.src     = data.imageUrl;

  // Mostra game
  hide(els.loadingScreen);
  show(els.gameLayout);

  setTimeout(() => { state.map.invalidateSize(); }, 10);
}

// ─── Conferma risposta ────────────────────────────────────────────────────────

async function confirmGuess() {
  if (state.userLat === null || state.userLng === null) {
    showToast('Prima clicca sulla mappa per scegliere un punto!', 'error');
    return;
  }

  els.btnConfirm.disabled = true;
  els.btnConfirm.textContent = 'Calcolo in corso…';
  state.answered = true;

  try {
    const res = await fetch('/api/guess', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        imageId: state.currentImageId,
        userLat: state.userLat,
        userLng: state.userLng,
      }),
    });

    if (!res.ok) throw new Error('Server error');
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      els.btnConfirm.disabled = false;
      els.btnConfirm.textContent = '🎯 Conferma risposta';
      return;
    }

    // Mostra risultati sulla mappa
    showResultOnMap(data);

    // Mostra pannello risultato
    showResultPanel(data);

    // Aggiorna contatore partite e miglior punteggio
    state.gamesPlayed++;
    els.gamesPlayed.textContent = state.gamesPlayed;

    if (state.bestScore === null || data.score > state.bestScore) {
      state.bestScore = data.score;
      els.bestScore.textContent = state.bestScore.toLocaleString('it');
      if (state.gamesPlayed > 1) showToast('🏆 Nuovo record personale!', 'success', 4000);
    }

  } catch (err) {
    console.error(err);
    showToast('Errore durante la verifica. Riprova.', 'error');
    els.btnConfirm.disabled = false;
  } finally {
    els.btnConfirm.innerHTML = '<span class="btn-icon">🎯</span> Conferma risposta';
  }
}

// ─── Risultato sulla mappa ────────────────────────────────────────────────────

function showResultOnMap({ realLat, realLng, name }) {
  const map = state.map;

  // Marker posizione reale
  state.realMarker = L.marker([realLat, realLng], {
    icon: createDivIcon('marker-real'),
    zIndexOffset: 20,
  })
  .addTo(map)
  .bindPopup(`<strong>${name || 'Posizione reale'}</strong><br>${realLat.toFixed(4)}, ${realLng.toFixed(4)}`)
  .openPopup();

  // Linea tratteggiata tra i due punti
  state.guessLine = L.polyline(
    [[state.userLat, state.userLng], [realLat, realLng]],
    {
      color:     '#e8a045',
      weight:    2.5,
      opacity:   .85,
      dashArray: '6 4',
      className: 'guess-line',
    }
  ).addTo(map);

  // Adatta la vista per contenere entrambi i punti
  const bounds = L.latLngBounds(
    [state.userLat, state.userLng],
    [realLat, realLng]
  );
  map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
}

// ─── Pannello risultato ───────────────────────────────────────────────────────

function showResultPanel({ distanceKm, score, name }) {
  // Testo
  els.resultPlace.textContent  = name || 'Posizione sconosciuta';
  els.resultDist.textContent   = distanceKm.toLocaleString('it');
  els.resultScore.textContent  = score.toLocaleString('it');

  // Animazione ring SVG
  // circumference = 2π * r = 2π * 34 ≈ 213.6
  const circumference = 213.6;
  const fraction      = score / 5000;
  const offset        = circumference * (1 - fraction);

  // Triggera animazione dopo un frame
  requestAnimationFrame(() => {
    els.scoreCircle.style.strokeDashoffset = offset;

    // Colore ring in base al punteggio
    if (score >= 4000)      els.scoreCircle.style.stroke = '#4caf82';
    else if (score >= 2000) els.scoreCircle.style.stroke = '#e8a045';
    else                    els.scoreCircle.style.stroke = '#e05c5c';
  });

  show(els.resultPanel);

  // Messaggio motivazionale (solo se non è un nuovo record, per evitare toast doppi)
  if (state.bestScore === null || score <= state.bestScore) {
    if (score >= 4500)      showToast('🔥 Perfetto! Sei un geografo!', 'success');
    else if (score >= 3000) showToast('✅ Ottimo! Molto vicino!', 'success');
    else if (score >= 1000) showToast('👍 Niente male!');
    else                    showToast('🌍 Continua a esplorare!');
  }
}

// ─── Prossimo round ───────────────────────────────────────────────────────────

function nextRound() {
  // Resetta il ring
  els.scoreCircle.style.strokeDashoffset = '213.6';
  els.scoreCircle.style.stroke           = 'var(--accent)';

  loadRandomImage();
}

// ─── Event listeners ──────────────────────────────────────────────────────────

function bindEvents() {
  els.btnConfirm.addEventListener('click', confirmGuess);
  els.btnNext.addEventListener('click', nextRound);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

function init() {
  show(els.loadingScreen);
  hide(els.gameLayout);
  hide(els.errorScreen);

  // Piccolo delay per render DOM prima di init Leaflet
  setTimeout(() => {
    initMap();
    bindEvents();
    loadRandomImage();
  }, 100);
}

init();