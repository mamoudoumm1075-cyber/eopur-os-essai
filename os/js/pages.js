// EOPUR OS – pages : tableau de bord, chantiers, logements, planning, interventions, anomalies, échéancier, paramètres
const P = (() => {
  const { $, $$, esc, dateFr, pastille, formulaire, confirmer, fenetre, tableau, action, toast } = UI;
  const q = DB.q, un = DB.un;
  const ch = () => APP.actif();
  const chOpts = () => q("SELECT id,reference,nom FROM chantiers WHERE etat<>'Archivé' ORDER BY nom").map(c => [c.id, (c.reference ? c.reference + ' – ' : '') + c.nom]);
  const nomCh = idc => { const c = q('SELECT reference,nom FROM chantiers WHERE id=?', [idc])[0]; return c ? (c.reference ? c.reference + ' – ' : '') + c.nom : ''; };
  const libLog = l => [l.adresse, l.batiment && 'bât. ' + l.batiment, l.cage && 'cage ' + l.cage, 'n° ' + l.numero].filter(Boolean).join(' ');
  const exigerCh = () => { const c = ch(); if (!c) { toast('Choisissez d\'abord un chantier en haut de l\'écran', 'ko'); } return c; };
  const TYPES_INT = ['Passage', 'Repassage', 'Visite technique', 'Réception', 'Réunion de chantier', 'Autre'];
  const intervenants = () => q("SELECT DISTINCT intervenant v FROM interventions WHERE intervenant<>'' ORDER BY 1").map(r => r.v);
  function carte(z, titre, outils) { const d = document.createElement('div'); d.className = 'carte'; d.innerHTML = `<h2>${titre}${outils ? '<span class="ligne">' + outils + '</span>' : ''}</h2><div class="corps"></div>`; z.appendChild(d); return $('.corps', d); }
  function bouton(cible, sel, fn) { const b = $(sel, cible); if (b) b.onclick = fn; }
  function onglets(z, liste, actuel, surClic) { const d = document.createElement('div'); d.className = 'onglets'; d.innerHTML = liste.map(([k, l]) => `<a data-o="${k}" class="${k === actuel ? 'on' : ''}">${esc(l)}</a>`).join(''); z.appendChild(d); $$('a', d).forEach(a => a.onclick = () => surClic(a.dataset.o)); }
  // ---------------- photos (fichiers dans photos/<chantier>/, jamais modifiés)
  async function ajouterPhotos(lien) {
    return new Promise(res => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.onchange = () => action(async () => {
        let n = 0;
        for (const f of inp.files) {
          const b = await f.arrayBuffer(), sha = await EO.sha(b);
          if (un('SELECT COUNT(*) FROM photos WHERE sha256=? AND id_chantier=?', [sha, lien.id_chantier])) { toast('Photo déjà présente : ' + f.name, 'ko'); continue; }
          const i = DB.id('PH'), ext = (f.name.split('.').pop() || 'jpg').toLowerCase(), chemin = 'photos/' + lien.id_chantier + '/' + i + '.' + ext;
          await DB.ecrireFichier(chemin, b);
          await DB.tx(() => { DB.run('INSERT INTO photos(id,id_chantier,id_logement,id_passage,id_anomalie,fichier,sha256,taille,legende,cree_le) VALUES(?,?,?,?,?,?,?,?,?,?)', [i, lien.id_chantier, lien.id_logement || null, lien.id_passage || null, lien.id_anomalie || null, chemin, sha, b.byteLength, f.name, DB.now()]); DB.hist('photo', i, lien.id_chantier, 'photo ajoutée : ' + f.name); });
          n++;
        }
        if (n) toast(n + ' photo(s) ajoutée(s)'); res(n);
      });
      inp.click();
    });
  }
  async function vignettes(cible, where, p) {
    const L = q('SELECT * FROM photos WHERE ' + where + ' ORDER BY cree_le', p);
    if (!L.length) { cible.innerHTML = '<span class="s">Aucune photo.</span>'; return; }
    cible.innerHTML = '<div class="ligne">' + L.map(f => `<a data-f="${esc(f.fichier)}" title="${esc(f.legende)}"><img data-i="${esc(f.fichier)}" style="height:84px;border-radius:6px;border:1px solid var(--ligne);cursor:zoom-in"></a>`).join('') + '</div>';
    for (const img of $$('img[data-i]', cible)) { try { img.src = URL.createObjectURL(await DB.lireFichier(img.dataset.i)); img.onclick = () => fenetre('Photo', `<img src="${img.src}" style="max-width:100%">`, true); } catch (e) { img.alt = 'fichier absent'; } }
  }
  // ================= TABLEAU DE BORD
  PAGES.tableau = { titre: 'Tableau de bord', rendu(z) {
    const k = M.indicateurs(), c = ch(), t = DB.today();
    if (!un('SELECT COUNT(*) FROM chantiers')) { z.innerHTML = `<div class="carte"><h2>Bienvenue dans EOPUR OS</h2><p>La base est vide. Commencez par créer un chantier, puis ses logements (saisie, création en série ou import Excel).</p><button class="b" id="go">Créer un premier chantier</button></div>`; bouton(z, '#go', () => APP.aller('chantiers')); return; }
    const K = [['Chantiers actifs', k.chantiersActifs, '', 'chantiers'], ['Logements à traiter', k.aTraiter, '', 'logements'], ['Interventions à venir', k.aVenir, '', 'planning'], ['Interventions en retard', k.enRetard, k.enRetard ? 'alerte' : '', 'interventions'],
      ['Passages réalisés', k.realisees, '', 'interventions'], ['Absents', k.absents, k.absents ? 'att' : '', 'logements'], ['Inaccessibles', k.inaccessibles, k.inaccessibles ? 'att' : '', 'logements'], ['À repasser (sans date)', k.aRepasser, k.aRepasser ? 'att' : '', 'logements'],
      ['Anomalies ouvertes', k.anomalies, '', 'anomalies'], ['Anomalies urgentes', k.anomaliesUrgentes, k.anomaliesUrgentes ? 'alerte' : '', 'anomalies'], ['Documents à valider / DOE manquants', k.docsAttente, k.docsAttente ? 'att' : '', 'doe'], ['Échéances sous 7 jours', k.echeances7, '', 'echeancier'],
      ['Échéances dépassées', k.echeancesDepassees, k.echeancesDepassees ? 'alerte' : '', 'echeancier'], ['Conflits de synchronisation', k.conflits, k.conflits ? 'alerte' : '', 'synchro'], ['Paquets à intégrer', k.paquetsAttente, k.paquetsAttente ? 'att' : '', 'synchro']];
    const d = document.createElement('div'); d.className = 'kpis'; d.innerHTML = K.map(x => `<div class="kpi ${x[2]}" data-p="${x[3]}"><b>${x[1] ?? 0}</b><span>${esc(x[0])}</span></div>`).join(''); z.appendChild(d);
    $$('.kpi', d).forEach(e => e.onclick = () => APP.aller(e.dataset.p));
    const g = document.createElement('div'); g.className = 'grille'; z.appendChild(g);
    // avancement par chantier
    const av = carte(g, 'Avancement des chantiers');
    const CH = q("SELECT c.id,c.nom,c.reference,c.etat,COUNT(l.id) n,SUM(l.statut IN ('Terminé','Intervention réalisée')) f,SUM(l.statut IN ('Absent','Inaccessible','À repasser','Refus d''accès','Problème technique')) p FROM chantiers c LEFT JOIN logements l ON l.id_chantier=c.id WHERE c.etat NOT IN ('Archivé') GROUP BY c.id ORDER BY c.nom");
    av.innerHTML = CH.map(c => { const pc = c.n ? Math.round(100 * c.f / c.n) : 0; return `<div style="margin-bottom:10px;cursor:pointer" data-c="${c.id}"><div class="ligne"><b>${esc((c.reference ? c.reference + ' – ' : '') + c.nom)}</b>${pastille(c.etat)}<span class="s" style="margin-left:auto">${c.f || 0}/${c.n} logements · ${c.p || 0} à reprendre</span></div><div style="height:8px;background:var(--gris2);border-radius:5px;margin-top:4px"><div style="width:${pc}%;height:8px;background:var(--accent);border-radius:5px"></div></div></div>`; }).join('') || '<span class="s">Aucun chantier.</span>';
    $$('[data-c]', av).forEach(e => e.onclick = () => APP.aller('chantiers:' + e.dataset.c));
    // 7 prochains jours
    const pr = carte(g, 'À venir (7 jours)'), dans7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const E = M.toutesEcheances(c || null).filter(e => e.date >= t && e.date <= dans7 && e.statut !== 'Fait');
    pr.innerHTML = E.length ? '<table class="t">' + E.slice(0, 25).map(e => `<tr><td style="white-space:nowrap">${dateFr(e.date)}</td><td>${pastille(e.type)}</td><td>${esc(e.titre)}<div class="s">${esc(e.chantier || '')}</div></td></tr>`).join('') + '</table>' : '<span class="s">Rien de prévu sur les 7 prochains jours.</span>';
    // alertes
    const al = carte(g, 'Alertes'), A = [];
    for (const i of q("SELECT i.*,c.nom ch FROM interventions i JOIN chantiers c ON c.id=i.id_chantier WHERE i.statut='Planifiée' AND i.date<? ORDER BY i.date", [t])) A.push(['ko', `Intervention du ${dateFr(i.date)} (${esc(i.ch)}) toujours « Planifiée » : saisir les résultats`, 'interventions:' + i.id]);
    for (const i of q("SELECT i.* FROM interventions i WHERE i.statut='Planifiée' AND i.date>=?", [t])) { const lg = q('SELECT id_logement FROM passages WHERE id_intervention=?', [i.id]).map(r => r.id_logement); for (const m of M.alertesIntervention(i, lg, i.id).filter(m => !m.startsWith('date passée'))) A.push(['att', `${dateFr(i.date)} : ${esc(m)}`, 'interventions:' + i.id]); }
    for (const a of q("SELECT a.*,c.nom ch FROM anomalies a JOIN chantiers c ON c.id=a.id_chantier WHERE a.statut NOT IN ('Résolue','Clôturée') AND a.priorite IN ('Haute','Urgente')")) A.push(['ko', `Anomalie ${esc(a.priorite.toLowerCase())} : ${esc(a.description.slice(0, 80))} (${esc(a.ch)})`, 'anomalies:' + a.id]);
    for (const e of M.toutesEcheances().filter(e => e.date < t && e.modifiable && e.statut !== 'Fait')) A.push(['att', `Échéance dépassée : ${esc(e.titre)} (${dateFr(e.date)})`, 'echeancier']);
    if (k.conflits) A.push(['ko', k.conflits + ' conflit(s) de synchronisation à arbitrer', 'synchro']);
    al.innerHTML = A.length ? A.slice(0, 30).map(a => `<div class="${a[0] === 'ko' ? 'ko-l' : 'alerte-l'}" style="cursor:pointer" data-v="${a[2]}">${a[1]}</div>`).join('') : '<div class="ok-l">Aucune alerte.</div>';
    $$('[data-v]', al).forEach(e => e.onclick = () => APP.aller(e.dataset.v));
    // dernières modifications
    const hi = carte(g, 'Dernières modifications');
    hi.innerHTML = '<table class="t">' + q('SELECT h.*,c.nom ch FROM historique h LEFT JOIN chantiers c ON c.id=h.id_chantier' + (c ? ' WHERE h.id_chantier=?' : '') + ' ORDER BY h.id DESC LIMIT 15', c ? [c] : []).map(h => `<tr><td class="s" style="white-space:nowrap">${dateFr(h.quand)}</td><td>${esc(h.resume)}<div class="s">${esc(h.ch || '')} · ${esc(h.source)}</div></td></tr>`).join('') + '</table>';
  } };
  // ================= CHANTIERS
  const CHAMPS_CH = () => [{ k: 'reference', l: 'Référence', aide: 'Unique, ex. numéro d\'affaire' }, { k: 'nom', l: 'Nom du chantier', req: 1 }, { k: 'adresse', l: 'Adresse' }, { k: 'ville', l: 'Ville' }, { k: 'client', l: 'Client / maître d\'ouvrage' }, { k: 'responsable', l: 'Responsable EOPUR' },
    { k: 'etat', l: 'État', t: 'select', o: DB.ETATS_CHANTIER, vide: false }, { k: 'date_debut', l: 'Début', t: 'date' }, { k: 'date_fin', l: 'Fin prévue', t: 'date' }, { k: 'infos_techniques', l: 'Informations techniques', t: 'textarea' }, { k: 'notes', l: 'Notes', t: 'textarea' }];
  PAGES.chantiers = { titre: 'Chantiers', rendu(z, p) {
    if (p.id) return ficheChantier(z, p.id, p.onglet || 'infos');
    const c = carte(z, 'Référentiel des chantiers', '<button class="b" id="nv">Nouveau chantier</button>');
    const L = q("SELECT c.*,(SELECT COUNT(*) FROM logements WHERE id_chantier=c.id) nl,(SELECT COUNT(*) FROM logements WHERE id_chantier=c.id AND statut IN ('Terminé','Intervention réalisée')) nf,(SELECT COUNT(*) FROM anomalies WHERE id_chantier=c.id AND statut NOT IN ('Résolue','Clôturée')) na FROM chantiers c ORDER BY c.etat='Archivé', c.nom");
    tableau(c, L, [{ k: 'reference', l: 'Réf.' }, { k: 'nom', l: 'Chantier', f: r => '<b>' + esc(r.nom) + '</b>' }, { k: 'ville', l: 'Ville' }, { k: 'client', l: 'Client' }, { k: 'responsable', l: 'Responsable' }, { k: 'etat', l: 'État', f: r => pastille(r.etat) },
      { k: 'nl', l: 'Logements', f: r => (r.nf || 0) + ' / ' + r.nl }, { k: 'na', l: 'Anomalies', f: r => r.na ? '<b style="color:var(--rouge)">' + r.na + '</b>' : '0' }, { k: 'date_fin', l: 'Fin prévue', f: r => dateFr(r.date_fin) }], { clic: i => APP.aller('chantiers:' + i), vide: 'Aucun chantier. Cliquez sur « Nouveau chantier ».' });
    bouton(z, '#nv', async () => { const v = await formulaire('Nouveau chantier', CHAMPS_CH(), { etat: 'En préparation' }); if (!v) return; const i = await action(() => M.creerChantier(v), 'Chantier créé'); if (i) { APP.remplirChantiers(); APP.aller('chantiers:' + i); } });
  } };
  function ficheChantier(z, idc, ong) {
    const c = q('SELECT * FROM chantiers WHERE id=?', [idc])[0]; if (!c) { z.innerHTML = '<div class="ko-l">Chantier introuvable.</div>'; return; }
    $('#titre').textContent = (c.reference ? c.reference + ' – ' : '') + c.nom;
    const h = document.createElement('div'); h.className = 'ligne'; h.style.marginBottom = '10px';
    h.innerHTML = `<button class="b g" id="ret">← Chantiers</button>${pastille(c.etat)}<span class="s">${esc([c.adresse, c.ville].filter(Boolean).join(', '))}</span><span style="margin-left:auto" class="ligne"><button class="b g" id="actif">Définir comme chantier de travail</button><button class="b" id="mod">Modifier</button></span>`; z.appendChild(h);
    bouton(h, '#ret', () => APP.aller('chantiers')); bouton(h, '#actif', () => { $('#chantier_actif').value = idc; try { localStorage.setItem('eo_chantier', idc); } catch (e) { } toast('Chantier de travail : ' + c.nom); });
    bouton(h, '#mod', async () => { const v = await formulaire('Modifier le chantier', CHAMPS_CH(), c); if (v && await action(() => M.majChantier(idc, v), 'Chantier modifié') !== undefined) { APP.remplirChantiers(); APP.rafraichir(); } });
    const go = o => { APP.aller('chantiers', { id: idc, onglet: o }); };
    onglets(z, [['infos', 'Informations'], ['inter', 'Interlocuteurs'], ['logements', 'Logements'], ['interventions', 'Interventions'], ['anomalies', 'Anomalies'], ['documents', 'Documents'], ['historique', 'Historique']], ong, go);
    const b = document.createElement('div'); z.appendChild(b);
    if (ong === 'infos') {
      const n = q("SELECT statut,COUNT(*) n FROM logements WHERE id_chantier=? GROUP BY statut", [idc]);
      b.innerHTML = `<div class="grille"><div class="carte"><h2>Fiche</h2><dl class="fiche">${[['Référence', c.reference], ['Nom', c.nom], ['Adresse', c.adresse], ['Ville', c.ville], ['Client', c.client], ['Responsable', c.responsable], ['Début', dateFr(c.date_debut)], ['Fin prévue', dateFr(c.date_fin)], ['Infos techniques', c.infos_techniques], ['Notes', c.notes], ['Créé le', dateFr(c.cree_le)], ['Modifié le', dateFr(c.maj_le)]].map(([a, v]) => `<dt>${a}</dt><dd>${v ? esc(v) : '<span class="s">non renseigné</span>'}</dd>`).join('')}</dl></div>
        <div class="carte"><h2>Logements par statut</h2>${n.length ? '<table class="t">' + n.map(x => `<tr><td>${pastille(x.statut)}</td><td>${x.n}</td></tr>`).join('') + '</table>' : '<span class="s">Aucun logement.</span>'}</div></div>`;
    } else if (ong === 'inter') {
      const cc = carte(b, 'Interlocuteurs', '<button class="b" id="ai">Ajouter</button>');
      tableau(cc, q('SELECT * FROM interlocuteurs WHERE id_chantier=? ORDER BY nom', [idc]), [{ k: 'nom', l: 'Nom' }, { k: 'role', l: 'Rôle' }, { k: 'societe', l: 'Société' }, { k: 'telephone', l: 'Téléphone' }, { k: 'email', l: 'E-mail' }, { k: 'x', l: '', f: r => `<button class="b g p" data-del="${r.id}">Retirer</button>` }], { filtre: false, apres: t => $$('[data-del]', t).forEach(x => x.onclick = async () => { if (await confirmer('Retirer cet interlocuteur ?')) { await action(() => M.supprimerInterlocuteur(x.dataset.del)); APP.rafraichir(); } }) });
      bouton(b, '#ai', async () => { const v = await formulaire('Nouvel interlocuteur', [{ k: 'nom', l: 'Nom', req: 1 }, { k: 'role', l: 'Rôle', t: 'select', o: ['Maître d\'ouvrage', 'Bailleur', 'Gardien', 'Maître d\'œuvre', 'Bureau de contrôle', 'Conducteur de travaux', 'Fournisseur', 'Sous-traitant', 'Autre'] }, { k: 'societe', l: 'Société' }, { k: 'telephone', l: 'Téléphone' }, { k: 'email', l: 'E-mail', t: 'email' }]); if (v) { await action(() => M.ajouterInterlocuteur(idc, v), 'Ajouté'); APP.rafraichir(); } });
    } else if (ong === 'logements') listeLogements(b, idc);
    else if (ong === 'interventions') listeInterventions(b, idc);
    else if (ong === 'anomalies') listeAnomalies(b, idc);
    else if (ong === 'documents') { PD.listeDocuments(b, idc); }
    else if (ong === 'historique') { const cc = carte(b, 'Historique complet du chantier'); tableau(cc, q('SELECT * FROM historique WHERE id_chantier=? ORDER BY id DESC', [idc]).map(h => Object.assign(h, { id: 'h' + h.id })), [{ k: 'quand', l: 'Date', f: r => dateFr(r.quand) }, { k: 'objet', l: 'Objet' }, { k: 'resume', l: 'Modification' }, { k: 'source', l: 'Source' }, { k: 'auteur', l: 'Poste' }]); }
  }
  // ================= LOGEMENTS
  const CHAMPS_LOG = () => [{ k: 'adresse', l: 'Adresse' }, { k: 'ville', l: 'Ville' }, { k: 'batiment', l: 'Bâtiment' }, { k: 'cage', l: 'Cage / escalier' }, { k: 'etage', l: 'Étage' }, { k: 'numero', l: 'N° de logement', req: 1 }, { k: 'reference', l: 'Référence bailleur' }, { k: 'typo', l: 'Typologie', t: 'select', o: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'Studio', 'Local', 'Autre'] },
    { k: 'occupant', l: 'Occupant (nom seul)', aide: 'Strict nécessaire : ne pas saisir d\'autres données personnelles' }, { k: 'telephone', l: 'Téléphone occupant' }, { k: 'statut', l: 'Statut', t: 'select', o: DB.STATUTS_LOGEMENT, vide: false }, { k: 'repassage', l: 'Date de repassage', t: 'date' }, { k: 'observation', l: 'Observation', t: 'textarea' }];
  PAGES.logements = { titre: 'Logements', rendu(z, p) {
    if (p.id) { const l = q('SELECT id_chantier FROM logements WHERE id=?', [p.id])[0]; if (l) { listeLogements(z, l.id_chantier); ficheLogement(p.id); return; } }
    const c = ch(); if (!c) { z.innerHTML = '<div class="info-l">Choisissez un chantier en haut de l\'écran pour afficher ses logements.</div>'; return listeLogementsTous(z); }
    listeLogements(z, c);
  } };
  function listeLogementsTous(z) { const cc = carte(z, 'Tous les logements (chantiers actifs)'); tableau(cc, q("SELECT l.*,c.nom ch FROM logements l JOIN chantiers c ON c.id=l.id_chantier WHERE c.etat NOT IN ('Archivé') ORDER BY c.nom,l.adresse,l.batiment,l.numero"), [{ k: 'ch', l: 'Chantier' }, { k: 'adresse', l: 'Adresse' }, { k: 'batiment', l: 'Bât.' }, { k: 'numero', l: 'N°' }, { k: 'statut', l: 'Statut', f: r => pastille(r.statut) }, { k: 'repassage', l: 'Repassage', f: r => dateFr(r.repassage) }, { k: 'observation', l: 'Observation' }], { clic: ficheLogement }); }
  function listeLogements(z, idc) {
    let fs = sessionStorage.getItem('eo_fs') || '';
    const outils = `<button class="b g" id="imp">Importer Excel</button><button class="b g" id="exp">Exporter suivi (trame EOPUR)</button><button class="b g" id="ser">Création en série</button><button class="b" id="nv">Nouveau logement</button>`;
    const cc = carte(z, 'Logements – ' + esc(nomCh(idc)), outils);
    const stats = q('SELECT statut,COUNT(*) n FROM logements WHERE id_chantier=? GROUP BY statut', [idc]), tot = stats.reduce((a, b) => a + b.n, 0);
    const bar = document.createElement('div'); bar.className = 'ligne'; bar.style.marginBottom = '10px';
    bar.innerHTML = `<a class="pa ${!fs ? 'vert' : 'gris'}" data-f="" style="cursor:pointer">Tous (${tot})</a>` + DB.STATUTS_LOGEMENT.map(s => { const n = (stats.find(x => x.statut === s) || {}).n || 0; return n ? `<a class="pa ${fs === s ? 'vert' : 'gris'}" data-f="${esc(s)}" style="cursor:pointer">${esc(s)} (${n})</a>` : ''; }).join('');
    cc.appendChild(bar); const t = document.createElement('div'); cc.appendChild(t);
    $$('[data-f]', bar).forEach(a => a.onclick = () => { sessionStorage.setItem('eo_fs', a.dataset.f); APP.rafraichir(); });
    const L = q('SELECT l.*,(SELECT COUNT(*) FROM passages p WHERE p.id_logement=l.id AND p.resultat<>\'\') np,(SELECT COUNT(*) FROM anomalies a WHERE a.id_logement=l.id AND a.statut NOT IN (\'Résolue\',\'Clôturée\')) na FROM logements l WHERE id_chantier=?' + (fs ? ' AND statut=?' : '') + ' ORDER BY adresse,batiment,cage,CAST(numero AS INTEGER),numero', fs ? [idc, fs] : [idc]);
    const T = tableau(t, L, [{ k: 'adresse', l: 'Adresse' }, { k: 'batiment', l: 'Bât.' }, { k: 'cage', l: 'Cage' }, { k: 'etage', l: 'Étage' }, { k: 'numero', l: 'N°', f: r => '<b>' + esc(r.numero) + '</b>' }, { k: 'typo', l: 'Typo' }, { k: 'occupant', l: 'Occupant' },
      { k: 'statut', l: 'Statut', f: r => pastille(r.statut) }, { k: 'np', l: 'Passages' }, { k: 'repassage', l: 'Repassage', f: r => dateFr(r.repassage) }, { k: 'na', l: 'Anom.', f: r => r.na ? '<b style="color:var(--rouge)">' + r.na + '</b>' : '' }, { k: 'observation', l: 'Observation' }],
      { select: true, clic: ficheLogement, outils: '<span style="margin-left:auto" class="ligne"><span class="s">Sélection :</span><button class="b g p" id="s_pl">Planifier un passage</button><button class="b g p" id="s_st">Changer le statut</button><button class="b g p" id="s_av">Avis de passage</button></span>', vide: 'Aucun logement. Saisissez-les, créez-les en série ou importez un fichier Excel.' });
    const sel = () => { const s = T.selection(); if (!s.length) toast('Cochez au moins un logement', 'ko'); return s; };
    bouton(t, '#s_pl', () => { const s = sel(); if (s.length) nouvelleIntervention({ id_chantier: idc }, s); });
    bouton(t, '#s_av', () => { const s = sel(); if (s.length) PD.avisPour(idc, s); });
    bouton(t, '#s_st', async () => { const s = sel(); if (!s.length) return; const v = await formulaire('Changer le statut de ' + s.length + ' logement(s)', [{ k: 'statut', l: 'Nouveau statut', t: 'select', o: DB.STATUTS_LOGEMENT, req: 1 }, { k: 'observation', l: 'Observation (facultatif, remplace l\'existante)', t: 'textarea' }]); if (!v) return;
      await action(() => DB.tx(() => { for (const i of s) DB.majLogement(i, v.observation ? v : { statut: v.statut }, 'modification groupée'); }), 'Statuts mis à jour'); APP.rafraichir(); });
    bouton(cc.parentNode, '#nv', async () => { const v = await formulaire('Nouveau logement', CHAMPS_LOG(), { statut: 'À planifier', adresse: (L[0] || {}).adresse || '', ville: (L[0] || {}).ville || '' }); if (v) { await action(() => M.creerLogement(idc, v), 'Logement créé'); APP.rafraichir(); } });
    bouton(cc.parentNode, '#ser', async () => { const v = await formulaire('Création de logements en série', [{ k: 'adresse', l: 'Adresse', req: 1 }, { k: 'ville', l: 'Ville' }, { k: 'batiment', l: 'Bâtiment' }, { k: 'cage', l: 'Cage' }, { k: 'niveaux', l: 'Nombre de niveaux (RDC compris)', t: 'number', req: 1 }, { k: 'parNiveau', l: 'Logements par niveau', t: 'number', req: 1 }, { k: 'premier', l: 'Premier numéro', t: 'number', v: 1 }], {}, { intro: 'Les numéros sont attribués à la suite. Un doublon interrompt toute la création (rien n\'est créé).' }); if (!v) return; const r = await action(() => M.creerLogementsSerie(idc, v)); if (r) { toast(r.length + ' logements créés'); APP.rafraichir(); } });
    bouton(cc.parentNode, '#imp', () => XL.importerLogements(idc));
    bouton(cc.parentNode, '#exp', () => XL.exporterSuivi(idc));
  }
  function ficheLogement(lid) {
    const l = q('SELECT * FROM logements WHERE id=?', [lid])[0]; if (!l) return;
    const pas = q('SELECT p.*,i.date,i.type,i.intervenant FROM passages p JOIN interventions i ON i.id=p.id_intervention WHERE p.id_logement=? ORDER BY i.date', [lid]);
    const hs = q("SELECT * FROM historique WHERE objet='logement' AND id_objet=? ORDER BY id DESC", [lid]);
    const an = q('SELECT * FROM anomalies WHERE id_logement=? ORDER BY date DESC', [lid]);
    const m = fenetre('Logement ' + libLog(l), `<div class="ligne" style="margin-bottom:10px">${pastille(l.statut)}<span class="s">Révision ${l.revision} · modifié le ${dateFr(l.maj_le)} par ${esc(l.maj_par)}</span><span style="margin-left:auto" class="ligne"><button class="b g p" id="ph">Ajouter des photos</button><button class="b g p" id="ano">Signaler une anomalie</button><button class="b g p" id="pl">Planifier</button>${l.statut !== 'Terminé' ? '<button class="b g p" id="clo">Clôturer (Terminé)</button>' : ''}<button class="b p" id="mod">Modifier</button></span></div>
      <dl class="fiche">${[['Chantier', nomCh(l.id_chantier)], ['Adresse', [l.adresse, l.ville].filter(Boolean).join(', ')], ['Bâtiment / cage / étage', [l.batiment, l.cage, l.etage].filter(Boolean).join(' / ')], ['N°', l.numero], ['Réf. bailleur', l.reference], ['Typologie', l.typo], ['Occupant', l.occupant], ['Téléphone', l.telephone], ['Repassage prévu', dateFr(l.repassage)], ['Observation', l.observation]].map(([a, v]) => `<dt>${a}</dt><dd>${v ? esc(v) : '<span class="s">—</span>'}</dd>`).join('')}</dl>
      <h4>Passages (${pas.length})</h4>${pas.length ? '<table class="t"><tr><th>Date</th><th>Type</th><th>Intervenant</th><th>Résultat</th><th>Observation</th><th>Actions</th></tr>' + pas.map(p => `<tr><td>${dateFr(p.date)}</td><td>${esc(p.type)}</td><td>${esc(p.intervenant)}</td><td>${p.resultat ? pastille(p.resultat) : '<span class="s">à saisir</span>'}</td><td>${esc(p.observation)}</td><td>${esc(p.actions)}</td></tr>`).join('') + '</table>' : '<p class="s">Aucun passage.</p>'}
      <h4>Anomalies (${an.length})</h4>${an.length ? '<table class="t">' + an.map(a => `<tr><td>${dateFr(a.date)}</td><td>${pastille(a.statut)}</td><td>${esc(a.description)}</td></tr>`).join('') + '</table>' : '<p class="s">Aucune.</p>'}
      <h4>Photos</h4><div id="vg"></div>
      <h4>Historique (${hs.length})</h4><table class="t">${hs.map(h => `<tr><td class="s" style="white-space:nowrap">${dateFr(h.quand)}</td><td>${esc(h.resume)}</td><td class="s">${esc(h.source)}</td></tr>`).join('')}</table>`, true);
    vignettes($('#vg', m), 'id_logement=?', [lid]);
    const fin = () => { m.remove(); APP.rafraichir(); };
    bouton(m, '#mod', async () => { const v = await formulaire('Modifier le logement', CHAMPS_LOG(), l); if (v && await action(() => M.majLogement(lid, v), 'Logement modifié') !== undefined) fin(); });
    bouton(m, '#clo', async () => { if (await confirmer('Clôturer ce logement (statut « Terminé ») ?')) { await action(() => M.cloturerLogement(lid), 'Logement clôturé'); fin(); } });
    bouton(m, '#pl', () => { m.remove(); nouvelleIntervention({ id_chantier: l.id_chantier, type: pas.length ? 'Repassage' : 'Passage', date: l.repassage || '' }, [lid]); });
    bouton(m, '#ano', () => { m.remove(); nouvelleAnomalie({ id_chantier: l.id_chantier, id_logement: lid }); });
    bouton(m, '#ph', async () => { if (await ajouterPhotos({ id_chantier: l.id_chantier, id_logement: lid })) vignettes($('#vg', m), 'id_logement=?', [lid]); });
  }
  // ================= PLANNING
  function nouvelleIntervention(base, logementsPre, idModif) {
    const idc = base.id_chantier; if (!idc) return toast('Chantier requis', 'ko');
    const L = q("SELECT * FROM logements WHERE id_chantier=? ORDER BY adresse,batiment,CAST(numero AS INTEGER),numero", [idc]).filter(l => l.statut !== 'Terminé' || (logementsPre || []).includes(l.id));
    const champs = [{ k: 'date', l: 'Date', t: 'date', req: 1 }, { k: 'type', l: 'Type', t: 'select', o: TYPES_INT, vide: false }, { k: 'heure_debut', l: 'Heure de début', t: 'time' }, { k: 'heure_fin', l: 'Heure de fin', t: 'time' },
      { k: 'intervenant', l: 'Intervenant(s)', aide: intervenants().length ? 'Déjà utilisés : ' + intervenants().join(', ') : '' }, { k: 'observations', l: 'Consignes', t: 'textarea' },
      { k: 'logements', l: 'Logements concernés', t: 'multi', o: L.map(l => [l.id, libLog(l) + ' – ' + l.statut]) }];
    formulaire(idModif ? 'Modifier l\'intervention' : 'Planifier une intervention – ' + nomCh(idc), champs, Object.assign({ type: 'Passage', logements: logementsPre || [] }, base), { large: true, ok: idModif ? 'Enregistrer' : 'Planifier', surChange: v => M.alertesIntervention(Object.assign({}, v, { statut: 'Planifiée' }), v.logements, idModif) }).then(async v => {
      if (!v) return; const lg = v.logements; delete v.logements;
      const al = M.alertesIntervention(Object.assign({ statut: 'Planifiée' }, v), lg, idModif);
      if (al.length && !await confirmer('Alertes détectées :<br>• ' + al.map(esc).join('<br>• ') + '<br><br>Enregistrer quand même ?', { l: 'Enregistrer malgré tout' })) return;
      if (idModif) { await action(async () => { await M.majIntervention(idModif, v); const deja = q('SELECT id_logement FROM passages WHERE id_intervention=?', [idModif]).map(r => r.id_logement); const nv = lg.filter(x => !deja.includes(x)); if (nv.length) await M.ajouterAuPassage(idModif, nv); }, 'Intervention modifiée'); }
      else await action(() => M.creerIntervention(Object.assign({ id_chantier: idc }, v), lg), 'Intervention planifiée');
      APP.rafraichir();
    });
  }
  PAGES.planning = { titre: 'Planning', rendu(z) {
    let vue = sessionStorage.getItem('eo_vue') || 'semaine', ref = sessionStorage.getItem('eo_ref') || DB.today(), fi = sessionStorage.getItem('eo_fi') || '', ft = sessionStorage.getItem('eo_ft') || '', fst = sessionStorage.getItem('eo_fst') || '';
    const d0 = new Date(ref + 'T12:00'), iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), aj = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    let debut, fin;
    if (vue === 'jour') { debut = fin = iso(d0); } else if (vue === 'semaine') { const l = aj(d0, -((d0.getDay() + 6) % 7)); debut = iso(l); fin = iso(aj(l, 6)); } else { const p = new Date(d0.getFullYear(), d0.getMonth(), 1, 12), l = aj(p, -((p.getDay() + 6) % 7)); debut = iso(l); fin = iso(aj(l, 41)); }
    const c = ch(), IV = intervenants();
    const h = document.createElement('div'); h.className = 'carte';
    h.innerHTML = `<div class="ligne"><span class="ligne">${['jour', 'semaine', 'mois'].map(v => `<button class="b ${v === vue ? '' : 'g'} p" data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</span>
      <button class="b g p" data-d="-1">◀</button><button class="b g p" data-d="0">Aujourd'hui</button><button class="b g p" data-d="1">▶</button>
      <b>${vue === 'mois' ? d0.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : vue === 'jour' ? d0.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Semaine du ' + dateFr(debut) + ' au ' + dateFr(fin)}</b>
      <span style="margin-left:auto" class="ligne"><select id="fi"><option value="">Tous intervenants</option>${IV.map(i => `<option ${i === fi ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select>
      <select id="ft"><option value="">Tous types</option>${TYPES_INT.map(i => `<option ${i === ft ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select>
      <select id="fst"><option value="">Tous statuts</option>${['Planifiée', 'Réalisée', 'Annulée'].map(i => `<option ${i === fst ? 'selected' : ''}>${i}</option>`).join('')}</select>
      <button class="b" id="nv">Planifier</button></span></div>`;
    z.appendChild(h);
    const sv = (k, v) => { sessionStorage.setItem(k, v); APP.rafraichir(); };
    $$('[data-v]', h).forEach(b => b.onclick = () => sv('eo_vue', b.dataset.v));
    $$('[data-d]', h).forEach(b => b.onclick = () => { const n = +b.dataset.d; sv('eo_ref', n === 0 ? DB.today() : iso(vue === 'mois' ? new Date(d0.getFullYear(), d0.getMonth() + n, 1, 12) : aj(d0, n * (vue === 'jour' ? 1 : 7)))); });
    $('#fi', h).onchange = e => sv('eo_fi', e.target.value); $('#ft', h).onchange = e => sv('eo_ft', e.target.value); $('#fst', h).onchange = e => sv('eo_fst', e.target.value);
    bouton(h, '#nv', () => { const x = exigerCh(); if (x) nouvelleIntervention({ id_chantier: x, date: vue === 'jour' ? debut : '' }); });
    const w = ['i.date BETWEEN ? AND ?'], p = [debut, fin]; if (c) { w.push('i.id_chantier=?'); p.push(c); } if (fi) { w.push('i.intervenant=?'); p.push(fi); } if (ft) { w.push('i.type=?'); p.push(ft); } if (fst) { w.push('i.statut=?'); p.push(fst); }
    const I = q('SELECT i.*,c.nom ch,(SELECT COUNT(*) FROM passages WHERE id_intervention=i.id) n,(SELECT COUNT(*) FROM passages WHERE id_intervention=i.id AND resultat<>\'\') ns FROM interventions i JOIN chantiers c ON c.id=i.id_chantier WHERE ' + w.join(' AND ') + ' ORDER BY i.date,i.heure_debut', p);
    // alertes de la période
    const A = []; for (const i of I.filter(i => i.statut === 'Planifiée')) { const lg = q('SELECT id_logement FROM passages WHERE id_intervention=?', [i.id]).map(r => r.id_logement); for (const m of M.alertesIntervention(i, lg, i.id)) A.push(dateFr(i.date) + ' ' + (i.heure_debut || '') + ' – ' + i.ch + ' : ' + m); }
    if (A.length) { const a = document.createElement('div'); a.innerHTML = [...new Set(A)].map(x => `<div class="alerte-l">⚠ ${esc(x)}</div>`).join(''); z.appendChild(a); }
    const cls = i => i.statut === 'Réalisée' ? 'vert' : i.statut === 'Annulée' ? 'gris' : i.date < DB.today() ? 'rouge' : '';
    const ev = i => `<span class="ev ${cls(i)}" data-i="${i.id}" title="${esc(i.ch + ' – ' + i.type + ' – ' + i.n + ' logement(s)' + (i.intervenant ? ' – ' + i.intervenant : ''))}">${esc((i.heure_debut ? i.heure_debut + ' ' : '') + i.type + ' · ' + i.n + ' lgt' + (i.intervenant ? ' · ' + i.intervenant : ''))}${c ? '' : '<br><small>' + esc(i.ch) + '</small>'}</span>`;
    const cc = document.createElement('div'); cc.className = 'carte'; z.appendChild(cc);
    if (vue === 'jour') { cc.innerHTML = I.length ? '<table class="t"><tr><th>Horaire</th><th>Chantier</th><th>Type</th><th>Intervenant</th><th>Logements</th><th>Saisis</th><th>Statut</th></tr>' + I.map(i => `<tr class="cl" data-i="${i.id}"><td>${esc((i.heure_debut || '') + (i.heure_fin ? ' – ' + i.heure_fin : ''))}</td><td>${esc(i.ch)}</td><td>${esc(i.type)}</td><td>${esc(i.intervenant)}</td><td>${i.n}</td><td>${i.ns}/${i.n}</td><td>${pastille(i.statut)}</td></tr>`).join('') + '</table>' : '<p class="s">Aucune intervention ce jour.</p>'; }
    else { const nb = vue === 'semaine' ? 7 : 42, mo = d0.getMonth(); let html = '<div class="cal">' + ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(j => `<div class="tete">${j}</div>`).join('');
      for (let k = 0; k < nb; k++) { const d = aj(new Date(debut + 'T12:00'), k), s = iso(d); html += `<div class="j ${vue === 'mois' && d.getMonth() !== mo ? 'hors' : ''} ${s === DB.today() ? 'auj' : ''}" style="${vue === 'semaine' ? 'min-height:300px' : ''}"><b>${d.getDate()}</b>${I.filter(i => i.date === s).map(ev).join('')}</div>`; }
      cc.innerHTML = html + '</div>'; }
    $$('[data-i]', cc).forEach(e => e.onclick = () => APP.aller('interventions:' + e.dataset.i));
  } };
  // ================= SUIVI DES INTERVENTIONS
  PAGES.interventions = { titre: 'Suivi des interventions', rendu(z, p) {
    if (p.id) return ficheIntervention(z, p.id);
    const c = ch(); let o = sessionStorage.getItem('eo_oi') || 'liste';
    onglets(z, [['liste', 'Interventions'], ['reprendre', 'Absences, inaccessibles et repassages']], o, x => { sessionStorage.setItem('eo_oi', x); APP.rafraichir(); });
    if (o === 'reprendre') return aReprendre(z, c);
    listeInterventions(z, c);
  } };
  function listeInterventions(z, idc) {
    const cc = carte(z, 'Interventions' + (idc ? ' – ' + esc(nomCh(idc)) : ''), idc ? '<button class="b" id="nv">Planifier</button>' : '');
    tableau(cc, q('SELECT i.*,c.nom ch,(SELECT COUNT(*) FROM passages WHERE id_intervention=i.id) n,(SELECT COUNT(*) FROM passages WHERE id_intervention=i.id AND resultat<>\'\') ns FROM interventions i JOIN chantiers c ON c.id=i.id_chantier' + (idc ? ' WHERE i.id_chantier=?' : '') + ' ORDER BY i.date DESC,i.heure_debut', idc ? [idc] : []),
      [{ k: 'date', l: 'Date', f: r => dateFr(r.date) }, { k: 'heure_debut', l: 'Heure' }, ...(idc ? [] : [{ k: 'ch', l: 'Chantier' }]), { k: 'type', l: 'Type' }, { k: 'intervenant', l: 'Intervenant' }, { k: 'n', l: 'Logements' }, { k: 'ns', l: 'Résultats saisis', f: r => r.ns + ' / ' + r.n }, { k: 'statut', l: 'Statut', f: r => pastille(r.statut) + (r.statut === 'Planifiée' && r.date < DB.today() ? ' <span class="pa rouge">en retard</span>' : '') }, { k: 'origine', l: 'Origine' }],
      { clic: i => APP.aller('interventions:' + i), vide: 'Aucune intervention.' });
    bouton(cc.parentNode, '#nv', () => nouvelleIntervention({ id_chantier: idc }));
  }
  function aReprendre(z, idc) {
    const cc = carte(z, 'Logements à reprendre', '<button class="b" id="pl">Planifier un repassage pour la sélection</button>');
    const L = q("SELECT l.*,c.nom ch,(SELECT COUNT(*) FROM passages p WHERE p.id_logement=l.id AND p.resultat<>'') np FROM logements l JOIN chantiers c ON c.id=l.id_chantier WHERE l.statut IN ('Absent','Inaccessible','À repasser','Refus d''accès','Problème technique')" + (idc ? ' AND l.id_chantier=?' : '') + ' ORDER BY l.repassage,c.nom,l.adresse,l.numero', idc ? [idc] : []);
    const T = tableau(cc, L, [...(idc ? [] : [{ k: 'ch', l: 'Chantier' }]), { k: 'adresse', l: 'Adresse' }, { k: 'batiment', l: 'Bât.' }, { k: 'numero', l: 'N°' }, { k: 'statut', l: 'Statut', f: r => pastille(r.statut) }, { k: 'np', l: 'Passages' }, { k: 'repassage', l: 'Repassage prévu', f: r => r.repassage ? dateFr(r.repassage) + (r.repassage < DB.today() ? ' <span class="pa rouge">dépassé</span>' : '') : '<span class="pa orange">à fixer</span>' }, { k: 'observation', l: 'Observation' }], { select: true, clic: ficheLogement, vide: 'Aucun logement à reprendre.' });
    bouton(cc.parentNode, '#pl', () => { const s = T.selection(); if (!s.length) return toast('Cochez des logements', 'ko'); const cs = [...new Set(L.filter(l => s.includes(l.id)).map(l => l.id_chantier))]; if (cs.length > 1) return toast('Sélectionnez des logements d\'un seul chantier', 'ko'); nouvelleIntervention({ id_chantier: cs[0], type: 'Repassage' }, s); });
  }
  function ficheIntervention(z, iid) {
    const it = q('SELECT i.*,c.nom ch FROM interventions i JOIN chantiers c ON c.id=i.id_chantier WHERE i.id=?', [iid])[0]; if (!it) { z.innerHTML = '<div class="ko-l">Intervention introuvable.</div>'; return; }
    $('#titre').textContent = it.type + ' du ' + dateFr(it.date);
    const h = document.createElement('div'); h.className = 'carte';
    h.innerHTML = `<div class="ligne"><button class="b g" id="ret">← Retour</button>${pastille(it.statut)}<b>${esc(it.ch)}</b><span class="s">${esc([it.heure_debut && it.heure_debut + (it.heure_fin ? '–' + it.heure_fin : ''), it.intervenant, it.origine && 'origine : ' + it.origine].filter(Boolean).join(' · '))}</span>
      <span style="margin-left:auto" class="ligne">${it.statut === 'Planifiée' ? '<button class="b g" id="mod">Modifier / ajouter des logements</button><button class="b g" id="ann">Annuler l\'intervention</button>' : ''}<button class="b g" id="rap">Rapport de visite</button><button class="b g" id="avis">Avis de passage</button></span></div>${it.observations ? '<p>' + esc(it.observations) + '</p>' : ''}`;
    z.appendChild(h);
    bouton(h, '#ret', () => history.length > 1 ? history.back() : APP.aller('interventions'));
    bouton(h, '#ann', async () => { if (await confirmer('Annuler cette intervention ? Les logements non saisis repassent « À planifier ».', { l: 'Annuler l\'intervention', danger: 1 })) { await action(() => M.majIntervention(iid, { statut: 'Annulée' }), 'Intervention annulée'); APP.rafraichir(); } });
    bouton(h, '#mod', () => nouvelleIntervention(Object.assign({}, it, { logements: q('SELECT id_logement FROM passages WHERE id_intervention=?', [iid]).map(r => r.id_logement) }), q('SELECT id_logement FROM passages WHERE id_intervention=?', [iid]).map(r => r.id_logement), iid));
    bouton(h, '#rap', () => PD.rapportPour(it.id_chantier, iid));
    bouton(h, '#avis', () => PD.avisPour(it.id_chantier, q('SELECT id_logement FROM passages WHERE id_intervention=?', [iid]).map(r => r.id_logement), iid));
    const cc = carte(z, 'Résultats des passages', '<button class="b g" id="tous">Marquer les non saisis « Intervention réalisée »</button>');
    const PS = q('SELECT p.*,l.adresse,l.batiment,l.cage,l.numero,l.statut,l.id_chantier,(SELECT COUNT(*) FROM photos WHERE id_passage=p.id) nph FROM passages p JOIN logements l ON l.id=p.id_logement WHERE p.id_intervention=? ORDER BY l.adresse,l.batiment,CAST(l.numero AS INTEGER),l.numero', [iid]);
    cc.innerHTML = PS.length ? `<div class="tw"><table class="t"><tr><th>Logement</th><th>Statut actuel</th><th>Résultat</th><th>Observation</th><th>Actions à mener</th><th>Repassage</th><th></th></tr>${PS.map(p => `<tr data-p="${p.id}"><td><a style="cursor:pointer" data-l="${p.id_logement}"><b>${esc(libLog(p))}</b></a></td><td>${pastille(p.statut)}</td>
      <td><select data-k="resultat"><option value=""></option>${DB.RESULTATS.map(r => `<option ${r === p.resultat ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></td>
      <td><input data-k="observation" value="${esc(p.observation)}" style="width:100%;min-width:160px"></td><td><input data-k="actions" value="${esc(p.actions)}" style="width:100%;min-width:120px"></td><td><input type="date" data-k="repassage" value="${esc(p.repassage)}"></td>
      <td class="ligne" style="flex-wrap:nowrap"><button class="b p" data-ok>Enregistrer</button><button class="b g p" data-ph title="Photos">📷${p.nph ? ' ' + p.nph : ''}</button><button class="b g p" data-an title="Anomalie">⚠</button></td></tr>`).join('')}</table></div><p class="s">« Absent », « Inaccessible », « À repasser » : indiquez la date de repassage si elle est connue. Rien n'est enregistré sans clic sur « Enregistrer ».</p>` : '<p class="s">Aucun logement dans cette intervention.</p>';
    $$('[data-l]', cc).forEach(a => a.onclick = () => ficheLogement(a.dataset.l));
    $$('tr[data-p]', cc).forEach(tr => {
      const lire = () => Object.fromEntries($$('[data-k]', tr).map(e => [e.dataset.k, e.value]));
      $('[data-ok]', tr).onclick = async () => { const v = lire(); if (!v.resultat) return toast('Choisissez un résultat', 'ko'); if (await action(() => M.enregistrerResultat(tr.dataset.p, v), 'Résultat enregistré') !== undefined) APP.rafraichir(); };
      const p = PS.find(x => x.id === tr.dataset.p);
      $('[data-ph]', tr).onclick = async () => { if (await ajouterPhotos({ id_chantier: p.id_chantier, id_logement: p.id_logement, id_passage: p.id })) APP.rafraichir(); };
      $('[data-an]', tr).onclick = () => nouvelleAnomalie({ id_chantier: p.id_chantier, id_logement: p.id_logement, description: lire().observation });
    });
    bouton(cc.parentNode, '#tous', async () => { const n = PS.filter(p => !p.resultat); if (!n.length) return toast('Tous les résultats sont déjà saisis'); if (!await confirmer(n.length + ' logement(s) seront marqués « Intervention réalisée ». Confirmer ?')) return;
      await action(() => DB.tx(() => { for (const p of n) M.enregistrerResultatSansTx(p.id, { resultat: 'Intervention réalisée' }, 'saisie groupée PC'); }), 'Résultats enregistrés'); APP.rafraichir(); });
  }
  // ================= ANOMALIES
  const CHAMPS_AN = idc => [{ k: 'description', l: 'Description', t: 'textarea', req: 1 }, { k: 'id_logement', l: 'Logement concerné', t: 'select', o: q('SELECT * FROM logements WHERE id_chantier=? ORDER BY adresse,CAST(numero AS INTEGER)', [idc]).map(l => [l.id, libLog(l)]) }, { k: 'date', l: 'Date de constat', t: 'date' },
    { k: 'priorite', l: 'Priorité', t: 'select', o: DB.PRIORITES, vide: false }, { k: 'statut', l: 'Statut', t: 'select', o: DB.STATUTS_ANOMALIE, vide: false }, { k: 'responsable', l: 'Responsable' }, { k: 'echeance', l: 'Échéance', t: 'date' }, { k: 'action', l: 'Action prévue / réalisée', t: 'textarea' }];
  async function nouvelleAnomalie(base) { const v = await formulaire('Nouvelle anomalie – ' + nomCh(base.id_chantier), CHAMPS_AN(base.id_chantier), Object.assign({ date: DB.today(), priorite: 'Normale', statut: 'Nouvelle' }, base)); if (v) { await action(() => M.creerAnomalie(Object.assign({ id_chantier: base.id_chantier }, v)), 'Anomalie enregistrée'); APP.rafraichir(); } }
  PAGES.anomalies = { titre: 'Anomalies', rendu(z, p) { listeAnomalies(z, ch()); if (p.id) ficheAnomalie(p.id); } };
  function listeAnomalies(z, idc) {
    const fo = sessionStorage.getItem('eo_fa') || 'ouvertes';
    const cc = carte(z, 'Anomalies' + (idc ? ' – ' + esc(nomCh(idc)) : ''), `<select id="fa">${[['ouvertes', 'Ouvertes'], ['toutes', 'Toutes'], ...DB.STATUTS_ANOMALIE.map(s => [s, s])].map(([v, l]) => `<option value="${v}" ${v === fo ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="b" id="nv">Nouvelle anomalie</button>`);
    const w = [], p = []; if (idc) { w.push('a.id_chantier=?'); p.push(idc); } if (fo === 'ouvertes') w.push("a.statut NOT IN ('Résolue','Clôturée')"); else if (fo !== 'toutes') { w.push('a.statut=?'); p.push(fo); }
    const L = q('SELECT a.*,c.nom ch,l.adresse,l.numero,l.batiment,l.cage FROM anomalies a JOIN chantiers c ON c.id=a.id_chantier LEFT JOIN logements l ON l.id=a.id_logement' + (w.length ? ' WHERE ' + w.join(' AND ') : '') + " ORDER BY CASE a.priorite WHEN 'Urgente' THEN 0 WHEN 'Haute' THEN 1 WHEN 'Normale' THEN 2 ELSE 3 END,a.date DESC", p);
    tableau(cc, L, [{ k: 'date', l: 'Date', f: r => dateFr(r.date) }, ...(idc ? [] : [{ k: 'ch', l: 'Chantier' }]), { k: 'numero', l: 'Logement', txt: r => r.numero ? libLog(r) : '', f: r => r.numero ? esc(libLog(r)) : '<span class="s">général</span>' }, { k: 'description', l: 'Description' }, { k: 'priorite', l: 'Priorité', f: r => pastille(r.priorite) }, { k: 'statut', l: 'Statut', f: r => pastille(r.statut) }, { k: 'responsable', l: 'Responsable' }, { k: 'echeance', l: 'Échéance', f: r => dateFr(r.echeance) + (r.echeance && r.echeance < DB.today() && !['Résolue', 'Clôturée'].includes(r.statut) ? ' <span class="pa rouge">dépassée</span>' : '') }, { k: 'source', l: 'Source' }], { clic: ficheAnomalie, vide: 'Aucune anomalie.' });
    $('#fa', cc.parentNode).onchange = e => { sessionStorage.setItem('eo_fa', e.target.value); APP.rafraichir(); };
    bouton(cc.parentNode, '#nv', () => { const x = idc || exigerCh(); if (x) nouvelleAnomalie({ id_chantier: x }); });
  }
  function ficheAnomalie(aid) {
    const a = q('SELECT * FROM anomalies WHERE id=?', [aid])[0]; if (!a) return;
    const hs = q("SELECT * FROM historique WHERE objet='anomalie' AND id_objet=? ORDER BY id DESC", [aid]);
    const m = fenetre('Anomalie – ' + nomCh(a.id_chantier), `<div class="ligne" style="margin-bottom:8px">${pastille(a.priorite)}${pastille(a.statut)}<span style="margin-left:auto" class="ligne"><button class="b g p" id="ph">Ajouter des photos</button><button class="b p" id="mod">Modifier / changer le statut</button></span></div>
      <p style="white-space:pre-wrap">${esc(a.description)}</p><dl class="fiche"><dt>Constat</dt><dd>${dateFr(a.date)}</dd><dt>Responsable</dt><dd>${esc(a.responsable) || '—'}</dd><dt>Échéance</dt><dd>${dateFr(a.echeance) || '—'}</dd><dt>Action</dt><dd>${esc(a.action) || '—'}</dd><dt>Source</dt><dd>${esc(a.source)}</dd></dl>
      <h4>Photos</h4><div id="vg"></div><h4>Historique</h4><table class="t">${hs.map(h => `<tr><td class="s">${dateFr(h.quand)}</td><td>${esc(h.resume)}</td></tr>`).join('')}</table>`, true);
    vignettes($('#vg', m), 'id_anomalie=?', [aid]);
    bouton(m, '#mod', async () => { const v = await formulaire('Modifier l\'anomalie', CHAMPS_AN(a.id_chantier), a); if (v) { v.id_logement = v.id_logement || null; await action(() => M.majAnomalie(aid, v), 'Anomalie mise à jour'); m.remove(); APP.rafraichir(); } });
    bouton(m, '#ph', async () => { if (await ajouterPhotos({ id_chantier: a.id_chantier, id_logement: a.id_logement, id_anomalie: aid })) vignettes($('#vg', m), 'id_anomalie=?', [aid]); });
  }
  // ================= ÉCHÉANCIER
  PAGES.echeancier = { titre: 'Échéancier', rendu(z) {
    const c = ch(), t = DB.today(), fp = sessionStorage.getItem('eo_fp') || 'avenir';
    const cc = carte(z, 'Échéancier' + (c ? ' – ' + esc(nomCh(c)) : ''), `<select id="fp">${[['avenir', 'À venir et en retard'], ['retard', 'En retard'], ['tout', 'Tout']].map(([v, l]) => `<option value="${v}" ${v === fp ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="b" id="nv">Nouvelle échéance</button>`);
    let E = M.toutesEcheances(c || null).map((e, k) => Object.assign(e, { id: e.id || 'x' + k }));
    if (fp === 'avenir') E = E.filter(e => e.date >= t || !['Fait', 'Réalisée', 'Terminé', 'Résolue', 'Clôturée'].includes(e.statut)); if (fp === 'retard') E = E.filter(e => e.date < t && !['Fait', 'Réalisée'].includes(e.statut));
    tableau(cc, E, [{ k: 'date', l: 'Date', f: r => dateFr(r.date) + (r.date < t && r.statut !== 'Fait' ? ' <span class="pa rouge">dépassée</span>' : r.date === t ? ' <span class="pa bleu">aujourd\'hui</span>' : '') }, { k: 'type', l: 'Type', f: r => pastille(r.type) }, { k: 'titre', l: 'Objet' }, ...(c ? [] : [{ k: 'chantier', l: 'Chantier' }]), { k: 'statut', l: 'Statut', f: r => pastille(r.statut) }, { k: 'source', l: 'Module' },
      { k: 'x', l: '', f: r => r.modifiable && r.statut !== 'Fait' ? `<button class="b g p" data-f="${r.id}">Fait</button>` : '' }], { tri: 'date', apres: tb => $$('[data-f]', tb).forEach(b => b.onclick = async () => { await action(() => M.majEcheance(b.dataset.f, { statut: 'Fait' }), 'Échéance soldée'); APP.rafraichir(); }) });
    $('#fp', cc.parentNode).onchange = e => { sessionStorage.setItem('eo_fp', e.target.value); APP.rafraichir(); };
    bouton(cc.parentNode, '#nv', async () => { const v = await formulaire('Nouvelle échéance', [{ k: 'titre', l: 'Objet', req: 1 }, { k: 'date', l: 'Date', t: 'date', req: 1 }, { k: 'type', l: 'Type', t: 'select', o: ['Action', 'Relance', 'Livrable', 'Réunion', 'Rendu DOE', 'Délai contractuel', 'Autre'], vide: false }, { k: 'id_chantier', l: 'Chantier', t: 'select', o: chOpts() }, { k: 'source', l: 'Origine de l\'échéance', aide: 'ex. CR de réunion du …, mail du …' }, { k: 'notes', l: 'Notes', t: 'textarea' }], { id_chantier: c }); if (v) { await action(() => M.creerEcheance(v), 'Échéance créée'); APP.rafraichir(); } });
  } };
  // ================= PARAMÈTRES ET SAUVEGARDES
  PAGES.parametres = { titre: 'Paramètres et sauvegardes', async rendu(z) {
    const s = carte(z, 'Sauvegardes de la base', '<button class="b" id="sv">Sauvegarder maintenant</button>');
    const L = await DB.listeSauvegardes();
    s.innerHTML = `<p class="s">Une sauvegarde automatique est faite chaque jour d'utilisation dans le sous-dossier « sauvegardes ». Une restauration crée d'abord une sauvegarde de l'état actuel.</p>` + (L.length ? '<table class="t"><tr><th>Fichier</th><th>Date</th><th>Taille</th><th></th></tr>' + L.map(f => `<tr><td>${esc(f.nom)}</td><td>${new Date(f.date).toLocaleString('fr-FR')}</td><td>${Math.round(f.taille / 1024)} Ko</td><td><button class="b g p" data-r="${esc(f.nom)}">Restaurer</button></td></tr>`).join('') + '</table>' : '<p class="s">Aucune sauvegarde pour l\'instant.</p>');
    bouton(s.parentNode, '#sv', async () => { const n = await action(() => DB.sauvegarde('manuelle')); if (n) { toast('Sauvegarde créée'); APP.rafraichir(); } });
    $$('[data-r]', s).forEach(b => b.onclick = async () => { if (await confirmer('Restaurer « ' + esc(b.dataset.r) + ' » ? L\'état actuel sera d\'abord sauvegardé.', { l: 'Restaurer', danger: 1 })) { await action(() => DB.restaurer(b.dataset.r), 'Base restaurée'); APP.remplirChantiers(); APP.rafraichir(); } });
    const i = carte(z, 'Contrôle de la base', '<button class="b g" id="ic">Vérifier l\'intégrité</button>');
    const T = ['chantiers', 'logements', 'interventions', 'passages', 'anomalies', 'documents', 'photos', 'etudes', 'equipements', 'listings', 'demandes_prix', 'historique', 'paquets'];
    i.innerHTML = '<table class="t">' + T.map(t => `<tr><td>${t}</td><td>${un('SELECT COUNT(*) FROM ' + t)}</td></tr>`).join('') + `</table><p class="s">Poste : ${esc(DB.appareil)} · schéma ${esc(un("SELECT v FROM meta WHERE k='schema'"))} · application ${EO.VERSION_APP}</p>`;
    bouton(i.parentNode, '#ic', () => { const r = DB.brut.exec('PRAGMA integrity_check')[0].values[0][0]; r === 'ok' ? toast('Base intègre') : toast('Problème : ' + r, 'ko'); });
    const j = carte(z, 'Journal technique (50 derniers)');
    j.innerHTML = '<table class="t">' + q('SELECT * FROM journal ORDER BY id DESC LIMIT 50').map(x => `<tr><td class="s">${dateFr(x.quand)}</td><td>${esc(x.evenement)}</td><td>${esc(x.detail)}</td></tr>`).join('') + '</table>';
  } };
  return { carte, bouton, onglets, chOpts, nomCh, libLog, exigerCh, ficheLogement, nouvelleIntervention, nouvelleAnomalie, ajouterPhotos, vignettes, listeLogements };
})();
