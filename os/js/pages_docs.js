// EOPUR OS – pages documentaires : centre documentaire, modèles, rapports de visite, avis de passage, DOE, assistant documentaire
const PD = (() => {
  const { $, $$, esc, dateFr, pastille, formulaire, confirmer, fenetre, tableau, action, toast } = UI, q = DB.q, un = DB.un;
  const CATS = ['Marché / contrat', 'CCTP / DCE', 'Plans', 'Avis techniques', 'Fiches techniques', 'Offres fournisseurs', 'Comptes rendus', 'Rapports de visite', 'Avis de passage', 'Suivi logements', 'Listes de logements', 'Études techniques', 'Listings', 'Demandes de prix', 'PV / réception', 'DOE', 'Photos', 'Courriers', 'Divers'];
  const taille = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
  // ================= CENTRE DOCUMENTAIRE
  PAGES.documents = { titre: 'Centre documentaire', rendu(z, p) {
    const o = sessionStorage.getItem('eo_od') || 'docs';
    P.onglets(z, [['docs', 'Documents'], ['modeles', 'Modèles EOPUR']], o, x => { sessionStorage.setItem('eo_od', x); APP.rafraichir(); });
    if (o === 'modeles') return pageModeles(z);
    listeDocuments(z, APP.actif()); if (p.id) ficheDoc(p.id);
  } };
  function importer(idc, categorie) {
    return new Promise(res => {
      formulaire('Importer des documents', [{ k: 'id_chantier', l: 'Chantier', t: 'select', o: P.chOpts() }, { k: 'categorie', l: 'Catégorie', t: 'select', o: CATS, vide: false }, { k: 'fichiers', l: 'Fichiers (PDF, Word, Excel, images)', t: 'file', plein: 1 }], { id_chantier: idc, categorie: categorie || 'Divers' }, { intro: 'Une copie est conservée dans la base ; vos fichiers d\'origine ne sont jamais modifiés. Les doublons exacts sont refusés ; un fichier de même nom devient une nouvelle version.' }).then(() => res());
      // le champ fichier est lu directement (multiple)
      const inp = $('.modal input[type=file]'); if (!inp) return; inp.multiple = true; inp.accept = '.pdf,.docx,.doc,.xlsx,.xlsm,.xls,.csv,.txt,.jpg,.jpeg,.png,.heic,.webp';
      const f = inp.closest('form'); f.onsubmit = e => { e.preventDefault(); const files = [...inp.files], idch = f.elements.id_chantier.value, cat = f.elements.categorie.value; if (!files.length) { toast('Choisissez au moins un fichier', 'ko'); return; } f.closest('.modal').remove();
        action(async () => { const r = { ajouté: 0, version: 0, doublon: 0, refusé: 0 }; for (const x of files) { const s = await DOCS.importerFichier(x, { id_chantier: idch, categorie: cat }); r[s.statut]++; } toast(`${r.ajouté} ajouté(s), ${r.version} nouvelle(s) version(s), ${r.doublon} doublon(s) refusé(s)${r.refusé ? ', ' + r.refusé + ' format(s) refusé(s)' : ''}`); APP.rafraichir(); res(); }); };
    });
  }
  function listeDocuments(z, idc) {
    const fc = sessionStorage.getItem('eo_fdc') || '', fs = sessionStorage.getItem('eo_fds') || '';
    const cc = P.carte(z, 'Documents' + (idc ? ' – ' + esc(P.nomCh(idc)) : ''), `<select id="fdc"><option value="">Toutes catégories</option>${CATS.map(c => `<option ${c === fc ? 'selected' : ''}>${c}</option>`).join('')}</select><select id="fds"><option value="">Tous statuts</option>${['reçu', 'brouillon', 'validé'].map(c => `<option ${c === fs ? 'selected' : ''}>${c}</option>`).join('')}</select><button class="b" id="imp">Importer</button>`);
    const w = ['1=1'], pr = []; if (idc) { w.push('d.id_chantier=?'); pr.push(idc); } if (fc) { w.push('d.categorie=?'); pr.push(fc); } if (fs) { w.push('d.statut=?'); pr.push(fs); }
    const L = q('SELECT d.*,c.nom ch,(SELECT MAX(version) FROM documents x WHERE x.id_famille=d.id_famille) vmax FROM documents d LEFT JOIN chantiers c ON c.id=d.id_chantier WHERE ' + w.join(' AND ') + ' ORDER BY d.ajoute_le DESC', pr);
    tableau(cc, L, [{ k: 'titre', l: 'Titre', f: r => '<b>' + esc(r.titre) + '</b><div class="s">' + esc(r.nom_fichier) + '</div>' }, ...(idc ? [] : [{ k: 'ch', l: 'Chantier' }]), { k: 'categorie', l: 'Catégorie' }, { k: 'ext', l: 'Type', f: r => esc(r.ext.toUpperCase()) },
      { k: 'version', l: 'Version', f: r => 'v' + r.version + (r.version < r.vmax ? ' <span class="pa orange">remplacée</span>' : r.vmax > 1 ? ' <span class="pa vert">dernière</span>' : '') }, { k: 'statut', l: 'Statut', f: r => pastille(r.statut) }, { k: 'origine', l: 'Origine' }, { k: 'taille', l: 'Taille', f: r => taille(r.taille) }, { k: 'ajoute_le', l: 'Ajouté le', f: r => dateFr(r.ajoute_le) }, { k: 'x', l: 'Texte', f: r => r.texte ? '<span class="pa vert">indexé</span>' : '<span class="s">—</span>' }],
      { clic: ficheDoc, vide: 'Aucun document. Cliquez sur « Importer » ou glissez des fichiers ici.' });
    $('#fdc', cc.parentNode).onchange = e => { sessionStorage.setItem('eo_fdc', e.target.value); APP.rafraichir(); };
    $('#fds', cc.parentNode).onchange = e => { sessionStorage.setItem('eo_fds', e.target.value); APP.rafraichir(); };
    P.bouton(cc.parentNode, '#imp', () => importer(idc, fc));
    // glisser-déposer
    const zone = cc.parentNode; zone.ondragover = e => { e.preventDefault(); zone.style.outline = '2px dashed var(--accent)'; }; zone.ondragleave = () => zone.style.outline = '';
    zone.ondrop = e => { e.preventDefault(); zone.style.outline = ''; const files = [...e.dataTransfer.files]; if (!files.length) return; action(async () => { let n = 0; for (const f of files) { const s = await DOCS.importerFichier(f, { id_chantier: idc, categorie: fc || 'Divers' }); if (s.statut !== 'doublon' && s.statut !== 'refusé') n++; } toast(n + ' document(s) importé(s)'); APP.rafraichir(); }); };
  }
  function ficheDoc(idd) {
    const d = q('SELECT d.*,c.nom ch FROM documents d LEFT JOIN chantiers c ON c.id=d.id_chantier WHERE d.id=?', [idd])[0]; if (!d) return;
    const V = q('SELECT * FROM documents WHERE id_famille=? ORDER BY version DESC', [d.id_famille]);
    const m = fenetre(d.titre, `<div class="ligne" style="margin-bottom:10px">${pastille(d.statut)}<span class="s">v${d.version} · ${esc(d.ext.toUpperCase())} · ${taille(d.taille)} · empreinte ${d.sha256.slice(0, 12)}…</span><span style="margin-left:auto" class="ligne"><button class="b g p" id="tl">Ouvrir / télécharger</button>${d.statut === 'brouillon' ? '<button class="b p" id="va">Valider</button>' : ''}${V.length > 1 ? '<button class="b g p" id="de">Détacher des versions</button>' : ''}<button class="b g p" id="mo">Modifier la fiche</button></span></div>
      <dl class="fiche"><dt>Chantier</dt><dd>${esc(d.ch || 'Sans chantier')}</dd><dt>Catégorie</dt><dd>${esc(d.categorie)}</dd><dt>Fichier d'origine</dt><dd>${esc(d.nom_fichier)}</dd><dt>Origine</dt><dd>${esc(d.origine)}</dd><dt>Ajouté le</dt><dd>${dateFr(d.ajoute_le)}</dd><dt>Notes</dt><dd>${esc(d.notes) || '—'}</dd><dt>Copie dans la base</dt><dd class="s">${esc(d.chemin)}</dd></dl>
      ${V.length > 1 ? '<h4>Versions</h4><table class="t">' + V.map(v => `<tr class="cl" data-v="${v.id}"><td>v${v.version}</td><td>${esc(v.nom_fichier)}</td><td>${dateFr(v.ajoute_le)}</td><td>${pastille(v.statut)}</td></tr>`).join('') + '</table>' : ''}
      <h4>Aperçu</h4><div id="ap" class="s">${d.texte ? '<pre style="white-space:pre-wrap;max-height:300px;overflow:auto;font:12px/1.4 Consolas,monospace;background:#f8f9fb;padding:10px;border-radius:6px">' + esc(d.texte.slice(0, 6000)) + (d.texte.length > 6000 ? '\n…' : '') + '</pre>' : 'Pas de texte extrait (image ou PDF scanné).'}</div>`, true);
    if (/^(jpg|jpeg|png|webp|gif)$/.test(d.ext)) DB.lireFichier(d.chemin).then(f => { $('#ap', m).innerHTML = `<img src="${URL.createObjectURL(f)}" style="max-width:100%;max-height:420px">`; }).catch(() => { });
    P.bouton(m, '#tl', () => action(() => DOCS.telechargerDoc(idd)));
    P.bouton(m, '#va', async () => { await action(() => DOCS.valider(idd), 'Document validé'); m.remove(); APP.rafraichir(); });
    P.bouton(m, '#de', async () => { if (await confirmer('Ce document ne sera plus considéré comme une version des autres. Continuer ?')) { await action(() => DB.tx(() => { DB.run('UPDATE documents SET id_famille=id,version=1 WHERE id=?', [idd]); DB.hist('document', idd, d.id_chantier, 'détaché de ses versions'); })); m.remove(); APP.rafraichir(); } });
    P.bouton(m, '#mo', async () => { const v = await formulaire('Fiche du document', [{ k: 'titre', l: 'Titre', req: 1 }, { k: 'id_chantier', l: 'Chantier', t: 'select', o: P.chOpts() }, { k: 'categorie', l: 'Catégorie', t: 'select', o: CATS, vide: false }, { k: 'notes', l: 'Notes', t: 'textarea' }], d); if (!v) return; await action(() => DB.tx(() => { DB.run('UPDATE documents SET titre=?,id_chantier=?,categorie=?,notes=? WHERE id=?', [v.titre, v.id_chantier || null, v.categorie, v.notes, idd]); DB.hist('document', idd, v.id_chantier || d.id_chantier, 'fiche du document modifiée'); }), 'Fiche modifiée'); m.remove(); APP.rafraichir(); });
    $$('[data-v]', m).forEach(tr => tr.onclick = () => { m.remove(); ficheDoc(tr.dataset.v); });
  }
  function pageModeles(z) {
    const cc = P.carte(z, 'Modèles EOPUR (Word)');
    cc.innerHTML = `<p>Importez vos trames Word EOPUR. Une copie est conservée ; le fichier d'origine n'est jamais modifié. Placez dans le modèle les balises à remplir, par exemple <code>{{chantier}}</code>, <code>{{adresse}}</code>, <code>{{date}}</code> ; un paragraphe ne contenant que <code>{{#logements}}</code> reçoit le tableau des logements. Sans modèle, EOPUR OS produit un document sobre à l'en-tête EOPUR.</p>
      <table class="t"><tr><th>Document</th><th>Modèle actif</th><th>Balises disponibles</th><th></th></tr>${DOCS.TYPES_MODELES.map(([t, l]) => { const m = q('SELECT * FROM modeles WHERE type=? AND actif=1', [t])[0]; return `<tr><td><b>${l}</b></td><td>${m ? esc(m.nom) + '<div class="s">ajouté le ' + dateFr(m.ajoute_le) + '</div>' : '<span class="s">aucun – document standard</span>'}</td><td class="s">${esc(BALISES[t] || '')}</td><td class="ligne"><button class="b g p" data-t="${t}">${m ? 'Remplacer' : 'Importer'}</button>${m ? `<button class="b g p" data-x="${t}">Retirer</button>` : ''}</td></tr>`; }).join('')}</table>`;
    $$('[data-t]', cc).forEach(b => b.onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.docx,.dotx'; inp.onchange = () => action(async () => { const bal = await DOCS.ajouterModele(b.dataset.t, inp.files[0]); toast('Modèle enregistré' + (bal.length ? ' – balises trouvées : ' + bal.join(', ') : ' – aucune balise {{…}} trouvée')); APP.rafraichir(); }); inp.click(); });
    $$('[data-x]', cc).forEach(b => b.onclick = async () => { await action(() => DB.tx(() => DB.run('UPDATE modeles SET actif=0 WHERE type=?', [b.dataset.x]))); APP.rafraichir(); });
  }
  const BALISES = {
    rapport: 'chantier, reference, adresse, client, date, objet, redacteur, participants, constats, reserves, suites, nb_logements, nb_realises, nb_absents, nb_a_repasser ; #passages, #anomalies',
    avis: 'chantier, adresse, batiment, cage, etage, numero, date, horaires, objet, message, contact, telephone_contact',
    avis_groupe: 'chantier, adresse, batiment, cage, date, horaires, objet, message, contact, telephone_contact ; #logements',
    demande_prix: 'chantier, reference, fournisseur, date, objet, delai, contact, notes ; #lignes', etude: 'chantier, reference, adresse, titre, systeme, type_installation, date ; #equipements', doe: 'chantier, reference, adresse, client, date ; #pieces'
  };
  // production Word : modèle si présent, sinon document standard
  async function produireWord(type, titre, valeurs, blocs, tableaux, opts) {
    const mo = await DOCS.modeleActif(type);
    if (mo) return DOCX.remplirModele(mo.buf, valeurs, tableaux);
    return DOCX.generer(titre, blocs, opts);
  }
  // ================= RAPPORTS DE VISITE
  PAGES.rapports = { titre: 'Rapports de visite', rendu(z) {
    const c = APP.actif();
    const cc = P.carte(z, 'Rapports de visite' + (c ? ' – ' + esc(P.nomCh(c)) : ''), '<button class="b" id="nv">Nouveau rapport</button>');
    tableau(cc, q("SELECT d.*,c.nom ch FROM documents d LEFT JOIN chantiers c ON c.id=d.id_chantier WHERE d.categorie='Rapports de visite'" + (c ? ' AND d.id_chantier=?' : '') + ' ORDER BY d.ajoute_le DESC', c ? [c] : []), [{ k: 'titre', l: 'Rapport' }, { k: 'ch', l: 'Chantier' }, { k: 'statut', l: 'Statut', f: r => pastille(r.statut) }, { k: 'ajoute_le', l: 'Date', f: r => dateFr(r.ajoute_le) }], { clic: ficheDoc, vide: 'Aucun rapport.' });
    P.bouton(cc.parentNode, '#nv', () => { const x = P.exigerCh(); if (x) rapportPour(x); });
  } };
  async function rapportPour(idc, iid) {
    const c = q('SELECT * FROM chantiers WHERE id=?', [idc])[0];
    const IT = q("SELECT * FROM interventions WHERE id_chantier=? AND statut<>'Annulée' ORDER BY date DESC", [idc]);
    const v = await formulaire('Rapport de visite – ' + c.nom, [{ k: 'id_intervention', l: 'Intervention liée', t: 'select', o: IT.map(i => [i.id, dateFr(i.date) + ' – ' + i.type + (i.intervenant ? ' – ' + i.intervenant : '')]) }, { k: 'date', l: 'Date de la visite', t: 'date', req: 1 }, { k: 'objet', l: 'Objet', req: 1 }, { k: 'redacteur', l: 'Rédacteur' }, { k: 'participants', l: 'Participants', t: 'textarea', rows: 2 },
      { k: 'constats', l: 'Constats', t: 'textarea', rows: 5, aide: 'Uniquement ce qui a été constaté' }, { k: 'reserves', l: 'Réserves / points bloquants', t: 'textarea' }, { k: 'suites', l: 'Suites à donner', t: 'textarea' }, { k: 'avecAnomalies', l: 'Inclure les anomalies ouvertes du chantier', t: 'check' }],
      { id_intervention: iid || '', date: iid ? (IT.find(i => i.id === iid) || {}).date : DB.today(), objet: iid ? 'Compte rendu de passage' : 'Visite de chantier', avecAnomalies: 1 }, { large: true, ok: 'Prévisualiser' });
    if (!v) return;
    const PS = v.id_intervention ? q('SELECT p.*,l.adresse,l.batiment,l.cage,l.etage,l.numero FROM passages p JOIN logements l ON l.id=p.id_logement WHERE p.id_intervention=? ORDER BY l.adresse,CAST(l.numero AS INTEGER)', [v.id_intervention]) : [];
    const AN = v.avecAnomalies ? q("SELECT a.*,l.adresse,l.numero FROM anomalies a LEFT JOIN logements l ON l.id=a.id_logement WHERE a.id_chantier=? AND a.statut NOT IN ('Résolue','Clôturée') ORDER BY a.date", [idc]) : [];
    const n = r => PS.filter(p => p.resultat === r).length;
    const tP = { entetes: ['Logement', 'Résultat', 'Observation', 'Actions'], lignes: PS.map(p => [P.libLog(p), p.resultat || 'non saisi', p.observation, p.actions]), largeurs: [30, 18, 34, 18] };
    const tA = { entetes: ['Date', 'Logement', 'Description', 'Priorité', 'Statut', 'Action'], lignes: AN.map(a => [dateFr(a.date), a.numero ? a.adresse + ' n° ' + a.numero : 'général', a.description, a.priorite, a.statut, a.action]), largeurs: [11, 16, 35, 10, 11, 17] };
    const val = { chantier: c.nom, reference: c.reference, adresse: [c.adresse, c.ville].filter(Boolean).join(', '), client: c.client, date: dateFr(v.date), objet: v.objet, redacteur: v.redacteur, participants: v.participants, constats: v.constats, reserves: v.reserves, suites: v.suites, nb_logements: PS.length, nb_realises: n('Intervention réalisée'), nb_absents: n('Absent'), nb_a_repasser: PS.filter(p => ['Absent', 'Inaccessible', 'À repasser'].includes(p.resultat)).length };
    const blocs = [{ champs: [['Chantier', (c.reference ? c.reference + ' – ' : '') + c.nom], ['Adresse', val.adresse], ['Client', c.client], ['Date de visite', val.date], ['Objet', v.objet], ['Rédacteur', v.redacteur], ['Participants', v.participants]] },
      { h1: 'Constats' }, { p: v.constats || 'Aucun constat saisi.' }];
    if (PS.length) blocs.push({ h1: 'Résultats des passages' }, { p: `${PS.length} logement(s) : ${val.nb_realises} réalisé(s), ${val.nb_absents} absent(s), ${n('Inaccessible')} inaccessible(s), ${n("Refus d'accès")} refus, ${n('Problème technique')} problème(s) technique(s), ${n('À repasser')} à repasser, ${PS.filter(p => !p.resultat).length} non saisi(s).` }, { table: tP });
    if (AN.length) blocs.push({ h1: 'Anomalies ouvertes' }, { table: tA });
    blocs.push({ h1: 'Réserves et points bloquants' }, { p: v.reserves || 'Aucune.' }, { h1: 'Suites à donner' }, { p: v.suites || 'Aucune.' });
    const alertes = []; if (!v.constats) alertes.push('aucun constat saisi'); if (PS.some(p => !p.resultat)) alertes.push(PS.filter(p => !p.resultat).length + ' passage(s) sans résultat saisi'); if (!v.redacteur) alertes.push('rédacteur non renseigné');
    const mo = q("SELECT nom FROM modeles WHERE type='rapport' AND actif=1")[0];
    const titre = 'Rapport de visite du ' + val.date;
    DOCS.circuit({ titre: 'Rapport de visite – contrôle avant validation', id_chantier: idc, categorie: 'Rapports de visite', alertes, titreDoc: titre + ' – ' + c.nom,
      apercu: (mo ? `<div class="info-l">Modèle EOPUR utilisé : ${esc(mo.nom)}</div>` : '<div class="info-l">Aucun modèle importé : document standard EOPUR.</div>') + DOCX.apercu(titre, blocs),
      produire: async () => ({ blob: await produireWord('rapport', titre, val, blocs, { passages: tP, anomalies: tA }, { sousTitre: c.nom }), nom: 'Rapport de visite ' + UI.nomFichier(c.nom) + ' ' + v.date + '.docx' }) });
  }
  // ================= AVIS DE PASSAGE
  PAGES.avis = { titre: 'Avis de passage', rendu(z) {
    const c = APP.actif();
    const cc = P.carte(z, 'Avis de passage' + (c ? ' – ' + esc(P.nomCh(c)) : ''), '<button class="b" id="nv">Préparer des avis</button>');
    cc.innerHTML = '<p class="s">Les avis se préparent depuis une intervention planifiée (bouton « Avis de passage ») ou ici à partir d\'une sélection de logements. Les logements « À planifier » passent à « À prévenir » une fois l\'avis validé.</p><div id="l"></div>';
    tableau($('#l', cc), q("SELECT d.*,c.nom ch FROM documents d LEFT JOIN chantiers c ON c.id=d.id_chantier WHERE d.categorie='Avis de passage'" + (c ? ' AND d.id_chantier=?' : '') + ' ORDER BY d.ajoute_le DESC', c ? [c] : []), [{ k: 'titre', l: 'Avis' }, { k: 'ch', l: 'Chantier' }, { k: 'statut', l: 'Statut', f: r => pastille(r.statut) }, { k: 'ajoute_le', l: 'Date', f: r => dateFr(r.ajoute_le) }], { clic: ficheDoc, vide: 'Aucun avis produit.' });
    P.bouton(cc.parentNode, '#nv', () => { const x = P.exigerCh(); if (x) avisPour(x, []); });
  } };
  async function avisPour(idc, logements, iid) {
    const c = q('SELECT * FROM chantiers WHERE id=?', [idc])[0], it = iid ? q('SELECT * FROM interventions WHERE id=?', [iid])[0] : null;
    const L = q("SELECT * FROM logements WHERE id_chantier=? AND statut<>'Terminé' ORDER BY adresse,batiment,cage,CAST(numero AS INTEGER),numero", [idc]);
    const resp = q("SELECT * FROM interlocuteurs WHERE id_chantier=? ORDER BY nom", [idc]);
    const v = await formulaire('Avis de passage – ' + c.nom, [{ k: 'mode', l: 'Présentation', t: 'select', o: [['individuel', 'Un avis par logement (une page chacun)'], ['groupe', 'Avis groupé par entrée (adresse / bâtiment / cage)']], vide: false },
      { k: 'date', l: 'Date du passage', t: 'date', req: 1 }, { k: 'horaires', l: 'Créneau horaire', req: 1, aide: 'ex. entre 8 h 30 et 12 h' }, { k: 'objet', l: 'Objet', req: 1 },
      { k: 'message', l: 'Message aux occupants', t: 'textarea', rows: 4 }, { k: 'contact', l: 'Contact EOPUR' }, { k: 'telephone_contact', l: 'Téléphone du contact' },
      { k: 'logements', l: 'Logements', t: 'multi', o: L.map(l => [l.id, P.libLog(l) + ' – ' + l.statut]) }],
      { mode: 'groupe', date: it ? it.date : '', horaires: it && it.heure_debut ? 'entre ' + it.heure_debut.replace(':', ' h ') + (it.heure_fin ? ' et ' + it.heure_fin.replace(':', ' h ') : '') : '', objet: 'Intervention sur la ventilation de votre logement (VMC)', message: 'Nous vous remercions de bien vouloir être présent ou de laisser l\'accès à votre logement. Les bouches d\'extraction devront être accessibles (cuisine, salle de bains, WC).', logements: logements, contact: (resp[0] || {}).nom || '' }, { large: true, ok: 'Prévisualiser' });
    if (!v) return; const S = L.filter(l => v.logements.includes(l.id)); if (!S.length) return toast('Aucun logement sélectionné', 'ko');
    const al = []; if (!v.contact || !v.telephone_contact) al.push('contact ou téléphone non renseigné : les occupants ne pourront pas joindre EOPUR'); if (v.date < DB.today()) al.push('la date du passage est déjà passée');
    const corpsAvis = (titre, l) => [{ p: 'Madame, Monsieur,' }, { p: v.message }, { champs: [['Date', new Date(v.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })], ['Horaires', v.horaires], ['Adresse', l.adresse + (l.ville ? ', ' + l.ville : '')], ...(l.batiment ? [['Bâtiment', l.batiment]] : []), ...(l.cage ? [['Cage', l.cage]] : []), ...(l.numero ? [['Logement', 'n° ' + l.numero + (l.etage ? ' – ' + l.etage : '')]] : [])] }, { p: 'En cas d\'empêchement, merci de contacter ' + (v.contact || 'EOPUR') + (v.telephone_contact ? ' au ' + v.telephone_contact : '') + '.' }, { p: 'Merci de votre compréhension.' }];
    let blocs = [], valeurs, tableaux = {}, type;
    const date = new Date(v.date + 'T12:00').toLocaleDateString('fr-FR');
    if (v.mode === 'individuel') { type = 'avis'; S.forEach((l, k) => { blocs.push({ h1: v.objet, saut: k > 0 }, ...corpsAvis(v.objet, l)); }); valeurs = null; }
    else { type = 'avis_groupe'; const grp = {}; for (const l of S) (grp[[l.adresse, l.batiment, l.cage].join('|')] = grp[[l.adresse, l.batiment, l.cage].join('|')] || []).push(l);
      Object.values(grp).forEach((g, k) => { const l0 = g[0]; blocs.push({ h1: v.objet, saut: k > 0 }, ...corpsAvis(v.objet, { adresse: l0.adresse, ville: l0.ville, batiment: l0.batiment, cage: l0.cage }), { h2: 'Logements concernés' }, { table: { entetes: ['Étage', 'Logement'], lignes: g.map(l => [l.etage, 'n° ' + l.numero]), largeurs: [50, 50] } }); });
      tableaux.logements = { entetes: ['Adresse', 'Étage', 'Logement'], lignes: S.map(l => [l.adresse, l.etage, 'n° ' + l.numero]) }; }
    const base = { chantier: c.nom, date, horaires: v.horaires, objet: v.objet, message: v.message, contact: v.contact, telephone_contact: v.telephone_contact };
    const mo = await DOCS.modeleActif(type);
    DOCS.circuit({ titre: 'Avis de passage – contrôle avant validation', id_chantier: idc, categorie: 'Avis de passage', alertes: al, titreDoc: 'Avis de passage du ' + date + ' – ' + S.length + ' logement(s)',
      apercu: (mo ? `<div class="info-l">Modèle EOPUR utilisé : ${esc(mo.m.nom)}</div>` : '<div class="info-l">Aucun modèle importé : avis standard EOPUR.</div>') + DOCX.apercu(v.objet, blocs.slice(0, 40)),
      produire: async () => {
        let blob;
        if (mo && type === 'avis') { // modèle individuel : un fichier par logement réuni dans un document = on produit le premier et on prévient
          if (S.length > 1) { blob = await DOCX.generer(v.objet, blocs, { sousTitre: c.nom }); toast('Modèle individuel : plusieurs logements → document standard multi-pages produit', 'ko'); }
          else { const l = S[0]; blob = await DOCX.remplirModele(mo.buf, Object.assign({}, base, { adresse: l.adresse, batiment: l.batiment, cage: l.cage, etage: l.etage, numero: l.numero })); }
        } else if (mo) { const l = S[0]; blob = await DOCX.remplirModele(mo.buf, Object.assign({}, base, { adresse: l.adresse, batiment: l.batiment, cage: l.cage }), tableaux); }
        else blob = await DOCX.generer(v.objet, blocs, { sousTitre: c.nom });
        return { blob, nom: 'Avis de passage ' + UI.nomFichier(c.nom) + ' ' + v.date + '.docx' };
      },
      fini: async () => { const aP = S.filter(l => l.statut === 'À planifier'); if (aP.length) await DB.tx(() => { for (const l of aP) DB.majLogement(l.id, { statut: 'À prévenir' }, 'avis de passage'); }); } });
  }
  // ================= DOE
  const PIECES_DOE = ['Page de garde et sommaire', 'Notices de fonctionnement et d\'entretien', 'Fiches techniques des équipements posés', 'Avis techniques / PV d\'essais', 'Plans de récolement', 'Relevés de mesures de débits / pressions', 'Suivi des logements (passages et résultats)', 'PV de réception', 'Attestations et certificats', 'Garanties fabricants'];
  PAGES.doe = { titre: 'DOE', rendu(z) {
    const idc = APP.actif(); if (!idc) { z.innerHTML = '<div class="info-l">Choisissez un chantier en haut de l\'écran.</div>'; const cc = P.carte(z, 'Avancement des DOE'); tableau(cc, q("SELECT c.id,c.nom,(SELECT COUNT(*) FROM doe_pieces WHERE id_chantier=c.id) n,(SELECT COUNT(*) FROM doe_pieces WHERE id_chantier=c.id AND statut='Fournie') f,(SELECT COUNT(*) FROM doe_pieces WHERE id_chantier=c.id AND statut='Manquante' AND obligatoire=1) m FROM chantiers c WHERE etat<>'Archivé'"), [{ k: 'nom', l: 'Chantier' }, { k: 'n', l: 'Pièces prévues' }, { k: 'f', l: 'Fournies' }, { k: 'm', l: 'Obligatoires manquantes', f: r => r.m ? '<b style="color:var(--rouge)">' + r.m + '</b>' : '0' }], { clic: i => { $('#chantier_actif').value = i; APP.rafraichir(); } }); return; }
    let L = q('SELECT p.*,d.titre dt,d.nom_fichier,d.statut ds FROM doe_pieces p LEFT JOIN documents d ON d.id=p.id_document WHERE p.id_chantier=? ORDER BY p.ordre,p.libelle', [idc]);
    const cc = P.carte(z, 'DOE – ' + esc(P.nomCh(idc)), `${L.length ? '' : '<button class="b g" id="init">Créer la liste type</button>'}<button class="b g" id="aj">Ajouter une pièce</button><button class="b g" id="xl">Bordereau Excel</button><button class="b" id="wd">Page de garde et sommaire Word</button>`);
    const man = L.filter(p => p.statut === 'Manquante' && p.obligatoire);
    if (man.length) { const a = document.createElement('div'); a.className = 'alerte-l'; a.textContent = man.length + ' pièce(s) obligatoire(s) manquante(s) : ' + man.map(p => p.libelle).join(', '); cc.appendChild(a); }
    const t = document.createElement('div'); cc.appendChild(t);
    tableau(t, L, [{ k: 'ordre', l: 'N°' }, { k: 'libelle', l: 'Pièce' }, { k: 'obligatoire', l: 'Obligatoire', f: r => r.obligatoire ? 'oui' : 'non' }, { k: 'statut', l: 'Statut', f: r => pastille(r.statut) }, { k: 'dt', l: 'Document lié', f: r => r.id_document ? esc(r.dt || r.nom_fichier) + ' ' + pastille(r.ds) : '<span class="s">—</span>' },
      { k: 'x', l: '', f: r => `<button class="b g p" data-li="${r.id}">Lier un document</button>${r.id_document ? ` <button class="b g p" data-vo="${r.id_document}">Voir</button>` : ''} <button class="b g p" data-su="${r.id}">Retirer</button>` }], { filtre: false, vide: 'Aucune pièce prévue. Créez la liste type ou ajoutez des pièces.',
      apres: tb => {
        $$('[data-vo]', tb).forEach(b => b.onclick = () => ficheDoc(b.dataset.vo));
        $$('[data-su]', tb).forEach(b => b.onclick = async () => { if (await confirmer('Retirer cette pièce de la liste du DOE ?')) { await action(() => DB.tx(() => { DB.run('DELETE FROM doe_pieces WHERE id=?', [b.dataset.su]); DB.hist('doe', b.dataset.su, idc, 'pièce retirée du DOE'); })); APP.rafraichir(); } });
        $$('[data-li]', tb).forEach(b => b.onclick = async () => { const D = q('SELECT id,titre,nom_fichier,categorie,statut FROM documents WHERE id_chantier=? ORDER BY categorie,titre', [idc]); const v = await formulaire('Lier un document du centre documentaire', [{ k: 'id_document', l: 'Document', t: 'select', o: D.map(d => [d.id, d.categorie + ' – ' + (d.titre || d.nom_fichier) + ' (' + d.statut + ')']) }], {}, { intro: D.length ? '' : 'Aucun document pour ce chantier : importez-le d\'abord dans le centre documentaire.' }); if (!v) return;
          await action(() => DB.tx(() => { DB.run('UPDATE doe_pieces SET id_document=?,statut=? WHERE id=?', [v.id_document || null, v.id_document ? 'Fournie' : 'Manquante', b.dataset.li]); DB.hist('doe', b.dataset.li, idc, v.id_document ? 'document lié à la pièce du DOE' : 'lien retiré'); }), 'DOE mis à jour'); APP.rafraichir(); });
      } });
    P.bouton(cc.parentNode, '#init', async () => { await action(() => DB.tx(() => { PIECES_DOE.forEach((p, k) => DB.run('INSERT INTO doe_pieces(id,id_chantier,libelle,obligatoire,statut,ordre) VALUES(?,?,?,?,?,?)', [DB.id('DP'), idc, p, k < 8 ? 1 : 0, 'Manquante', k + 1])); DB.hist('doe', idc, idc, 'liste type des pièces du DOE créée'); }), 'Liste créée – à adapter au marché'); APP.rafraichir(); });
    P.bouton(cc.parentNode, '#aj', async () => { const v = await formulaire('Nouvelle pièce du DOE', [{ k: 'libelle', l: 'Libellé', req: 1 }, { k: 'obligatoire', l: 'Pièce obligatoire', t: 'check', v: 1 }]); if (v) { await action(() => DB.tx(() => DB.run('INSERT INTO doe_pieces(id,id_chantier,libelle,obligatoire,statut,ordre) VALUES(?,?,?,?,?,?)', [DB.id('DP'), idc, v.libelle, v.obligatoire, 'Manquante', (un('SELECT MAX(ordre) FROM doe_pieces WHERE id_chantier=?', [idc]) || 0) + 1]))); APP.rafraichir(); } });
    const c = q('SELECT * FROM chantiers WHERE id=?', [idc])[0];
    const tab = { entetes: ['N°', 'Pièce', 'Document', 'Statut'], lignes: L.map(p => [String(p.ordre), p.libelle, p.dt || p.nom_fichier || '', p.statut]), largeurs: [8, 42, 36, 14] };
    P.bouton(cc.parentNode, '#wd', () => { const blocs = [{ champs: [['Chantier', (c.reference ? c.reference + ' – ' : '') + c.nom], ['Adresse', [c.adresse, c.ville].filter(Boolean).join(', ')], ['Maître d\'ouvrage', c.client], ['Date', new Date().toLocaleDateString('fr-FR')]] }, { h1: 'Sommaire' }, { table: tab }];
      DOCS.circuit({ titre: 'DOE – page de garde et sommaire', id_chantier: idc, categorie: 'DOE', alertes: man.map(p => 'pièce obligatoire manquante : ' + p.libelle), apercu: DOCX.apercu('Dossier des ouvrages exécutés', blocs),
        produire: async () => ({ blob: await produireWord('doe', 'Dossier des ouvrages exécutés', { chantier: c.nom, reference: c.reference, adresse: [c.adresse, c.ville].filter(Boolean).join(', '), client: c.client, date: new Date().toLocaleDateString('fr-FR') }, blocs, { pieces: tab }, { sousTitre: c.nom }), nom: 'DOE ' + UI.nomFichier(c.nom) + ' sommaire.docx' }) }); });
    P.bouton(cc.parentNode, '#xl', () => DOCS.circuit({ titre: 'DOE – bordereau des pièces (Excel)', id_chantier: idc, categorie: 'DOE', alertes: man.map(p => 'pièce obligatoire manquante : ' + p.libelle), apercu: DOCX.apercu('Bordereau DOE', [{ table: tab }]),
      produire: async () => { const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Bordereau DOE'); ws.getCell('A1').value = 'Bordereau des pièces du DOE – ' + c.nom; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getRow(3).values = ['N°', 'Pièce', 'Obligatoire', 'Document', 'Statut']; ws.getRow(3).font = { bold: true }; [6, 50, 12, 50, 12].forEach((w, i) => ws.getColumn(i + 1).width = w); L.forEach((p, k) => ws.getRow(4 + k).values = [p.ordre, p.libelle, p.obligatoire ? 'oui' : 'non', p.dt || p.nom_fichier || '', p.statut]); return { blob: await XL.blobDe(wb), nom: 'DOE ' + UI.nomFichier(c.nom) + ' bordereau.xlsx' }; } }));
  } };
  // ================= ASSISTANT DOCUMENTAIRE (recherche sourcée, sans invention)
  PAGES.assistant = { titre: 'Assistant documentaire', rendu(z) {
    const idc = APP.actif(), cc = P.carte(z, 'Assistant documentaire' + (idc ? ' – ' + esc(P.nomCh(idc)) : ''));
    cc.innerHTML = `<p class="s">Posez une question ou des mots-clés (ex. « débit cuisine T3 », « bouche hygro B », « délai de réception »). L'assistant ne répond qu'avec des extraits de vos documents, toujours avec leur source ; s'il ne trouve rien, il le dit.</p>
      <div class="ligne"><input id="qq" style="flex:1;padding:8px 10px;border:1px solid var(--ligne);border-radius:7px" placeholder="Votre question…"><button class="b" id="go">Chercher</button><button class="b g" id="ctl">Contrôler le dossier</button></div><div id="rep" style="margin-top:14px"></div>`;
    const go = () => { const t = $('#qq', cc).value.trim(); if (t) $('#rep', cc).innerHTML = repondre(t, idc); };
    $('#go', cc).onclick = go; $('#qq', cc).onkeydown = e => { if (e.key === 'Enter') go(); };
    $('#ctl', cc).onclick = () => $('#rep', cc).innerHTML = controleDossier(idc);
  } };
  const VIDES = new Set('le la les de des du un une et ou en au aux pour par sur dans avec est sont quel quelle quels quelles que qui quoi comment combien a à d l the of'.split(' '));
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function repondre(question, idc) {
    const mots = norm(question).split(/[^a-z0-9]+/).filter(m => m.length > 1 && !VIDES.has(m)); if (!mots.length) return '<p class="s">Question trop vague.</p>';
    const D = q("SELECT d.id,d.titre,d.nom_fichier,d.categorie,d.version,d.id_famille,d.texte,c.nom ch,(SELECT MAX(version) FROM documents x WHERE x.id_famille=d.id_famille) vmax FROM documents d LEFT JOIN chantiers c ON c.id=d.id_chantier WHERE d.texte<>''" + (idc ? ' AND d.id_chantier=?' : ''), idc ? [idc] : []);
    const res = [];
    for (const d of D) {
      const lignes = d.texte.split(/\n+/).filter(l => l.trim()); const N = lignes.map(norm);
      lignes.forEach((l, k) => { const n = N[k], sc = mots.filter(m => n.includes(m)).length; if (sc) res.push({ d, l: [lignes[k - 1], l, lignes[k + 1]].filter(Boolean).join(' ').slice(0, 420), sc: sc + (sc === mots.length ? 2 : 0) + (d.version === d.vmax ? 0.5 : 0) }); });
    }
    res.sort((a, b) => b.sc - a.sc); const best = res.filter(r => r.sc >= Math.min(mots.length, 2) || mots.length === 1).slice(0, 12);
    if (!best.length) return `<div class="alerte-l">Aucun passage de vos documents ne répond à « ${esc(question)} ». Information non trouvée : à demander ou à vérifier.</div><p class="s">${D.length} document(s) indexé(s) consulté(s). Les images et PDF scannés ne sont pas lisibles.</p>`;
    const rx = new RegExp('(' + mots.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    return `<p><b>${best.length} extrait(s) trouvé(s)</b> – à vérifier dans le document source avant utilisation.</p>` + best.map(r => `<div class="carte" style="padding:10px 12px"><div class="s">📄 <a style="cursor:pointer;color:var(--accent)" data-d="${r.d.id}">${esc(r.d.titre)}</a> · ${esc(r.d.categorie)} · v${r.d.version}${r.d.version < r.d.vmax ? ' <span class="pa orange">version remplacée</span>' : ''} · ${esc(r.d.ch || 'sans chantier')}</div><div style="margin-top:4px">« ${esc(r.l).replace(rx, '<mark>$1</mark>')} »</div></div>`).join('');
  }
  function controleDossier(idc) {
    const w = idc ? ' AND id_chantier=?' : '', p = idc ? [idc] : [], A = [];
    const br = q("SELECT titre FROM documents WHERE statut='brouillon'" + w, p); if (br.length) A.push(['att', br.length + ' document(s) produit(s) en brouillon, non validé(s) : ' + br.slice(0, 5).map(d => d.titre).join(', ')]);
    const dm = q("SELECT libelle FROM doe_pieces WHERE statut='Manquante' AND obligatoire=1" + w, p); if (dm.length) A.push(['ko', dm.length + ' pièce(s) obligatoire(s) du DOE manquante(s) : ' + dm.map(d => d.libelle).join(', ')]);
    const sansT = un("SELECT COUNT(*) FROM documents WHERE texte='' AND ext IN ('pdf')" + w, p); if (sansT) A.push(['info', sansT + ' PDF sans texte (scannés) : non consultables par l\'assistant']);
    const eqv = un("SELECT COUNT(*) FROM equipements e JOIN etudes t ON t.id=e.id_etude WHERE e.fiabilite<>'Confirmé'" + (idc ? ' AND t.id_chantier=?' : ''), p); if (eqv) A.push(['att', eqv + ' donnée(s) d\'étude VMC non confirmée(s) (hypothèse ou à vérifier)']);
    const sansSrc = un("SELECT COUNT(*) FROM equipements e JOIN etudes t ON t.id=e.id_etude WHERE e.source_document=''" + (idc ? ' AND t.id_chantier=?' : ''), p); if (sansSrc) A.push(['ko', sansSrc + ' donnée(s) d\'étude sans document source']);
    const cats = q('SELECT DISTINCT categorie FROM documents WHERE 1=1' + w, p).map(r => r.categorie); for (const c of ['CCTP / DCE', 'Plans', 'Fiches techniques']) if (idc && !cats.includes(c)) A.push(['info', 'aucun document « ' + c + ' » pour ce chantier']);
    return A.length ? A.map(([t, m]) => `<div class="${t === 'ko' ? 'ko-l' : t === 'att' ? 'alerte-l' : 'info-l'}">${esc(m)}</div>`).join('') : '<div class="ok-l">Aucun manque détecté.</div>';
  }
  document.addEventListener('click', e => { const a = e.target.closest('#rep [data-d]'); if (a) ficheDoc(a.dataset.d); });
  return { listeDocuments, ficheDoc, importer, rapportPour, avisPour, produireWord, repondre, CATS };
})();
