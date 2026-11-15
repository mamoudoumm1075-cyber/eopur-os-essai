// EOPUR OS – démarrage, navigation, recherche globale
const APP = (() => {
  const { $, $$, esc } = UI;
  let page = 'tableau', params = {};
  // ----- mémorisation du dossier de travail (IndexedDB)
  const idb = () => new Promise((ok, ko) => { const r = indexedDB.open('eopur_os_pc', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  async function kv(k, v) { const d = await idb(); return new Promise((ok, ko) => { const t = d.transaction('k', v === undefined ? 'readonly' : 'readwrite'), s = t.objectStore('k'); const r = v === undefined ? s.get(k) : s.put(v, k); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); }
  async function demarrer(h) {
    try {
      const r = await DB.ouvrir(h); $('#accueil').remove();
      $('#pied').innerHTML = 'Base : ' + esc(h.name) + '/eopur_os.sqlite<br>Poste : ' + esc(DB.appareil);
      remplirChantiers(); compteurs(); aller(location.hash.slice(1) || 'tableau');
      if (r.neuve) UI.toast('Nouvelle base créée dans « ' + h.name + ' »');
    } catch (e) { console.error(e); accueil('Ouverture impossible : ' + e.message); }
  }
  function accueil(msg, h) {
    $('#acc_txt').innerHTML = msg; const z = $('#acc_btn'); z.innerHTML = '';
    if (h) { const b = document.createElement('button'); b.className = 'b'; b.textContent = 'Ouvrir « ' + h.name + ' »'; b.onclick = async () => { if (await h.requestPermission({ mode: 'readwrite' }) === 'granted') demarrer(h); }; z.appendChild(b); }
    const c = document.createElement('button'); c.className = 'b ' + (h ? 'g' : ''); c.textContent = h ? 'Choisir un autre dossier' : 'Choisir le dossier de la base';
    c.onclick = async () => { try { const d = await showDirectoryPicker({ id: 'eopur_os', mode: 'readwrite' }); await kv('dossier', d); demarrer(d); } catch (e) { if (e.name !== 'AbortError') UI.toast(e.message, 'ko'); } };
    z.appendChild(c);
  }
  async function init() {
    if (!window.showDirectoryPicker) return accueil('Ce navigateur ne permet pas d\'enregistrer la base sur le PC.<br>Ouvrez EOPUR OS dans <b>Google Chrome</b> ou <b>Microsoft Edge</b>.');
    let h = null; try { h = await kv('dossier'); } catch (e) { }
    if (h && await h.queryPermission({ mode: 'readwrite' }) === 'granted') return demarrer(h);
    accueil(h ? 'Autorisez l\'accès au dossier de la base pour continuer.' : 'Choisissez le dossier du PC où sera conservée la base EOPUR OS<br>(par exemple <b>Documents\\EOPUR_OS_BASE</b> – pas dans OneDrive).', h);
  }
  // ----- navigation
  function aller(p, prm) {
    const [nom, arg] = String(p).split(':'); page = PAGES[nom] ? nom : 'tableau'; params = prm || (arg ? { id: arg } : {});
    $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.p === page));
    $('#titre').textContent = PAGES[page].titre; history.replaceState(null, '', '#' + page + (params.id ? ':' + params.id : ''));
    rafraichir(); $('#nav').classList.remove('ouvert');
  }
  async function rafraichir() { const z = $('#zone'); try { z.innerHTML = ''; await PAGES[page].rendu(z, params); } catch (e) { console.error(e); z.innerHTML = '<div class="ko-l err-rendu">Erreur d\'affichage : ' + esc(e.message) + '</div>'; } compteurs(); }
  // ----- chantier de travail (filtre global)
  const actif = () => $('#chantier_actif').value || '';
  function remplirChantiers() {
    const s = $('#chantier_actif'), v = s.value || localStorage.getItem('eo_chantier') || '';
    const L = DB.q("SELECT id,reference,nom FROM chantiers WHERE etat<>'Archivé' ORDER BY nom");
    s.innerHTML = '<option value="">Tous les chantiers</option>' + L.map(c => `<option value="${esc(c.id)}">${esc((c.reference ? c.reference + ' – ' : '') + c.nom)}</option>`).join('');
    s.value = L.some(c => c.id === v) ? v : '';
  }
  function compteurs() {
    if (!DB.ouvert) return; const k = M.indicateurs(), m = (id, n) => { const e = $(id); e.hidden = !n; e.textContent = n; };
    m('#nb_ano', k.anomaliesUrgentes); m('#nb_ech', k.echeancesDepassees); m('#nb_syn', k.conflits + k.paquetsAttente);
  }
  // ----- recherche globale
  function rechercher(t) {
    t = t.trim(); if (t.length < 2) return; const L = '%' + t + '%', r = [];
    for (const c of DB.q('SELECT id,nom,reference,adresse,ville,client FROM chantiers WHERE nom LIKE ? OR reference LIKE ? OR adresse LIKE ? OR client LIKE ? OR ville LIKE ?', [L, L, L, L, L])) r.push(['Chantier', (c.reference ? c.reference + ' – ' : '') + c.nom, [c.adresse, c.ville, c.client].filter(Boolean).join(' · '), 'chantiers:' + c.id]);
    for (const l of DB.q('SELECT l.id,l.numero,l.adresse,l.batiment,l.statut,l.observation,c.nom ch FROM logements l JOIN chantiers c ON c.id=l.id_chantier WHERE l.numero LIKE ? OR l.adresse LIKE ? OR l.reference LIKE ? OR l.observation LIKE ? OR l.occupant LIKE ? LIMIT 60', [L, L, L, L, L])) r.push(['Logement', l.adresse + ' n° ' + l.numero + (l.batiment ? ' (bât. ' + l.batiment + ')' : ''), l.ch + ' · ' + l.statut + (l.observation ? ' · ' + l.observation : ''), 'logements:' + l.id]);
    for (const a of DB.q('SELECT a.id,a.description,a.statut,c.nom ch FROM anomalies a JOIN chantiers c ON c.id=a.id_chantier WHERE a.description LIKE ? OR a.action LIKE ? LIMIT 40', [L, L])) r.push(['Anomalie', a.description.slice(0, 90), a.ch + ' · ' + a.statut, 'anomalies:' + a.id]);
    for (const d of DB.q('SELECT d.id,d.titre,d.nom_fichier,d.categorie,d.texte,c.nom ch FROM documents d LEFT JOIN chantiers c ON c.id=d.id_chantier WHERE d.titre LIKE ? OR d.nom_fichier LIKE ? OR d.texte LIKE ? OR d.notes LIKE ? LIMIT 60', [L, L, L, L])) { let ex = ''; if (d.texte) { const i = d.texte.toLowerCase().indexOf(t.toLowerCase()); if (i >= 0) ex = '… ' + d.texte.slice(Math.max(0, i - 50), i + 80).replace(/\s+/g, ' ') + ' …'; } r.push(['Document', d.titre || d.nom_fichier, (d.ch || 'Sans chantier') + ' · ' + (d.categorie || '') + (ex ? ' · ' + ex : ''), 'documents:' + d.id]); }
    for (const i of DB.q('SELECT i.id,i.date,i.type,i.intervenant,c.nom ch FROM interventions i JOIN chantiers c ON c.id=i.id_chantier WHERE i.intervenant LIKE ? OR i.observations LIKE ? OR i.date LIKE ? LIMIT 30', [L, L, L])) r.push(['Intervention', i.type + ' du ' + UI.dateFr(i.date), i.ch + (i.intervenant ? ' · ' + i.intervenant : ''), 'interventions:' + i.id]);
    for (const e of DB.q('SELECT e.id,e.designation,e.id_etude FROM equipements e WHERE e.designation LIKE ? OR e.reference LIKE ? OR e.fabricant LIKE ? LIMIT 30', [L, L, L])) r.push(['Équipement', e.designation, '', 'etudes:' + e.id_etude]);
    const rx = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), hl = s => esc(s).replace(rx, '<mark>$1</mark>');
    const m = UI.fenetre('Recherche : « ' + t + ' » – ' + r.length + ' résultat(s)', r.length ? `<table class="t">${r.map(x => `<tr class="cl" data-v="${esc(x[3])}"><td>${UI.pastille(x[0])}</td><td><b>${hl(x[1])}</b><div class="s">${hl(x[2])}</div></td></tr>`).join('')}</table>` : '<p class="s">Aucun résultat.</p>', true);
    $$('tr[data-v]', m).forEach(tr => tr.onclick = () => { m.remove(); aller(tr.dataset.v); });
  }
  window.addEventListener('DOMContentLoaded', () => {
    $$('#nav a').forEach(a => a.onclick = () => aller(a.dataset.p));
    $('#menu').onclick = () => $('#nav').classList.toggle('ouvert');
    $('#chantier_actif').onchange = e => { try { localStorage.setItem('eo_chantier', e.target.value); } catch (x) { } rafraichir(); };
    $('#recherche').onkeydown = e => { if (e.key === 'Enter') rechercher(e.target.value); };
    window.addEventListener('beforeunload', e => { if (DB.ouvert && DB.enAttente && DB.enAttente()) { e.preventDefault(); e.returnValue = ''; } });
    init();
  });
  return { aller, rafraichir, actif, remplirChantiers, compteurs, get page() { return page; } };
})();
