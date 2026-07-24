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
  expressModeToggle: $('express-mode-toggle'),
  metaToggle: $('meta-toggle'),
  metaFields: $('meta-fields'),
  metaObjekt: $('meta-objekt'),
  metaNaslov: $('meta-naslov'),
  metaDatum: $('meta-datum'),
  metaIzvajalec: $('meta-izvajalec'),
  metaStevilka: $('meta-stevilka'),

  form: $('circuit-form'),
  formTitle: $('form-title'),
  submitBtn: $('submit-btn'),
  cancelEdit: $('cancel-edit'),

  fRazdelilnik: $('f-razdelilnik'),
  fOznaka: $('f-oznaka'),
  fNaziv: $('f-naziv'),
  fFazno: $('f-fazno'),
  fVodniki: $('f-vodniki'),
  fPrerez: $('f-prerez'),
  fGlavnaIzenacitev: $('f-glavna-izenacitev'),
  fDodatnaIzenacitev: $('f-dodatna-izenacitev'),
  fIzolacija: $('f-izolacija'),
  fKarakteristika: $('f-karakteristika'),
  fIn: $('f-in'),
  fRcdCas: $('f-rcdCas'),
  fZanka: $('f-zanka'),
  fZankaL: $('f-zanka-l'),
  fRcdIn: $('f-rcd-in'),
  fRcdIdn: $('f-rcdIdn'),
  fRcdId: $('f-rcd-id'),
  fRcdTd1: $('f-rcd-td1'),
  fRcdTd5: $('f-rcd-td5'),
  fRcdUc: $('f-rcd-uc'),
  fNeustrezno: $('f-neustrezno'),
  fOpomba: $('f-opomba'),
  fFoto: $('f-foto'),

  photoPreview: $('photo-preview'),

  tbody: $('circuit-tbody'),
  emptyState: $('empty-state'),
  circuitCount: $('circuit-count'),

  exportBtn: $('export-btn'),
  importFile: $('import-file'),
  clearAllBtn: $('clear-all-btn'),

  toast: $('toast'),
};

let editingId = null;
let currentPhotos = []; // array of data URL strings

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

function formatKarakteristika(c) {
  if (!c.karakteristika) return '';
  return (c.fazno === '3f' ? '3x' : '') + c.karakteristika;
}

function stripPhasePrefix(value) {
  return typeof value === 'string' ? value.replace(/^3x/i, '') : value;
}

function getPhotos(c) {
  if (Array.isArray(c.fotos)) return c.fotos;
  return c.foto ? [c.foto] : [];
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

    tr.innerHTML = `
      <td><span class="status-dot ${c.neustrezno ? 'status-bad' : 'status-ok'}" title="${c.neustrezno ? 'Ne ustreza' : 'Skladno'}"></span></td>
      <td>${escapeHtml(c.razdelilnik || '—')}</td>
      <td>${escapeHtml(c.oznaka || '—')}</td>
      <td>${escapeHtml(c.naziv)}</td>
      <td>${escapeHtml(c.fazno || '—')}</td>
      <td class="num">${fmtNum(c.vodniki)}</td>
      <td class="num">${fmtNum(c.prerez)}</td>
      <td class="num">${fmtNum(c.glavnaIzenacitev)}</td>
      <td class="num">${fmtNum(c.dodatnaIzenacitev)}</td>
      <td class="num">${fmtNum(c.izolacija)}</td>
      <td>${escapeHtml(formatKarakteristika(c) || '—')}</td>
      <td class="num">${fmtNum(c.in)}</td>
      <td class="num">${fmtNum(c.rcdCas)}</td>
      <td class="num">${fmtNum(c.zanka)}</td>
      <td class="num">${fmtNum(c.zankaL)}</td>
      <td class="num">${fmtNum(c.rcdIn)}</td>
      <td class="num">${fmtNum(c.rcdIdn)}</td>
      <td class="num">${fmtNum(c.rcdId)}</td>
      <td class="num">${fmtNum(c.rcdTd1)}</td>
      <td class="num">${fmtNum(c.rcdTd5)}</td>
      <td class="num">${fmtNum(c.rcdUc)}</td>
      <td class="note-cell">${escapeHtml(c.opomba || '')}</td>
      <td></td>
      <td class="row-actions">
        <button type="button" class="btn-icon" data-action="edit" data-id="${c.id}" aria-label="Uredi tokokrog">✏️</button>
        <button type="button" class="btn-icon" data-action="delete" data-id="${c.id}" aria-label="Izbriši tokokrog">🗑️</button>
      </td>
    `;

    const photoCell = tr.children[22];
    const photos = getPhotos(c);
    if (photos.length) {
      photoCell.classList.add('photo-cell');
      photos.forEach((src, i) => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = `Fotografija ${i + 1} — ${c.naziv}`;
        img.className = 'thumb';
        img.title = 'Klikni za povečavo';
        img.addEventListener('click', () => window.open(src, '_blank'));
        photoCell.appendChild(img);
      });
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
  currentPhotos = [];
  renderPhotoPreview();
  els.fFoto.value = '';
  els.formTitle.textContent = 'Dodaj tokokrog';
  els.submitBtn.textContent = 'Dodaj tokokrog';
  els.cancelEdit.hidden = true;
}

