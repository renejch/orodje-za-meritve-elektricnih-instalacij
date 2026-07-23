'use strict';

/* =========================================================
   IndexedDB layer
   ========================================================= */
const DB_NAME = 'meritveDB';
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const _db = e.target.result;
      if (!_db.objectStoreNames.contains('circuits')) {
        _db.createObjectStore('circuits', { keyPath: 'id', autoIncrement: true });
      }
      if (!_db.objectStoreNames.contains('meta')) {
        _db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function idbReq(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const Store = {
  async getAllCircuits() {
    const tx = db.transaction('circuits', 'readonly');
    const rows = await idbReq(tx.objectStore('circuits').getAll());
    return rows.sort((a, b) => a.id - b.id);
  },
  addCircuit(data) {
    const tx = db.transaction('circuits', 'readwrite');
    return idbReq(tx.objectStore('circuits').add(data));
  },
  updateCircuit(data) {
    const tx = db.transaction('circuits', 'readwrite');
    return idbReq(tx.objectStore('circuits').put(data));
  },
  deleteCircuit(id) {
    const tx = db.transaction('circuits', 'readwrite');
    return idbReq(tx.objectStore('circuits').delete(id));
  },
  clearCircuits() {
    const tx = db.transaction('circuits', 'readwrite');
    return idbReq(tx.objectStore('circuits').clear());
  },
  saveMeta(data) {
    const tx = db.transaction('meta', 'readwrite');
    return idbReq(tx.objectStore('meta').put({ key: 'header', ...data }));
  },
  loadMeta() {
    const tx = db.transaction('meta', 'readonly');
    return idbReq(tx.objectStore('meta').get('header'));
  },
};

/* =========================================================
   DOM refs
   ========================================================= */
const $ = (id) => document.getElementById(id);

const els = {
  metaObjekt: $('meta-objekt'),
  metaNaslov: $('meta-naslov'),
  metaDatum: $('meta-datum'),
  metaIzvajalec: $('meta-izvajalec'),
  metaStevilka: $('meta-stevilka'),

  form: $('circuit-form'),
  formTitle: $('form-title'),
  submitBtn: $('submit-btn'),
  cancelEdit: $('cancel-edit'),

  fNaziv: $('f-naziv'),
  fTip: $('f-tip'),
  fKarakteristika: $('f-karakteristika'),
  fIn: $('f-in'),
  fPrerez: $('f-prerez'),
  fIzolacija: $('f-izolacija'),
  fZanka: $('f-zanka'),
  fKontinuiteta: $('f-kontinuiteta'),
  fRcdIdn: $('f-rcdIdn'),
  fRcdCas: $('f-rcdCas'),
  fOpomba: $('f-opomba'),
  fFoto: $('f-foto'),

  photoPreview: $('photo-preview'),
  photoPreviewImg: $('photo-preview-img'),
  photoRemove: $('photo-remove'),

  tbody: $('circuit-tbody'),
  emptyState: $('empty-state'),
  circuitCount: $('circuit-count'),

  exportBtn: $('export-btn'),
  importFile: $('import-file'),
  clearAllBtn: $('clear-all-btn'),

  toast: $('toast'),
};

let editingId = null;
let currentPhoto = null; // data URL string or null

/* =========================================================
   Helpers
   ========================================================= */
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { els.toast.hidden = true; }, 2600);
}

function numOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n) {
  return n === null || n === undefined ? '—' : String(n);
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function slugify(text) {
  return (text || 'Porocilo')
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Porocilo';
}

/* =========================================================
   Rendering
   ========================================================= */
async function renderTable() {
  const circuits = await Store.getAllCircuits();
  els.circuitCount.textContent = circuits.length;
  els.emptyState.hidden = circuits.length !== 0;
  els.tbody.innerHTML = '';

  for (const c of circuits) {
    const tr = document.createElement('tr');

    const rcdText = (c.rcdIdn || c.rcdCas)
      ? `${c.rcdIdn ?? '—'} mA / ${c.rcdCas ?? '—'} ms`
      : '—';

    tr.innerHTML = `
      <td>${escapeHtml(c.naziv)}</td>
      <td>${escapeHtml(c.tip || '—')}${c.karakteristika ? ' ' + escapeHtml(c.karakteristika) : ''}</td>
      <td class="num">${fmtNum(c.in)}</td>
      <td class="num">${fmtNum(c.prerez)}</td>
      <td class="num">${fmtNum(c.izolacija)}</td>
      <td class="num">${fmtNum(c.zanka)}</td>
      <td class="num">${fmtNum(c.kontinuiteta)}</td>
      <td class="num">${rcdText}</td>
      <td class="note-cell">${escapeHtml(c.opomba || '')}</td>
      <td></td>
      <td class="row-actions">
        <button type="button" class="btn-icon" data-action="edit" data-id="${c.id}" aria-label="Uredi tokokrog">✏️</button>
        <button type="button" class="btn-icon" data-action="delete" data-id="${c.id}" aria-label="Izbriši tokokrog">🗑️</button>
      </td>
    `;

    const photoCell = tr.children[9];
    if (c.foto) {
      const img = document.createElement('img');
      img.src = c.foto;
      img.alt = `Fotografija — ${c.naziv}`;
      img.className = 'thumb';
      img.title = 'Klikni za povečavo';
      img.addEventListener('click', () => window.open(c.foto, '_blank'));
      photoCell.appendChild(img);
    } else {
      photoCell.innerHTML = '<span class="no-photo">—</span>';
    }

    els.tbody.appendChild(tr);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/* =========================================================
   Form handling
   ========================================================= */
function resetForm() {
  els.form.reset();
  editingId = null;
  currentPhoto = null;
  els.photoPreview.hidden = true;
  els.photoPreviewImg.src = '';
  els.fFoto.value = '';
  els.formTitle.textContent = 'Dodaj tokokrog';
  els.submitBtn.textContent = 'Dodaj tokokrog';
  els.cancelEdit.hidden = true;
}

function fillFormForEdit(c) {
  editingId = c.id;
  els.fNaziv.value = c.naziv || '';
  els.fTip.value = c.tip || 'Odklopnik';
  els.fKarakteristika.value = c.karakteristika || '';
  els.fIn.value = c.in ?? '';
  els.fPrerez.value = c.prerez ?? '';
  els.fIzolacija.value = c.izolacija ?? '';
  els.fZanka.value = c.zanka ?? '';
  els.fKontinuiteta.value = c.kontinuiteta ?? '';
  els.fRcdIdn.value = c.rcdIdn ?? '';
  els.fRcdCas.value = c.rcdCas ?? '';
  els.fOpomba.value = c.opomba || '';

  currentPhoto = c.foto || null;
  if (currentPhoto) {
    els.photoPreviewImg.src = currentPhoto;
    els.photoPreview.hidden = false;
  } else {
    els.photoPreview.hidden = true;
  }

  els.formTitle.textContent = `Urejanje: ${c.naziv}`;
  els.submitBtn.textContent = 'Shrani spremembe';
  els.cancelEdit.hidden = false;
  els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleSubmit(e) {
  e.preventDefault();

  if (!els.fNaziv.value.trim()) {
    els.fNaziv.focus();
    showToast('Naziv tokokroga je obvezen.');
    return;
  }

  const circuit = {
    naziv: els.fNaziv.value.trim(),
    tip: els.fTip.value,
    karakteristika: els.fKarakteristika.value,
    in: numOrNull(els.fIn.value),
    prerez: numOrNull(els.fPrerez.value),
    izolacija: numOrNull(els.fIzolacija.value),
    zanka: numOrNull(els.fZanka.value),
    kontinuiteta: numOrNull(els.fKontinuiteta.value),
    rcdIdn: numOrNull(els.fRcdIdn.value),
    rcdCas: numOrNull(els.fRcdCas.value),
    opomba: els.fOpomba.value.trim(),
    foto: currentPhoto,
  };

  if (editingId) {
    circuit.id = editingId;
    await Store.updateCircuit(circuit);
    showToast('Tokokrog posodobljen.');
  } else {
    await Store.addCircuit(circuit);
    showToast('Tokokrog dodan.');
  }

  resetForm();
  await renderTable();
}

async function handlePhotoInput(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    currentPhoto = await fileToDataURL(file);
    els.photoPreviewImg.src = currentPhoto;
    els.photoPreview.hidden = false;
  } catch {
    showToast('Fotografije ni bilo mogoče naložiti.');
  }
}

function handlePhotoRemove() {
  currentPhoto = null;
  els.fFoto.value = '';
  els.photoPreview.hidden = true;
  els.photoPreviewImg.src = '';
}

async function handleTableClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const circuits = await Store.getAllCircuits();
  const circuit = circuits.find((c) => c.id === id);
  if (!circuit) return;

  if (btn.dataset.action === 'edit') {
    fillFormForEdit(circuit);
  } else if (btn.dataset.action === 'delete') {
    if (confirm(`Izbrišem tokokrog "${circuit.naziv}"?`)) {
      await Store.deleteCircuit(id);
      if (editingId === id) resetForm();
      await renderTable();
      showToast('Tokokrog izbrisan.');
    }
  }
}

async function handleClearAll() {
  if (confirm('Izbrišem VSE tokokroge? Tega dejanja ni mogoče razveljaviti.')) {
    await Store.clearCircuits();
    resetForm();
    await renderTable();
    showToast('Vsi tokokrogi izbrisani.');
  }
}

/* =========================================================
   Meta (project header) handling
   ========================================================= */
function currentMeta() {
  return {
    objekt: els.metaObjekt.value.trim(),
    naslov: els.metaNaslov.value.trim(),
    datum: els.metaDatum.value,
    izvajalec: els.metaIzvajalec.value.trim(),
    stevilka: els.metaStevilka.value.trim(),
  };
}

async function persistMeta() {
  await Store.saveMeta(currentMeta());
}

function bindMetaAutoSave() {
  [els.metaObjekt, els.metaNaslov, els.metaDatum, els.metaIzvajalec, els.metaStevilka]
    .forEach((input) => input.addEventListener('change', persistMeta));
}

/* =========================================================
   Export to Excel (photo intentionally excluded)
   ========================================================= */
async function handleExport() {
  const circuits = await Store.getAllCircuits();
  if (circuits.length === 0) {
    showToast('Ni podatkov za izvoz.');
    return;
  }
  const meta = currentMeta();

  const headerSheetData = [
    ['Naziv objekta', meta.objekt],
    ['Naslov', meta.naslov],
    ['Datum meritve', meta.datum],
    ['Izvajalec meritev', meta.izvajalec],
    ['Številka poročila', meta.stevilka],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerSheetData);
  wsHeader['!cols'] = [{ wch: 20 }, { wch: 40 }];

  const circuitHeaders = [
    'Naziv tokokroga',
    'Tip zaščite',
    'Karakteristika',
    'Nazivni tok In (A)',
    'Prerez vodnika (mm²)',
    'Izolacijska upornost (MΩ)',
    'Impedanca zanke Zs (Ω)',
    'Kontinuiteta PE (Ω)',
    'RCD IΔn (mA)',
    'RCD čas izklopa (ms)',
    'Opomba',
  ];
  const circuitRows = circuits.map((c) => ([
    c.naziv,
    c.tip,
    c.karakteristika,
    c.in,
    c.prerez,
    c.izolacija,
    c.zanka,
    c.kontinuiteta,
    c.rcdIdn,
    c.rcdCas,
    c.opomba,
  ]));
  const wsCircuits = XLSX.utils.aoa_to_sheet([circuitHeaders, ...circuitRows]);
  wsCircuits['!cols'] = [
    { wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 30 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsHeader, 'Podatki o objektu');
  XLSX.utils.book_append_sheet(wb, wsCircuits, 'Tokokrogi');

  const filename = `Meritve_${slugify(meta.objekt)}_${meta.datum || 'brez-datuma'}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast('Excel datoteka izvožena (brez fotografij).');
}

/* =========================================================
   Import from Excel (reports generated by this same app)
   ========================================================= */
function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  return String(value);
}

async function handleImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;

  let wb;
  try {
    const buffer = await file.arrayBuffer();
    wb = XLSX.read(buffer, { type: 'array' });
  } catch {
    showToast('Datoteke ni bilo mogoče prebrati.');
    return;
  }

  const wsHeader = wb.Sheets['Podatki o objektu'];
  const wsCircuits = wb.Sheets['Tokokrogi'];
  if (!wsHeader || !wsCircuits) {
    showToast('Datoteka ni prepoznana kot poročilo te aplikacije.');
    return;
  }

  const headerRows = XLSX.utils.sheet_to_json(wsHeader, { header: 1 });
  const headerMap = {};
  headerRows.forEach((row) => {
    if (row && row[0]) headerMap[row[0]] = row[1];
  });

  const importedMeta = {
    objekt: headerMap['Naziv objekta'] || '',
    naslov: headerMap['Naslov'] || '',
    datum: normalizeDate(headerMap['Datum meritve']),
    izvajalec: headerMap['Izvajalec meritev'] || '',
    stevilka: headerMap['Številka poročila'] || '',
  };

  const circuitRows = XLSX.utils.sheet_to_json(wsCircuits, { header: 1 });
  const dataRows = circuitRows.slice(1);
  const importedCircuits = dataRows
    .filter((row) => row && row[0])
    .map((row) => ({
      naziv: row[0] != null ? String(row[0]) : '',
      tip: row[1] != null ? String(row[1]) : '',
      karakteristika: row[2] != null ? String(row[2]) : '',
      in: numOrNull(row[3]),
      prerez: numOrNull(row[4]),
      izolacija: numOrNull(row[5]),
      zanka: numOrNull(row[6]),
      kontinuiteta: numOrNull(row[7]),
      rcdIdn: numOrNull(row[8]),
      rcdCas: numOrNull(row[9]),
      opomba: row[10] != null ? String(row[10]) : '',
      foto: null,
    }));

  if (importedCircuits.length === 0) {
    showToast('V datoteki ni bilo najdenih tokokrogov.');
    return;
  }

  const existing = await Store.getAllCircuits();
  if (existing.length > 0 && !confirm(
    `Uvoz bo nadomestil obstoječih ${existing.length} tokokrogov in podatke o objektu s podatki iz datoteke. Nadaljujem?`
  )) {
    return;
  }

  await Store.clearCircuits();
  for (const c of importedCircuits) {
    await Store.addCircuit(c);
  }
  await Store.saveMeta(importedMeta);

  els.metaObjekt.value = importedMeta.objekt;
  els.metaNaslov.value = importedMeta.naslov;
  els.metaDatum.value = importedMeta.datum;
  els.metaIzvajalec.value = importedMeta.izvajalec;
  els.metaStevilka.value = importedMeta.stevilka;

  resetForm();
  await renderTable();
  showToast(`Uvoženih ${importedCircuits.length} tokokrogov. Fotografije v izvozu niso vsebovane, zato jih je treba po potrebi znova dodati.`);
}

/* =========================================================
   Init
   ========================================================= */
async function init() {
  db = await openDB();

  const meta = await Store.loadMeta();
  if (meta) {
    els.metaObjekt.value = meta.objekt || '';
    els.metaNaslov.value = meta.naslov || '';
    els.metaDatum.value = meta.datum || '';
    els.metaIzvajalec.value = meta.izvajalec || '';
    els.metaStevilka.value = meta.stevilka || '';
  }
  bindMetaAutoSave();

  els.form.addEventListener('submit', handleSubmit);
  els.cancelEdit.addEventListener('click', resetForm);
  els.fFoto.addEventListener('change', handlePhotoInput);
  els.photoRemove.addEventListener('click', handlePhotoRemove);
  els.tbody.addEventListener('click', handleTableClick);
  els.exportBtn.addEventListener('click', handleExport);
  els.importFile.addEventListener('change', handleImportFile);
  els.clearAllBtn.addEventListener('click', handleClearAll);

  await renderTable();
}

init().catch((err) => {
  console.error(err);
  showToast('Napaka pri zagonu aplikacije.');
});