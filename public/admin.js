/**
 * GeoQuest — admin.js
 * Logica del pannello amministrativo
 */

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const els = {
  uploadForm:     $('uploadForm'),
  imageInput:     $('imageInput'),
  dropZone:       $('dropZone'),
  dropContent:    $('dropContent'),
  previewImg:     $('previewImg'),
  browseBtn:      $('browseBtn'),
  latInput:       $('latInput'),
  lngInput:       $('lngInput'),
  nameInput:      $('nameInput'),
  btnUpload:      $('btnUpload'),
  uploadProgress: $('uploadProgress'),
  progressFill:   $('progressFill'),
  uploadStatus:   $('uploadStatus'),
  locationGrid:   $('locationGrid'),
  locationCount:  $('locationCount'),
  toast:          $('toast'),
};

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'info', duration = 3500) {
  const t = els.toast;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = 'toast'; }, duration);
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────

function initDropZone() {
  const dz = els.dropZone;

  // Click sul dropzone → apri file picker
  dz.addEventListener('click', (e) => {
    if (e.target !== els.browseBtn) els.imageInput.click();
  });

  els.browseBtn.addEventListener('click', () => els.imageInput.click());

  // Drag & Drop
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });

  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));

  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });

  // Input change
  els.imageInput.addEventListener('change', () => {
    if (els.imageInput.files[0]) handleFileSelected(els.imageInput.files[0]);
  });
}

function handleFileSelected(file) {
  // Validazione lato client
  if (!file.type.startsWith('image/')) {
    showToast('Seleziona un file immagine valido', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('Il file supera i 10 MB', 'error');
    return;
  }

  // Preview
  const reader = new FileReader();
  reader.onload = (e) => {
    els.previewImg.src = e.target.result;
    els.previewImg.style.display = 'block';
    els.dropContent.style.display = 'none';
  };
  reader.readAsDataURL(file);

  // Trasferisci file all'input nascosto
  const dt = new DataTransfer();
  dt.items.add(file);
  els.imageInput.files = dt.files;
}

// ─── Mappa Admin ──────────────────────────────────────────────────────────────

function initAdminMap() {
  const map = L.map('adminMap', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  let marker = null;

  // Click → compila i campi
  map.on('click', (e) => {
    const { lat, lng } = e.latlng;

    // Aggiorna gli input
    els.latInput.value = lat.toFixed(6);
    els.lngInput.value = lng.toFixed(6);

    // Marker sulla mappa admin
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(map)
      .bindTooltip(`${lat.toFixed(4)}, ${lng.toFixed(4)}`, { permanent: true, direction: 'top' });
  });

  return map;
}

// ─── Upload Form ──────────────────────────────────────────────────────────────

function initUploadForm() {
  els.uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validazione
    if (!els.imageInput.files[0]) {
      showToast('Seleziona un\'immagine', 'error');
      return;
    }

    const lat = parseFloat(els.latInput.value);
    const lng = parseFloat(els.lngInput.value);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      showToast('Latitudine non valida (−90 … 90)', 'error');
      els.latInput.focus();
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      showToast('Longitudine non valida (−180 … 180)', 'error');
      els.lngInput.focus();
      return;
    }

    // Prepara form data
    const formData = new FormData();
    formData.append('image', els.imageInput.files[0]);
    formData.append('lat', lat);
    formData.append('lng', lng);
    formData.append('name', els.nameInput.value.trim());

    // Mostra progress
    els.btnUpload.disabled = true;
    els.uploadProgress.style.display = 'block';
    animateProgress();

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Errore upload');
      }

      // Successo
      els.progressFill.style.width = '100%';
      els.uploadStatus.textContent = '✅ Caricamento completato!';
      showToast('Immagine caricata con successo! 🎉', 'success');

      // Reset form dopo 1 secondo
      setTimeout(() => {
        els.uploadForm.reset();
        els.previewImg.style.display = 'none';
        els.dropContent.style.display = 'block';
        els.previewImg.src = '';
        els.uploadProgress.style.display = 'none';
        els.progressFill.style.width = '0%';
        els.uploadStatus.textContent = 'Caricamento…';
        els.btnUpload.disabled = false;

        // Ricarica lista
        loadLocations();
      }, 1200);

    } catch (err) {
      showToast(err.message, 'error');
      els.uploadProgress.style.display = 'none';
      els.btnUpload.disabled = false;
    }
  });
}

function animateProgress() {
  let w = 0;
  const fill = els.progressFill;
  const iv = setInterval(() => {
    w += Math.random() * 8;
    if (w >= 90) { clearInterval(iv); w = 90; }
    fill.style.width = w + '%';
  }, 200);
}

// ─── Lista Locations ──────────────────────────────────────────────────────────

async function loadLocations() {
  els.locationGrid.innerHTML = '<div class="list-loading">Caricamento…</div>';

  try {
    const res  = await fetch('/api/locations');
    const data = await res.json();

    if (!data.length) {
      els.locationGrid.innerHTML = '<div class="list-loading">Nessuna location. Carica la prima!</div>';
      els.locationCount.textContent = '0 immagini';
      return;
    }

    els.locationCount.textContent = `${data.length} immagin${data.length === 1 ? 'e' : 'i'}`;

    els.locationGrid.innerHTML = '';

    data.forEach(loc => {
      const imageUrl = loc.image_path.startsWith('http')
        ? loc.image_path
        : `/uploads/${loc.image_path}`;

      const card = document.createElement('div');
      card.className = 'loc-card';
      card.innerHTML = `
        <img src="${imageUrl}" alt="${loc.name || 'Location'}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 75%22><rect fill=%22%231e2430%22 width=%22100%22 height=%2275%22/><text fill=%22%235a6b82%22 x=%2250%22 y=%2242%22 text-anchor=%22middle%22 font-size=%2212%22>No img</text></svg>'"/>
        <button class="loc-card-delete" title="Elimina" data-id="${loc.id}">✕</button>
        <div class="loc-card-body">
          <div class="loc-card-name">${loc.name || `Location #${loc.id}`}</div>
          <div class="loc-card-coords">${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}</div>
        </div>
      `;

      // Delete button
      card.querySelector('.loc-card-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Eliminare "${loc.name || 'questa location'}"?`)) return;

        try {
          const r = await fetch(`/api/locations/${loc.id}`, { method: 'DELETE' });
          if (!r.ok) throw new Error();
          showToast('Location eliminata', 'success');
          loadLocations();
        } catch {
          showToast('Errore durante l\'eliminazione', 'error');
        }
      });

      els.locationGrid.appendChild(card);
    });

  } catch (err) {
    els.locationGrid.innerHTML = '<div class="list-loading">Errore di caricamento</div>';
    showToast('Errore nel caricare le location', 'error');
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

function init() {
  initDropZone();
  initAdminMap();
  initUploadForm();
  loadLocations();
}

init();