function renderPhotoPreview() {
  els.photoPreview.innerHTML = '';
  els.photoPreview.hidden = currentPhotos.length === 0;
  currentPhotos.forEach((src, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.innerHTML = `
      <img src="${src}" alt="Fotografija tokokroga ${index + 1}">
      <button type="button" class="photo-thumb-remove" data-index="${index}" aria-label="Odstrani fotografijo">✕</button>
    `;
    els.photoPreview.appendChild(thumb);
  });
}

function fillFormForEdit(c) {
  editingId = c.id;
  els.fRazdelilnik.value = c.razdelilnik || '';
  els.fOznaka.value = c.oznaka || '';
  els.fNaziv.value = c.naziv || '';
  els.fFazno.value = c.fazno || '1f';
  els.fVodniki.value = c.vodniki ?? '';
  els.fPrerez.value = c.prerez ?? '';
  els.fGlavnaIzenacitev.value = c.glavnaIzenacitev ?? '';
  els.fDodatnaIzenacitev.value = c.dodatnaIzenacitev ?? '';
  els.fIzolacija.value = c.izolacija ?? '';
  els.fKarakteristika.value = c.karakteristika || '';
  els.fIn.value = c.in ?? '';
  els.fRcdCas.value = c.rcdCas ?? '';
  els.fZanka.value = c.zanka ?? '';
  els.fZankaL.value = c.zankaL ?? '';
  els.fRcdIn.value = c.rcdIn ?? '';
  els.fRcdIdn.value = c.rcdIdn ?? '';
  els.fRcdId.value = c.rcdId ?? '';
  els.fRcdTd1.value = c.rcdTd1 ?? '';
  els.fRcdTd5.value = c.rcdTd5 ?? '';
  els.fRcdUc.value = c.rcdUc ?? '';
  els.fNeustrezno.checked = !!c.neustrezno;
  els.fOpomba.value = c.opomba || '';

  currentPhotos = getPhotos(c).slice();
  renderPhotoPreview();

  els.formTitle.textContent = `Urejanje: ${c.oznaka ? c.oznaka + ' – ' : ''}${c.naziv}`;
  els.submitBtn.textContent = 'Shrani spremembe';
  els.cancelEdit.hidden = false;
  els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleSubmit(e) {
  e.preventDefault();

  if (!els.fOznaka.value.trim()) {
    els.fOznaka.focus();
    showToast('Oznaka tokokroga je obvezna.');
    return;
  }

  if (!els.fNaziv.value.trim()) {
    els.fNaziv.focus();
    showToast('Naziv tokokroga je obvezen.');
    return;
  }

  const circuit = {
    razdelilnik: els.fRazdelilnik.value.trim(),
    oznaka: els.fOznaka.value.trim(),
    naziv: els.fNaziv.value.trim(),
    fazno: els.fFazno.value,
    vodniki: numOrNull(els.fVodniki.value),
    prerez: numOrNull(els.fPrerez.value),
    glavnaIzenacitev: numOrNull(els.fGlavnaIzenacitev.value),
    dodatnaIzenacitev: numOrNull(els.fDodatnaIzenacitev.value),
    izolacija: numOrNull(els.fIzolacija.value),
    karakteristika: els.fKarakteristika.value,
    in: numOrNull(els.fIn.value),
    rcdCas: numOrNull(els.fRcdCas.value),
    zanka: numOrNull(els.fZanka.value),
    zankaL: numOrNull(els.fZankaL.value),
    rcdIn: numOrNull(els.fRcdIn.value),
    rcdIdn: numOrNull(els.fRcdIdn.value),
    rcdId: numOrNull(els.fRcdId.value),
    rcdTd1: numOrNull(els.fRcdTd1.value),
    rcdTd5: numOrNull(els.fRcdTd5.value),
    rcdUc: numOrNull(els.fRcdUc.value),
    neustrezno: els.fNeustrezno.checked,
    opomba: els.fOpomba.value.trim(),
    fotos: currentPhotos.slice(),
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
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;
  try {
    const dataUrls = await Promise.all(files.map(fileToDataURL));
    currentPhotos.push(...dataUrls);
    renderPhotoPreview();
  } catch {
    showToast('Fotografije ni bilo mogoče naložiti.');
  }
}

function handlePhotoPreviewClick(e) {
  const btn = e.target.closest('button[data-index]');
  if (!btn) return;
  currentPhotos.splice(Number(btn.dataset.index), 1);
  renderPhotoPreview();
}

function handleKarakteristikaChange() {
  const val = els.fKarakteristika.value;
  if (val === 'gG') {
    els.fRcdCas.value = 5;
  } else if (val === 'C') {
    els.fRcdCas.value = 0.4;
  }
}

function setMetaCollapsed(collapsed) {
  els.metaFields.hidden = collapsed;
  els.metaToggle.textContent = collapsed ? 'Prikaži' : 'Skrij';
  els.metaToggle.setAttribute('aria-expanded', String(!collapsed));
  localStorage.setItem('meta-collapsed', collapsed ? '1' : '0');
}

function bindMetaToggle() {
  setMetaCollapsed(localStorage.getItem('meta-collapsed') === '1');
  els.metaToggle.addEventListener('click', () => setMetaCollapsed(!els.metaFields.hidden));
}

function setExpressMode(enabled) {
  document.body.classList.toggle('express-mode', enabled);
  els.expressModeToggle.checked = enabled;
  localStorage.setItem('express-mode', enabled ? '1' : '0');
}

function bindExpressMode() {
  setExpressMode(localStorage.getItem('express-mode') === '1');
  els.expressModeToggle.addEventListener('change', () => setExpressMode(els.expressModeToggle.checked));
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

const META_DEFAULT_TEXT = 'Ni podatka';

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function metaWithDefaults(meta) {
  return {
    objekt: meta.objekt || META_DEFAULT_TEXT,
    naslov: meta.naslov || META_DEFAULT_TEXT,
    datum: meta.datum || todayDateString(),
    izvajalec: meta.izvajalec || META_DEFAULT_TEXT,
    stevilka: meta.stevilka || META_DEFAULT_TEXT,
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
const EXPORT_FONT = { name: 'Calibri', sz: 8 };

function applySheetFont(ws, font) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      cell.s = { ...(cell.s || {}), font: { ...(cell.s && cell.s.font), ...font } };
    }
  }
}

const META_SHEET_NAME = 'Podatki o objektu';
const UNASSIGNED_BOX_LABEL = 'Brez razdelilnika';

const CIRCUIT_HEADERS = [
  'Razdelilnik',
  'Oznaka tokokroga',
  'Naziv tokokroga',
  'Tip tokokroga (1f/3f)',
  'Število vodnikov',
  'Prerez vodnika (mm²)',
  'Glavna izenačevalna povezava (Ω)',
  'Dodatna izenačevalna povezava (Ω)',
  'Izolacijska upornost (MΩ)',
  'Karakteristika',
  'Nazivni tok In (A)',
  'Čas izklopa (s)',
  'Impedanca zanke Zs (Ω)',
  'Impedanca zanke Zl (Ω)',
  'Nazivni tok naprave RCD In (A)',
  'RCD IΔn (mA)',
  'Izmerjeni izklopni tok Id (mA)',
  'Čas izklopa td (1×IΔn) (s)',
  'Čas izklopa td (5×IΔn) (s)',
  'Dotikalna napetost Uc (V)',
  'Opomba',
];

const CIRCUIT_COLS = [
  { wch: 18 }, { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 12 },
  { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 12 },
  { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
  { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 30 },
];

function circuitToRow(c) {
  return [
    c.razdelilnik,
    c.oznaka,
    c.naziv,
    c.fazno,
    c.vodniki,
    c.prerez,
    c.glavnaIzenacitev,
    c.dodatnaIzenacitev,
    c.izolacija,
    formatKarakteristika(c),
    c.in,
    c.rcdCas,
    c.zanka,
    c.zankaL,
    c.rcdIn,
    c.rcdIdn,
    c.rcdId,
    c.rcdTd1,
    c.rcdTd5,
    c.rcdUc,
    c.opomba,
  ];
}

function groupByBox(circuits) {
  const groups = new Map();
  for (const c of circuits) {
    const key = (c.razdelilnik || '').trim() || UNASSIGNED_BOX_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return groups;
}

const NON_COMPLIANT_FILL = { patternType: 'solid', fgColor: { rgb: 'FFC7CE' } };

function applyRowFill(ws, rowIndex, fill) {
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c });
    const cell = ws[addr];
    if (!cell) continue;
    cell.s = { ...(cell.s || {}), fill };
  }
}

function isRowFlagged(ws, rowIndex) {
  // On read, SheetJS flattens fill info directly onto cell.s (cell.s.fgColor),
  // unlike the write-side shape (cell.s.fill.fgColor) used when building the export.
  const cell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })];
  return !!(cell && cell.s && cell.s.fgColor
    && cell.s.fgColor.rgb === NON_COMPLIANT_FILL.fgColor.rgb);
}

