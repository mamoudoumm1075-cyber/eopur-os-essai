// EOPUR OS – échanges avec le téléphone par OneDrive (passerelle de transfert uniquement ; la base du PC reste la seule source de vérité)
// Paquets zip contrôlés par empreintes, idempotence par identifiant de paquet et d'opération, conflits par révision, accusés « reçu » puis « intégré ».
const SY = (() => {
  const { esc, toast, dateFr, pastille, confirmer, action } = UI, q = DB.q, un = DB.un;
  let od = null; // dossier OneDrive EOPUR_OS
  const idb = () => new Promise((ok, ko) => { const r = indexedDB.open('eopur_os_pc', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  async function kv(k, v) { const d = await idb(); return new Promise((ok, ko) => { const s = d.transaction('k', v === undefined ? 'readonly' : 'readwrite').objectStore('k'); const r = v === undefined ? s.get(k) : s.put(v, k); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); }
  async function dossier(choisir) {
    if (od && !choisir) return od;
    let h = choisir ? null : await kv('onedrive').catch(() => null);
    if (h && await h.queryPermission({ mode: 'readwrite' }) !== 'granted' && await h.requestPermission({ mode: 'readwrite' }) !== 'granted') h = null;
    if (!h) { h = await showDirectoryPicker({ id: 'eopur_onedrive', mode: 'readwrite' }); await kv('onedrive', h); }
    for (const s of ['vers_telephone', 'vers_pc', 'traites']) await h.getDirectoryHandle(s, { create: true });
    od = h; return h;
  }
  const sous = async n => (await dossier()).getDirectoryHandle(n, { create: true });
  async function ecrire(d, nom, data) { const h = await d.getFileHandle(nom, { create: true }), w = await h.createWritable(); await w.write(data); await w.close(); }
  // ---------- PC → téléphone : instantané du chantier (strict nécessaire)
  async function preparer(idc, avecNoms) {
    const c = q('SELECT id,reference,nom,adresse,ville,revision FROM chantiers WHERE id=?', [idc])[0];
    const L = q('SELECT id,adresse,ville,batiment,cage,etage,numero,typo,' + (avecNoms ? 'occupant,telephone,' : '') + 'statut,observation,repassage,revision FROM logements WHERE id_chantier=? ORDER BY adresse,batiment,cage,CAST(numero AS INTEGER),numero', [idc]);
    const I = q("SELECT id,date,heure_debut,heure_fin,intervenant,type,statut,observations FROM interventions WHERE id_chantier=? AND statut='Planifiée' ORDER BY date,heure_debut", [idc]);
    for (const i of I) i.passages = q('SELECT id,id_logement,resultat FROM passages WHERE id_intervention=?', [i.id]);
    const A = q("SELECT id,id_logement,date,description,priorite,statut FROM anomalies WHERE id_chantier=? AND statut NOT IN ('Résolue','Clôturée')", [idc]);
    const contenu = { chantier: c, logements: L, interventions: I, anomalies: A, statuts: DB.STATUTS_LOGEMENT, resultats: DB.RESULTATS, priorites: DB.PRIORITES, emis_le: DB.now() };
    const p = await EO.fabriquer('chantier', DB.appareil, [{ nom: 'chantier.json', data: JSON.stringify(contenu) }], { id_chantier: idc, nom_chantier: c.nom });
    await ecrire(await sous('vers_telephone'), p.nom, p.blob);
    await DB.tx(() => { DB.run('INSERT INTO paquets VALUES(?,?,?,?,?,?,?,?,?,?)', [p.id, p.empreinte, 'chantier', 'emis', DB.appareil, p.manifeste.cree_le, null, null, 'déposé', p.nom]); DB.journal('paquet chantier déposé', p.nom + ' – ' + L.length + ' logements, ' + I.length + ' intervention(s)'); });
    return { p, n: L.length, ni: I.length };
  }
  async function accuse(idPaquet, stade, lignes) {
    const p = await EO.fabriquer('accuse', DB.appareil, [{ nom: 'accuse.json', data: JSON.stringify({ id_paquet_recu: idPaquet, stade, emis_le: DB.now(), operations: lignes }) }]);
    await ecrire(await sous('vers_telephone'), p.nom, p.blob);
    DB.run('INSERT INTO paquets VALUES(?,?,?,?,?,?,?,?,?,?)', [p.id, p.empreinte, 'accuse', 'emis', DB.appareil, p.manifeste.cree_le, null, null, 'déposé (' + stade + ')', p.nom]); await DB.sauver();
  }
  async function deplacer(nom) { try { const vp = await sous('vers_pc'), f = await (await vp.getFileHandle(nom)).getFile(); await ecrire(await sous('traites'), nom, await f.arrayBuffer()); await vp.removeEntry(nom); } catch (e) { DB.journal('déplacement impossible', nom + ' : ' + e.message); } }
  const etatOp = id => { const o = q('SELECT etat,motif FROM operations_recues WHERE id_operation=?', [id])[0]; return o ? { id_operation: id, resultat: o.etat, motif: o.motif } : null; };
  // conflit : le logement a été modifié par un autre que ce téléphone depuis la révision qu'il connaissait
  function conflit(op, appareil) {
    if (!op.id_logement || op.revision_base == null) return null;
    const l = q('SELECT * FROM logements WHERE id=?', [op.id_logement])[0]; if (!l) return 'logement inconnu';
    if (l.revision <= op.revision_base) return null;
    const autres = q("SELECT detail FROM historique WHERE objet='logement' AND id_objet=? AND auteur<>?", [op.id_logement, appareil]).map(h => { try { return JSON.parse(h.detail || '{}').revision; } catch (e) { return 0; } }).filter(r => r > op.revision_base);
    return autres.length ? 'logement modifié sur le PC depuis la préparation du paquet (révision ' + op.revision_base + ' → ' + l.revision + ')' : null;
  }
  // ---------- lecture de vers_pc : contrôle sans rien intégrer
  let propositions = [];
  async function analyser() {
    const vp = await sous('vers_pc'); propositions = [];
    for await (const [nom, h] of vp.entries()) {
      if (h.kind !== 'file' || !nom.endsWith('.zip')) continue;
      const pr = { nom, ops: [], etat: 'à intégrer' }; propositions.push(pr);
      let p; try { p = await EO.lire(await (await h.getFile()).arrayBuffer()); } catch (e) { pr.etat = 'illisible'; pr.erreur = e.message + ' – laissé en place (transfert peut-être incomplet), sera relu'; DB.journal('paquet non lisible', nom + ' : ' + e.message); continue; }
      pr.p = p; pr.m = p.m;
      if (p.m.type !== 'operations') { pr.etat = 'ignoré'; pr.erreur = 'type « ' + p.m.type + ' » : pas un paquet du téléphone'; continue; }
      const connu = q('SELECT etat FROM paquets WHERE id_paquet=?', [p.m.id_paquet])[0];
      const ops = p.json('operations.json');
      if (connu && connu.etat === 'intégré') { pr.etat = 'déjà intégré'; await accuse(p.m.id_paquet, 'integre', ops.map(o => etatOp(o.id_operation)).filter(Boolean)); await deplacer(nom); continue; }
      for (const o of ops) {
        const li = { o, res: 'ok', motif: '' }; pr.ops.push(li);
        if (un('SELECT COUNT(*) FROM operations_recues WHERE id_operation=?', [o.id_operation])) { li.res = 'doublon'; li.motif = 'déjà reçue'; continue; }
        if (o.id_logement && !un('SELECT COUNT(*) FROM logements WHERE id=?', [o.id_logement])) { li.res = 'rejet'; li.motif = 'logement inconnu sur le PC'; continue; }
        if (o.type === 'photo') { if (!p.contenu[o.fichier]) { li.res = 'rejet'; li.motif = 'photographie absente du paquet'; } continue; }
        if (o.type === 'resultat' && !DB.RESULTATS.includes(o.resultat)) { li.res = 'rejet'; li.motif = 'résultat inconnu : ' + o.resultat; continue; }
        if (o.type === 'resultat' && o.id_passage && !un('SELECT COUNT(*) FROM passages WHERE id=?', [o.id_passage])) { li.res = 'rejet'; li.motif = 'passage inconnu (intervention supprimée ?)'; continue; }
        if (o.type === 'anomalie' && !String(o.description || '').trim()) { li.res = 'rejet'; li.motif = 'anomalie sans description'; continue; }
        const cf = ['resultat', 'observation'].includes(o.type) ? conflit(o, p.m.appareil) : null; if (cf) { li.res = 'conflit'; li.motif = cf; }
      }
      if (!connu) { DB.run('INSERT INTO paquets VALUES(?,?,?,?,?,?,?,?,?,?)', [p.m.id_paquet, p.empreinte, 'operations', 'recu', p.m.appareil, p.m.cree_le, DB.now(), null, 'reçu', nom]); DB.journal('paquet reçu et contrôlé', nom + ' – ' + ops.length + ' opération(s)'); await accuse(p.m.id_paquet, 'recu', ops.map(o => ({ id_operation: o.id_operation, resultat: 'recu' }))); }
    }
    return propositions;
  }
  // ---------- intégration : tout ou rien, après sauvegarde
  async function integrer(pr) {
    const m = pr.m, t = DB.now(), svg = await DB.sauvegarde('avant-integration');
    // les photos sont écrites avant la transaction (fichiers) ; leur enregistrement en base est dans la transaction
    const fichiersPhotos = {};
    for (const li of pr.ops.filter(l => l.res === 'ok' && l.o.type === 'photo')) { const l = q('SELECT id_chantier FROM logements WHERE id=?', [li.o.id_logement])[0]; const ch = 'photos/' + (l ? l.id_chantier : 'general') + '/' + li.o.id_operation + '.' + (li.o.fichier.split('.').pop() || 'jpg'); await DB.ecrireFichier(ch, pr.p.contenu[li.o.fichier]); fichiersPhotos[li.o.id_operation] = ch; }
    await DB.tx(async () => {
      const visites = {}; // passages hors planning : une intervention par jour et par appareil
      for (const li of pr.ops) {
        const o = li.o; let etat = li.res === 'ok' ? 'integree' : li.res === 'conflit' ? 'conflit' : li.res === 'doublon' ? 'doublon' : 'rejetee';
        if (li.res === 'doublon') continue;
        if (li.res === 'ok') {
          const auteur = m.appareil, src = 'téléphone';
          if (o.type === 'resultat') {
            let idp = o.id_passage;
            if (!idp) { const l = q('SELECT id_chantier FROM logements WHERE id=?', [o.id_logement])[0], jour = (o.cree_le || t).slice(0, 10), k = l.id_chantier + jour;
              if (!visites[k]) { visites[k] = DB.id('IT'); DB.run('INSERT INTO interventions(id,id_chantier,date,type,statut,intervenant,observations,origine,cree_le,maj_le) VALUES(?,?,?,?,?,?,?,?,?,?)', [visites[k], l.id_chantier, jour, 'Passage', 'Réalisée', o.intervenant || '', 'Passage saisi sur le téléphone hors planning', 'téléphone', t, t]); DB.hist('intervention', visites[k], l.id_chantier, 'passage hors planning reçu du téléphone', null, src, auteur); }
              idp = DB.id('PA'); DB.run('INSERT OR IGNORE INTO passages(id,id_intervention,id_logement) VALUES(?,?,?)', [idp, visites[k], o.id_logement]); idp = q('SELECT id FROM passages WHERE id_intervention=? AND id_logement=?', [visites[k], o.id_logement])[0].id; }
            M.enregistrerResultatSansTx(idp, o, src, auteur, o.id_operation);
          } else if (o.type === 'observation') DB.majLogement(o.id_logement, { observation: o.observation }, src, auteur);
          else if (o.type === 'anomalie') { const l = q('SELECT id_chantier FROM logements WHERE id=?', [o.id_logement])[0], idc = l ? l.id_chantier : o.id_chantier, ia = DB.id('AN');
            DB.run('INSERT INTO anomalies(id,id_chantier,id_logement,date,description,priorite,statut,source,cree_le,maj_le,id_operation) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [ia, idc, o.id_logement || null, (o.cree_le || t).slice(0, 10), o.description.trim(), DB.PRIORITES.includes(o.priorite) ? o.priorite : 'Normale', 'Nouvelle', 'téléphone', t, t, o.id_operation]);
            DB.hist('anomalie', ia, idc, 'anomalie reçue du téléphone : ' + o.description.slice(0, 80), null, src, auteur); }
          else if (o.type === 'photo') { const l = q('SELECT id_chantier FROM logements WHERE id=?', [o.id_logement])[0], b = pr.p.contenu[o.fichier];
            DB.run('INSERT INTO photos(id,id_chantier,id_logement,id_passage,fichier,sha256,taille,legende,cree_le,id_operation) VALUES(?,?,?,?,?,?,?,?,?,?)', [DB.id('PH'), l ? l.id_chantier : null, o.id_logement, o.id_passage || null, fichiersPhotos[o.id_operation], '', b.byteLength, o.legende || 'photo téléphone', o.cree_le || t, o.id_operation]); }
        }
        if (li.res === 'conflit') { const l = q('SELECT statut,observation,repassage,revision FROM logements WHERE id=?', [o.id_logement])[0]; DB.run('INSERT OR IGNORE INTO conflits(id_operation,id_logement,valeur_pc,valeur_mobile,etat) VALUES(?,?,?,?,?)', [o.id_operation, o.id_logement, JSON.stringify(l), JSON.stringify({ resultat: o.resultat, observation: o.observation, repassage: o.repassage, actions: o.actions }), 'ouvert']); }
        DB.run('INSERT INTO operations_recues VALUES(?,?,?,?,?,?,?,?,?)', [o.id_operation, m.id_paquet, o.type, etat, li.motif || '', t, etat === 'integree' ? t : null, o.cree_le, JSON.stringify(o)]);
      }
      DB.run("UPDATE paquets SET etat='intégré',integre_le=? WHERE id_paquet=?", [t, m.id_paquet]);
      DB.journal('paquet intégré', m.id_paquet + ' – sauvegarde préalable ' + svg);
    });
    await accuse(m.id_paquet, 'integre', pr.ops.map(li => etatOp(li.o.id_operation)).filter(Boolean)); await deplacer(pr.nom);
  }
  async function resoudre(idc, choix) {
    const c = q('SELECT * FROM conflits WHERE id=?', [idc])[0], o = q('SELECT * FROM operations_recues WHERE id_operation=?', [c.id_operation])[0], op = JSON.parse(o.contenu), ap = un('SELECT appareil FROM paquets WHERE id_paquet=?', [o.id_paquet]);
    await DB.tx(() => {
      if (choix === 'mobile') { if (op.type === 'resultat') { let idp = op.id_passage; if (!idp || !un('SELECT COUNT(*) FROM passages WHERE id=?', [idp])) { const l = q('SELECT id_chantier FROM logements WHERE id=?', [op.id_logement])[0], ii = DB.id('IT'); DB.run('INSERT INTO interventions(id,id_chantier,date,type,statut,observations,origine,cree_le,maj_le) VALUES(?,?,?,?,?,?,?,?,?)', [ii, l.id_chantier, (op.cree_le || DB.now()).slice(0, 10), 'Passage', 'Réalisée', 'Passage du téléphone (conflit tranché)', 'téléphone', DB.now(), DB.now()]); idp = DB.id('PA'); DB.run('INSERT INTO passages(id,id_intervention,id_logement) VALUES(?,?,?)', [idp, ii, op.id_logement]); } M.enregistrerResultatSansTx(idp, op, 'téléphone (conflit tranché)', ap, op.id_operation); } else DB.majLogement(op.id_logement, { observation: op.observation }, 'téléphone (conflit tranché)', ap); }
      DB.run('UPDATE conflits SET etat=?,decision=?,decide_le=? WHERE id=?', ['tranché', choix === 'mobile' ? 'valeur du téléphone retenue' : 'valeur du PC conservée', DB.now(), idc]);
      DB.run('UPDATE operations_recues SET etat=?,motif=?,integre_le=? WHERE id_operation=?', [choix === 'mobile' ? 'integree' : 'rejetee', choix === 'mobile' ? 'conflit tranché : téléphone retenu' : 'conflit tranché : PC conservé', DB.now(), c.id_operation]);
      DB.journal('conflit tranché', c.id_operation + ' : ' + choix);
    });
    await accuse(o.id_paquet, 'integre', [etatOp(c.id_operation)]);
  }
  // ================= PAGE
  PAGES.synchro = { titre: 'Téléphone et OneDrive', async rendu(z) {
    let nomOD = ''; try { const h = await kv('onedrive'); nomOD = h ? h.name : ''; } catch (e) { }
    const a = P.carte(z, 'Dossier d\'échange OneDrive', `<button class="b g" id="ch">${nomOD ? 'Changer de dossier' : 'Choisir le dossier OneDrive EOPUR_OS'}</button>`);
    a.innerHTML = `<p>${nomOD ? 'Dossier : <b>' + esc(nomOD) + '</b> (sous-dossiers vers_telephone, vers_pc, traites).' : 'Choisissez le dossier <b>OneDrive\\EOPUR_OS</b>.'} OneDrive ne sert qu'au transport des paquets ; la base reste sur le PC.</p>
      <p class="s">Téléphone : application EOPUR OS installée depuis Safari (<a href="mobile/" target="_blank">ouvrir l'application mobile</a>).</p>`;
    P.bouton(a.parentNode, '#ch', () => action(async () => { await dossier(true); APP.rafraichir(); }));
    const idc = APP.actif();
    const e = P.carte(z, 'Envoyer un chantier au téléphone');
    e.innerHTML = idc ? `<p>Chantier : <b>${esc(P.nomCh(idc))}</b> – ${un('SELECT COUNT(*) FROM logements WHERE id_chantier=?', [idc])} logement(s), ${un("SELECT COUNT(*) FROM interventions WHERE id_chantier=? AND statut='Planifiée'", [idc])} intervention(s) planifiée(s), anomalies ouvertes.</p><label><input type="checkbox" id="noms"> Inclure le nom et le téléphone des occupants (strict nécessaire ; à éviter si inutile)</label><div class="ligne" style="margin-top:10px"><button class="b" id="env">Déposer le paquet dans OneDrive</button></div>` : '<div class="info-l">Choisissez le chantier en haut de l\'écran.</div>';
    P.bouton(e, '#env', () => action(async () => { const r = await preparer(idc, e.querySelector('#noms').checked); toast('Paquet déposé : ' + r.n + ' logements, ' + r.ni + ' intervention(s). Sur le téléphone : « Recevoir un chantier ».'); APP.rafraichir(); }));
    const r = P.carte(z, 'Recevoir du téléphone', '<button class="b" id="lire">Lire les paquets reçus</button>');
    r.innerHTML = '<p class="s">Lit le dossier « vers_pc ». Rien n\'entre dans la base sans votre clic sur « Intégrer ». Un paquet déjà intégré n\'est jamais intégré deux fois.</p><div id="props"></div>';
    const dessinerProps = () => { const d = r.querySelector('#props'); d.innerHTML = propositions.length ? propositions.map((pr, i) => `<div class="carte"><b>${esc(pr.nom)}</b> ${pastille(pr.etat === 'à intégrer' ? 'Envoyée' : 'Annulée')} <span class="s">${pr.m ? esc(pr.m.appareil) + ' · ' + dateFr(pr.m.cree_le) : ''}</span>${pr.erreur ? `<div class="alerte-l">${esc(pr.erreur)}</div>` : ''}
      ${pr.ops.length ? '<table class="t"><tr><th>Opération</th><th>Logement</th><th>Contenu</th><th>Contrôle</th></tr>' + pr.ops.map(li => { const l = li.o.id_logement ? q('SELECT * FROM logements WHERE id=?', [li.o.id_logement])[0] : null; return `<tr><td>${esc(li.o.type)}</td><td>${l ? esc(P.libLog(l)) : '—'}</td><td>${esc([li.o.resultat, li.o.observation, li.o.description, li.o.repassage && 'repassage ' + dateFr(li.o.repassage)].filter(Boolean).join(' · '))}</td><td>${li.res === 'ok' ? '<span class="pa vert">à intégrer</span>' : li.res === 'conflit' ? '<span class="pa rouge">conflit</span> ' : '<span class="pa orange">' + esc(li.res) + '</span> '}${esc(li.motif)}</td></tr>`; }).join('') + `</table><div class="ligne fin" style="margin-top:8px"><button class="b" data-i="${i}">Intégrer ce paquet</button></div>` : ''}</div>`).join('') : '<p class="s">Aucun paquet en attente.</p>';
      d.querySelectorAll('[data-i]').forEach(b => b.onclick = () => action(async () => { await integrer(propositions[+b.dataset.i]); propositions.splice(+b.dataset.i, 1); toast('Paquet intégré ; accusé déposé pour le téléphone'); APP.rafraichir(); })); };
    P.bouton(r.parentNode, '#lire', () => action(async () => { await analyser(); dessinerProps(); }));
    dessinerProps();
    const C = q("SELECT c.*,l.adresse,l.numero,l.batiment,l.cage FROM conflits c JOIN logements l ON l.id=c.id_logement WHERE c.etat='ouvert'");
    const cf = P.carte(z, 'Conflits à arbitrer (' + C.length + ')');
    cf.innerHTML = C.length ? '<table class="t"><tr><th>Logement</th><th>Sur le PC</th><th>Sur le téléphone</th><th></th></tr>' + C.map(c => { const a = JSON.parse(c.valeur_pc), b = JSON.parse(c.valeur_mobile); return `<tr><td>${esc(P.libLog(c))}</td><td>${pastille(a.statut)} ${esc(a.observation)}</td><td>${pastille(b.resultat)} ${esc(b.observation)}${b.repassage ? ' · repassage ' + dateFr(b.repassage) : ''}</td><td class="ligne"><button class="b g p" data-pc="${c.id}">Garder le PC</button><button class="b p" data-mo="${c.id}">Retenir le téléphone</button></td></tr>`; }).join('') + '</table>' : '<div class="ok-l">Aucun conflit.</div>';
    cf.querySelectorAll('[data-pc],[data-mo]').forEach(b => b.onclick = () => action(async () => { await resoudre(+(b.dataset.pc || b.dataset.mo), b.dataset.mo ? 'mobile' : 'pc'); toast('Conflit tranché'); APP.rafraichir(); }));
    const j = P.carte(z, 'Historique des échanges');
    UI.tableau(j, q('SELECT *,id_paquet id FROM paquets ORDER BY COALESCE(recu_le,cree_le) DESC LIMIT 200'), [{ k: 'cree_le', l: 'Créé', f: x => dateFr(x.cree_le) }, { k: 'type', l: 'Type' }, { k: 'sens', l: 'Sens', f: x => x.sens === 'emis' ? 'PC → téléphone' : 'téléphone → PC' }, { k: 'appareil', l: 'Appareil' }, { k: 'etat', l: 'État' }, { k: 'integre_le', l: 'Intégré', f: x => dateFr(x.integre_le) }, { k: 'fichier', l: 'Fichier' }]);
  } };
  return { preparer, analyser, integrer, resoudre, dossier, get propositions() { return propositions; } };
})();
