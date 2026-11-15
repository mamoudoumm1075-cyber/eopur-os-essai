// EOPUR OS – règles métier : chantiers, logements, planning, passages, anomalies, échéances.
// Chaque fonction écrit dans la base dans une transaction et laisse une trace dans l'historique.
const M = (() => {
  const { q, un, run, hist, id, now, today } = DB;
  const net = s => String(s ?? '').trim();
  // ---------------- chantiers
  async function creerChantier(c) {
    DB.verifierObligatoires(c, ['nom']);
    const ref = net(c.reference);
    if (ref && un('SELECT COUNT(*) FROM chantiers WHERE reference=?', [ref])) throw new Error('la référence « ' + ref + ' » existe déjà');
    return DB.tx(() => {
      const i = id('CH');
      run('INSERT INTO chantiers(id,reference,nom,adresse,ville,client,responsable,etat,date_debut,date_fin,infos_techniques,notes,cree_le,maj_le) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [i, ref, net(c.nom), net(c.adresse), net(c.ville), net(c.client), net(c.responsable), c.etat || 'En préparation', c.date_debut || '', c.date_fin || '', net(c.infos_techniques), net(c.notes), now(), now()]);
      hist('chantier', i, i, 'chantier créé : ' + net(c.nom)); return i;
    });
  }
  async function majChantier(i, champs) {
    const c = q('SELECT * FROM chantiers WHERE id=?', [i])[0]; if (!c) throw new Error('chantier inconnu');
    if ('nom' in champs && !net(champs.nom)) throw new Error('le nom du chantier est obligatoire');
    if (champs.reference && net(champs.reference) !== c.reference && un('SELECT COUNT(*) FROM chantiers WHERE reference=? AND id<>?', [net(champs.reference), i])) throw new Error('la référence existe déjà');
    const diff = Object.entries(champs).filter(([k, v]) => String(c[k] ?? '') !== String(v ?? ''));
    if (!diff.length) return;
    return DB.tx(() => {
      run('UPDATE chantiers SET ' + diff.map(([k]) => k + '=?').join(',') + ',revision=revision+1,maj_le=? WHERE id=?', [...diff.map(([, v]) => typeof v === 'string' ? v.trim() : v), now(), i]);
      hist('chantier', i, i, diff.map(([k, v]) => k + ' : « ' + (c[k] ?? '') + ' » → « ' + v + ' »').join(' ; '));
    });
  }
  async function ajouterInterlocuteur(idc, x) { DB.verifierObligatoires(x, ['nom']); return DB.tx(() => { const i = id('IN'); run('INSERT INTO interlocuteurs VALUES(?,?,?,?,?,?,?)', [i, idc, net(x.nom), net(x.role), net(x.societe), net(x.telephone), net(x.email)]); hist('chantier', idc, idc, 'interlocuteur ajouté : ' + net(x.nom)); return i; }); }
  async function supprimerInterlocuteur(i) { const x = q('SELECT * FROM interlocuteurs WHERE id=?', [i])[0]; return DB.tx(() => { run('DELETE FROM interlocuteurs WHERE id=?', [i]); hist('chantier', x.id_chantier, x.id_chantier, 'interlocuteur retiré : ' + x.nom); }); }
  // ---------------- logements
  const cleLog = l => [net(l.adresse), net(l.batiment), net(l.cage), net(l.numero)].join('|').toLowerCase();
  function existeLogement(idc, l, sauf) { return q('SELECT id FROM logements WHERE id_chantier=? AND lower(adresse)=lower(?) AND lower(batiment)=lower(?) AND lower(cage)=lower(?) AND lower(numero)=lower(?)' + (sauf ? ' AND id<>?' : ''), [idc, net(l.adresse), net(l.batiment), net(l.cage), net(l.numero), ...(sauf ? [sauf] : [])])[0]; }
  function insererLogement(idc, l, source) {
    DB.verifierObligatoires(l, ['numero']);
    if (existeLogement(idc, l)) throw new Error('logement déjà présent : ' + [l.adresse, l.batiment, l.cage, 'n° ' + l.numero].filter(Boolean).join(' '));
    const i = id('LG'), st = DB.STATUTS_LOGEMENT.includes(l.statut) ? l.statut : 'À planifier';
    run('INSERT INTO logements(id,id_chantier,reference,batiment,cage,etage,numero,adresse,ville,typo,occupant,telephone,statut,observation,repassage,revision,maj_le,maj_par) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)',
      [i, idc, net(l.reference), net(l.batiment), net(l.cage), net(l.etage), net(l.numero), net(l.adresse), net(l.ville), net(l.typo), net(l.occupant), net(l.telephone), st, net(l.observation), l.repassage || '', now(), DB.appareil]);
    hist('logement', i, idc, 'logement créé : ' + [l.adresse, 'n° ' + l.numero].filter(Boolean).join(' '), null, source);
    return i;
  }
  async function creerLogement(idc, l) { return DB.tx(() => insererLogement(idc, l, 'saisie PC')); }
  async function creerLogementsSerie(idc, s) { // adresse, niveaux, par niveau, premier numéro
    return DB.tx(() => { let n = +s.premier || 1; const ids = [];
      for (let e = 0; e < +s.niveaux; e++) for (let k = 0; k < +s.parNiveau; k++)
        ids.push(insererLogement(idc, { adresse: s.adresse, ville: s.ville, batiment: s.batiment, cage: s.cage, etage: e === 0 ? 'Rez-de-chaussée' : 'Étage ' + String(e).padStart(2, '0'), numero: String(n++) }, 'création en série'));
      return ids; });
  }
  async function majLogement(i, champs, source) {
    const l = q('SELECT * FROM logements WHERE id=?', [i])[0];
    if (('numero' in champs || 'adresse' in champs) && existeLogement(l.id_chantier, Object.assign({}, l, champs), i)) throw new Error('un autre logement porte déjà cette adresse et ce numéro');
    if ('numero' in champs && !net(champs.numero)) throw new Error('le numéro de logement est obligatoire');
    return DB.tx(() => DB.majLogement(i, champs, source || 'saisie PC'));
  }
  // ---------------- planning
  // alertes : doublon, chevauchement, incohérence ; renvoie une liste de messages (n'empêche pas l'enregistrement)
  function alertesIntervention(it, logements, sauf) {
    const a = [], date = it.date;
    if (!date) return ['date manquante'];
    if (it.heure_debut && it.heure_fin && it.heure_fin <= it.heure_debut) a.push('l\'heure de fin est avant l\'heure de début');
    if (date < today() && (it.statut || 'Planifiée') === 'Planifiée') a.push('date passée pour une intervention encore planifiée');
    for (const lid of logements) {
      const d = q("SELECT i.id,i.heure_debut FROM passages p JOIN interventions i ON i.id=p.id_intervention WHERE p.id_logement=? AND i.date=? AND i.statut<>'Annulée'" + (sauf ? ' AND i.id<>?' : ''), [lid, date, ...(sauf ? [sauf] : [])]);
      const l = q('SELECT numero,adresse,statut FROM logements WHERE id=?', [lid])[0];
      if (d.length) a.push('doublon : logement ' + l.adresse + ' n° ' + l.numero + ' déjà prévu le même jour');
      if (l && l.statut === 'Terminé') a.push('logement ' + l.adresse + ' n° ' + l.numero + ' déjà terminé');
    }
    if (it.intervenant && it.heure_debut) {
      const autres = q("SELECT heure_debut,heure_fin,type FROM interventions WHERE date=? AND lower(intervenant)=lower(?) AND statut<>'Annulée' AND heure_debut<>''" + (sauf ? ' AND id<>?' : ''), [date, net(it.intervenant), ...(sauf ? [sauf] : [])]);
      const f = it.heure_fin || it.heure_debut;
      for (const o of autres) { const of = o.heure_fin || o.heure_debut; if (it.heure_debut < of && o.heure_debut < f || it.heure_debut === o.heure_debut) a.push('chevauchement : ' + it.intervenant + ' déjà prévu de ' + o.heure_debut + (o.heure_fin ? ' à ' + o.heure_fin : '')); }
    }
    return [...new Set(a)];
  }
  async function creerIntervention(it, logements) {
    DB.verifierObligatoires(it, ['id_chantier', 'date']);
    return DB.tx(() => {
      const i = id('IT');
      run('INSERT INTO interventions(id,id_chantier,date,heure_debut,heure_fin,intervenant,type,statut,observations,origine,cree_le,maj_le) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        [i, it.id_chantier, it.date, it.heure_debut || '', it.heure_fin || '', net(it.intervenant), it.type || 'Passage', it.statut || 'Planifiée', net(it.observations), it.origine || 'PC', now(), now()]);
      for (const lid of logements || []) {
        run('INSERT INTO passages(id,id_intervention,id_logement) VALUES(?,?,?)', [id('PA'), i, lid]);
        const l = q('SELECT statut FROM logements WHERE id=?', [lid])[0];
        if ((it.statut || 'Planifiée') === 'Planifiée' && !['Terminé', 'Intervention réalisée'].includes(l.statut)) DB.majLogement(lid, { statut: 'Passage programmé' }, 'planning');
      }
      hist('intervention', i, it.id_chantier, 'intervention ' + (it.type || 'Passage') + ' planifiée le ' + it.date + ' – ' + (logements || []).length + ' logement(s)');
      return i;
    });
  }
  async function majIntervention(i, champs) {
    const it = q('SELECT * FROM interventions WHERE id=?', [i])[0];
    return DB.tx(() => {
      const ks = Object.keys(champs); run('UPDATE interventions SET ' + ks.map(k => k + '=?').join(',') + ',maj_le=? WHERE id=?', [...ks.map(k => champs[k]), now(), i]);
      hist('intervention', i, it.id_chantier, ks.map(k => k + ' : « ' + (it[k] ?? '') + ' » → « ' + champs[k] + ' »').join(' ; '));
      if (champs.statut === 'Annulée') for (const p of q("SELECT p.id_logement FROM passages p JOIN logements l ON l.id=p.id_logement WHERE p.id_intervention=? AND p.resultat='' AND l.statut='Passage programmé'", [i])) DB.majLogement(p.id_logement, { statut: 'À planifier' }, 'intervention annulée');
    });
  }
  async function ajouterAuPassage(i, logements) { const it = q('SELECT * FROM interventions WHERE id=?', [i])[0];
    return DB.tx(() => { for (const lid of logements) if (!un('SELECT COUNT(*) FROM passages WHERE id_intervention=? AND id_logement=?', [i, lid])) { run('INSERT INTO passages(id,id_intervention,id_logement) VALUES(?,?,?)', [id('PA'), i, lid]); const l = q('SELECT statut FROM logements WHERE id=?', [lid])[0]; if (it.statut === 'Planifiée' && !['Terminé', 'Intervention réalisée'].includes(l.statut)) DB.majLogement(lid, { statut: 'Passage programmé' }, 'planning'); }
      hist('intervention', i, it.id_chantier, logements.length + ' logement(s) ajouté(s)'); }); }
  // résultat d'un passage : met à jour le passage, le logement et l'intervention
  function enregistrerResultatSansTx(idPassage, r, source, auteur, idOperation) {
    if (!DB.RESULTATS.includes(r.resultat)) throw new Error('résultat inconnu : ' + r.resultat);
    const p = q('SELECT * FROM passages WHERE id=?', [idPassage])[0];
    run('UPDATE passages SET resultat=?,observation=?,actions=?,repassage=?,saisi_le=?,saisi_par=?,id_operation=? WHERE id=?', [r.resultat, net(r.observation), net(r.actions), r.repassage || '', now(), auteur || DB.appareil, idOperation || null, idPassage]);
    const st = DB.statutApresResultat(r.resultat, r.repassage), champs = { statut: st, repassage: r.repassage || '' };
    if (net(r.observation)) champs.observation = net(r.observation);
    const rev = DB.majLogement(p.id_logement, champs, source || 'résultat de passage', auteur);
    const restants = un("SELECT COUNT(*) FROM passages WHERE id_intervention=? AND resultat=''", [p.id_intervention]);
    if (!restants) run("UPDATE interventions SET statut='Réalisée',maj_le=? WHERE id=? AND statut='Planifiée'", [now(), p.id_intervention]);
    return rev;
  }
  async function enregistrerResultat(idPassage, r) { return DB.tx(() => enregistrerResultatSansTx(idPassage, r, 'saisie PC')); }
  async function cloturerLogement(lid) { return DB.tx(() => DB.majLogement(lid, { statut: 'Terminé' }, 'clôture PC')); }
  // ---------------- anomalies
  async function creerAnomalie(a, source) {
    DB.verifierObligatoires(a, ['id_chantier', 'description']);
    return DB.tx(() => { const i = id('AN');
      run('INSERT INTO anomalies(id,id_chantier,id_logement,date,description,priorite,responsable,action,echeance,statut,source,cree_le,maj_le,id_operation) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [i, a.id_chantier, a.id_logement || null, a.date || today(), net(a.description), a.priorite || 'Normale', net(a.responsable), net(a.action), a.echeance || '', a.statut || 'Nouvelle', source || 'PC', now(), now(), a.id_operation || null]);
      hist('anomalie', i, a.id_chantier, 'anomalie créée : ' + net(a.description).slice(0, 80)); return i; });
  }
  async function majAnomalie(i, champs) { const a = q('SELECT * FROM anomalies WHERE id=?', [i])[0];
    if (champs.statut && !DB.STATUTS_ANOMALIE.includes(champs.statut)) throw new Error('statut inconnu');
    const diff = Object.entries(champs).filter(([k, v]) => String(a[k] ?? '') !== String(v ?? '')); if (!diff.length) return;
    return DB.tx(() => { run('UPDATE anomalies SET ' + diff.map(([k]) => k + '=?').join(',') + ',maj_le=? WHERE id=?', [...diff.map(([, v]) => v), now(), i]);
      hist('anomalie', i, a.id_chantier, diff.map(([k, v]) => k + ' : « ' + (a[k] ?? '') + ' » → « ' + v + ' »').join(' ; ')); }); }
  // ---------------- échéances
  async function creerEcheance(e) { DB.verifierObligatoires(e, ['titre', 'date']);
    return DB.tx(() => { const i = id('EC'); run('INSERT INTO echeances(id,id_chantier,titre,type,date,statut,source,notes,cree_le,maj_le) VALUES(?,?,?,?,?,?,?,?,?,?)', [i, e.id_chantier || null, net(e.titre), e.type || 'Action', e.date, e.statut || 'À faire', net(e.source), net(e.notes), now(), now()]);
      hist('echeance', i, e.id_chantier, 'échéance créée : ' + net(e.titre) + ' le ' + e.date); return i; }); }
  async function majEcheance(i, champs) { const e = q('SELECT * FROM echeances WHERE id=?', [i])[0];
    return DB.tx(() => { const ks = Object.keys(champs); run('UPDATE echeances SET ' + ks.map(k => k + '=?').join(',') + ',maj_le=? WHERE id=?', [...ks.map(k => champs[k]), now(), i]); hist('echeance', i, e.id_chantier, ks.map(k => k + ' → ' + champs[k]).join(' ; ')); }); }
  // vue unifiée des échéances (saisies + dérivées des autres modules)
  function toutesEcheances(idc) {
    const f = idc ? ' AND id_chantier=?' : '', p = idc ? [idc] : [], o = [];
    for (const e of q("SELECT e.*,c.nom chantier FROM echeances e LEFT JOIN chantiers c ON c.id=e.id_chantier WHERE 1=1" + (idc ? ' AND e.id_chantier=?' : ''), p)) o.push({ date: e.date, titre: e.titre, type: e.type, chantier: e.chantier, id_chantier: e.id_chantier, statut: e.statut, source: 'Échéancier', id: e.id, modifiable: true });
    for (const i of q("SELECT i.*,c.nom chantier,(SELECT COUNT(*) FROM passages WHERE id_intervention=i.id) n FROM interventions i JOIN chantiers c ON c.id=i.id_chantier WHERE i.statut='Planifiée'" + (idc ? ' AND i.id_chantier=?' : ''), p)) o.push({ date: i.date, titre: i.type + ' – ' + i.n + ' logement(s)' + (i.intervenant ? ' – ' + i.intervenant : ''), type: 'Intervention', chantier: i.chantier, id_chantier: i.id_chantier, statut: 'Planifiée', source: 'Planning' });
    for (const a of q("SELECT a.*,c.nom chantier FROM anomalies a JOIN chantiers c ON c.id=a.id_chantier WHERE a.echeance<>'' AND a.statut NOT IN ('Résolue','Clôturée')" + (idc ? ' AND a.id_chantier=?' : ''), p)) o.push({ date: a.echeance, titre: 'Anomalie : ' + a.description.slice(0, 60), type: 'Anomalie', chantier: a.chantier, id_chantier: a.id_chantier, statut: a.statut, source: 'Anomalies' });
    for (const l of q("SELECT l.*,c.nom chantier FROM logements l JOIN chantiers c ON c.id=l.id_chantier WHERE l.repassage<>'' AND l.statut NOT IN ('Terminé','Intervention réalisée')" + (idc ? ' AND l.id_chantier=?' : ''), p)) o.push({ date: l.repassage, titre: 'Repassage ' + l.adresse + ' n° ' + l.numero, type: 'Repassage', chantier: l.chantier, id_chantier: l.id_chantier, statut: l.statut, source: 'Logements' });
    for (const c of q("SELECT * FROM chantiers WHERE date_fin<>'' AND etat NOT IN ('Terminé','Archivé')" + f, p)) o.push({ date: c.date_fin, titre: 'Fin prévue du chantier', type: 'Délai', chantier: c.nom, id_chantier: c.id, statut: c.etat, source: 'Chantier' });
    return o.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }
  // ---------------- indicateurs
  function indicateurs() {
    const t = today(), dans7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    return {
      chantiersActifs: un("SELECT COUNT(*) FROM chantiers WHERE etat IN ('En préparation','En cours')"),
      aTraiter: un("SELECT COUNT(*) FROM logements l JOIN chantiers c ON c.id=l.id_chantier WHERE c.etat NOT IN ('Terminé','Archivé') AND l.statut NOT IN ('Terminé','Intervention réalisée')"),
      aVenir: un("SELECT COUNT(*) FROM interventions WHERE statut='Planifiée' AND date>=?", [t]),
      enRetard: un("SELECT COUNT(*) FROM interventions WHERE statut='Planifiée' AND date<?", [t]),
      realisees: un("SELECT COUNT(*) FROM passages WHERE resultat='Intervention réalisée'"),
      absents: un("SELECT COUNT(*) FROM logements WHERE statut='Absent'"),
      inaccessibles: un("SELECT COUNT(*) FROM logements WHERE statut='Inaccessible'"),
      aRepasser: un("SELECT COUNT(*) FROM logements WHERE statut IN ('Absent','Inaccessible','À repasser','Problème technique') AND (repassage='' OR repassage<?)", [t]),
      anomalies: un("SELECT COUNT(*) FROM anomalies WHERE statut NOT IN ('Résolue','Clôturée')"),
      anomaliesUrgentes: un("SELECT COUNT(*) FROM anomalies WHERE statut NOT IN ('Résolue','Clôturée') AND priorite IN ('Haute','Urgente')"),
      docsAttente: un("SELECT COUNT(*) FROM documents WHERE statut='brouillon'") + un("SELECT COUNT(*) FROM doe_pieces WHERE statut='Manquante' AND obligatoire=1"),
      echeances7: toutesEcheances().filter(e => e.date >= t && e.date <= dans7 && !['Fait', 'Réalisée'].includes(e.statut)).length,
      echeancesDepassees: toutesEcheances().filter(e => e.date < t && e.modifiable && e.statut !== 'Fait').length,
      conflits: un("SELECT COUNT(*) FROM conflits WHERE etat='ouvert'"),
      paquetsAttente: un("SELECT COUNT(*) FROM paquets WHERE sens='recu' AND etat='reçu'")
    };
  }
  return { creerChantier, majChantier, ajouterInterlocuteur, supprimerInterlocuteur, creerLogement, creerLogementsSerie, majLogement, insererLogement, existeLogement, cleLog,
    alertesIntervention, creerIntervention, majIntervention, ajouterAuPassage, enregistrerResultat, enregistrerResultatSansTx, cloturerLogement,
    creerAnomalie, majAnomalie, creerEcheance, majEcheance, toutesEcheances, indicateurs };
})();