function excelSafeSheetName(name, usedNames) {
  const cleaned = (name || 'List').replace(/[:\\/?*[\]]/g, ' ').trim() || 'List';
  let base = cleaned.slice(0, 31);
  let candidate = base;
  let i = 2;
  while (usedNames.has(candidate)) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    i += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

async function handleExport() {
  const circuits = await Store.getAllCircuits();
  if (circuits.length === 0) {
    showToast('Ni podatkov za izvoz.');
    return;
  }
  const meta = metaWithDefaults(currentMeta());

  const headerSheetData = [
    ['Naziv objekta', meta.objekt],
    ['Naslov', meta.naslov],
    ['Datum meritve', meta.datum],
    ['Izvajalec meritev', meta.izvajalec],
    ['Številka poročila', meta.stevilka],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerSheetData);
  wsHeader['!cols'] = [{ wch: 20 }, { wch: 40 }];
  applySheetFont(wsHeader, EXPORT_FONT);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsHeader, META_SHEET_NAME);

  const usedNames = new Set([META_SHEET_NAME]);
  for (const [boxName, boxCircuits] of groupByBox(circuits)) {
    const rows = boxCircuits.map(circuitToRow);
    const ws = XLSX.utils.aoa_to_sheet([CIRCUIT_HEADERS, ...rows], { sheetStubs: true });
    ws['!cols'] = CIRCUIT_COLS;
    boxCircuits.forEach((c, i) => {
      if (c.neustrezno) applyRowFill(ws, i + 1, NON_COMPLIANT_FILL);
    });
    applySheetFont(ws, EXPORT_FONT);
    XLSX.utils.book_append_sheet(wb, ws, excelSafeSheetName(boxName, usedNames));
  }

  const filename = `Meritve_${slugify(meta.objekt)}_${meta.datum}.xlsx`;
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
    wb = XLSX.read(buffer, { type: 'array', cellStyles: true });
  } catch {
    showToast('Datoteke ni bilo mogoče prebrati.');
    return;
  }

  const wsHeader = wb.Sheets[META_SHEET_NAME];
  const boxSheetNames = wb.SheetNames.filter((name) => name !== META_SHEET_NAME);
  if (!wsHeader || boxSheetNames.length === 0) {
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

  const importedCircuits = [];
  for (const sheetName of boxSheetNames) {
    const ws = wb.Sheets[sheetName];
    const dataRows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1);
    dataRows.forEach((row, i) => {
      if (!row || !row[2]) return;
      const razdelilnikCol = row[0] != null ? String(row[0]).trim() : '';
      importedCircuits.push({
        neustrezno: isRowFlagged(ws, i + 1),
        razdelilnik: razdelilnikCol || (sheetName === UNASSIGNED_BOX_LABEL ? '' : sheetName),
        oznaka: row[1] != null ? String(row[1]) : '',
        naziv: row[2] != null ? String(row[2]) : '',
        fazno: row[3] != null ? String(row[3]) : '',
        vodniki: numOrNull(row[4]),
        prerez: numOrNull(row[5]),
        glavnaIzenacitev: numOrNull(row[6]),
        dodatnaIzenacitev: numOrNull(row[7]),
        izolacija: numOrNull(row[8]),
        karakteristika: row[9] != null ? stripPhasePrefix(String(row[9])) : '',
        in: numOrNull(row[10]),
        rcdCas: numOrNull(row[11]),
        zanka: numOrNull(row[12]),
        zankaL: numOrNull(row[13]),
        rcdIn: numOrNull(row[14]),
        rcdIdn: numOrNull(row[15]),
        rcdId: numOrNull(row[16]),
        rcdTd1: numOrNull(row[17]),
        rcdTd5: numOrNull(row[18]),
        rcdUc: numOrNull(row[19]),
        opomba: row[20] != null ? String(row[20]) : '',
        fotos: [],
      });
    });
  }

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
  if (!els.metaDatum.value) {
    els.metaDatum.value = todayDateString();
  }
  bindMetaAutoSave();
  bindMetaToggle();
  bindExpressMode();

  els.form.addEventListener('submit', handleSubmit);
  els.cancelEdit.addEventListener('click', resetForm);
  els.fFoto.addEventListener('change', handlePhotoInput);
  els.photoPreview.addEventListener('click', handlePhotoPreviewClick);
  els.fKarakteristika.addEventListener('change', handleKarakteristikaChange);
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