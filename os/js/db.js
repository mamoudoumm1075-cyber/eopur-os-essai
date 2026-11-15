// EOPUR OS – base centrale SQLite (sql.js) enregistrée dans un dossier local du PC.
// Source de vérité unique. Toute écriture passe par ce module : historique, sauvegardes, restauration.
const DB = (() => {
  let SQL = null, db = null, dir = null, appareil = '';
  const NOM = 'eopur_os.sqlite', VERSION_SCHEMA = 1;
  const STATUTS_LOGEMENT = ['À planifier', 'À prévenir', 'Passage programmé', 'Intervention réalisée', 'Absent', 'Inaccessible', 'À repasser', "Refus d'accès", 'Problème technique', 'Terminé'];
  const RESULTATS = ['Intervention réalisée', 'Absent', 'Inaccessible', "Refus d'accès", 'Problème technique', 'À repasser'];
  const ETATS_CHANTIER = ['En préparation', 'En cours', 'Suspendu', 'Terminé', 'Archivé'];
  const STATUTS_ANOMALIE = ['Nouvelle', 'À analyser', 'En cours', 'En attente', 'Résolue', 'Clôturée'];
  const PRIORITES = ['Basse', 'Normale', 'Haute', 'Urgente'];
  const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS chantiers(id TEXT PRIMARY KEY, reference TEXT, nom TEXT NOT NULL, adresse TEXT DEFAULT '', ville TEXT DEFAULT '', client TEXT DEFAULT '',
  responsable TEXT DEFAULT '', etat TEXT DEFAULT 'En préparation', date_debut TEXT DEFAULT '', date_fin TEXT DEFAULT '', infos_techniques TEXT DEFAULT '', notes TEXT DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1, cree_le TEXT, maj_le TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS ux_chantier_ref ON chantiers(reference) WHERE reference<>'';
CREATE TABLE IF NOT EXISTS interlocuteurs(id TEXT PRIMARY KEY, id_chantier TEXT NOT NULL REFERENCES chantiers(id), nom TEXT NOT NULL, role TEXT DEFAULT '', societe TEXT DEFAULT '', telephone TEXT DEFAULT '', email TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS logements(id TEXT PRIMARY KEY, id_chantier TEXT NOT NULL REFERENCES chantiers(id), reference TEXT DEFAULT '', batiment TEXT DEFAULT '', cage TEXT DEFAULT '',
  etage TEXT DEFAULT '', numero TEXT NOT NULL, adresse TEXT DEFAULT '', ville TEXT DEFAULT '', typo TEXT DEFAULT '', occupant TEXT DEFAULT '', telephone TEXT DEFAULT '',
  statut TEXT DEFAULT 'À planifier', observation TEXT DEFAULT '', repassage TEXT DEFAULT '', revision INTEGER NOT NULL DEFAULT 1, maj_le TEXT, maj_par TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS ux_logement ON logements(id_chantier, adresse, batiment, cage, numero);
CREATE TABLE IF NOT EXISTS interventions(id TEXT PRIMARY KEY, id_chantier TEXT NOT NULL REFERENCES chantiers(id), date TEXT NOT NULL, heure_debut TEXT DEFAULT '', heure_fin TEXT DEFAULT '',
  intervenant TEXT DEFAULT '', type TEXT DEFAULT 'Passage', statut TEXT DEFAULT 'Planifiée', observations TEXT DEFAULT '', origine TEXT DEFAULT 'PC', cree_le TEXT, maj_le TEXT);
CREATE TABLE IF NOT EXISTS passages(id TEXT PRIMARY KEY, id_intervention TEXT NOT NULL REFERENCES interventions(id), id_logement TEXT NOT NULL REFERENCES logements(id),
  resultat TEXT DEFAULT '', observation TEXT DEFAULT '', actions TEXT DEFAULT '', repassage TEXT DEFAULT '', saisi_le TEXT, saisi_par TEXT, id_operation TEXT, UNIQUE(id_intervention, id_logement));
CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY, id_chantier TEXT, id_logement TEXT, id_passage TEXT, id_anomalie TEXT, fichier TEXT, sha256 TEXT, taille INTEGER, legende TEXT DEFAULT '', cree_le TEXT, id_operation TEXT);
CREATE TABLE IF NOT EXISTS anomalies(id TEXT PRIMARY KEY, id_chantier TEXT NOT NULL REFERENCES chantiers(id), id_logement TEXT, date TEXT, description TEXT NOT NULL, priorite TEXT DEFAULT 'Normale',
  responsable TEXT DEFAULT '', action TEXT DEFAULT '', echeance TEXT DEFAULT '', statut TEXT DEFAULT 'Nouvelle', source TEXT DEFAULT 'PC', cree_le TEXT, maj_le TEXT, id_operation TEXT);
CREATE TABLE IF NOT EXISTS echeances(id TEXT PRIMARY KEY, id_chantier TEXT REFERENCES chantiers(id), titre TEXT NOT NULL, type TEXT DEFAULT 'Action', date TEXT NOT NULL, statut TEXT DEFAULT 'À faire',
  source TEXT DEFAULT '', notes TEXT DEFAULT '', cree_le TEXT, maj_le TEXT);
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, id_chantier TEXT, categorie TEXT DEFAULT 'Divers', titre TEXT NOT NULL, nom_fichier TEXT NOT NULL, ext TEXT, sha256 TEXT, taille INTEGER,
  version INTEGER DEFAULT 1, id_famille TEXT, origine TEXT DEFAULT 'importé', statut TEXT DEFAULT 'validé', chemin TEXT, texte TEXT DEFAULT '', notes TEXT DEFAULT '', ajoute_le TEXT);
CREATE TABLE IF NOT EXISTS modeles(id TEXT PRIMARY KEY, type TEXT NOT NULL, nom TEXT NOT NULL, ext TEXT, chemin TEXT, sha256 TEXT, ajoute_le TEXT, actif INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS doe_pieces(id TEXT PRIMARY KEY, id_chantier TEXT NOT NULL REFERENCES chantiers(id), libelle TEXT NOT NULL, obligatoire INTEGER DEFAULT 1, id_document TEXT, statut TEXT DEFAULT 'Manquante', ordre INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS etudes(id TEXT PRIMARY KEY, id_chantier TEXT NOT NULL REFERENCES chantiers(id), titre TEXT NOT NULL, systeme TEXT DEFAULT '', type_installation TEXT DEFAULT '', notes TEXT DEFAULT '', cree_le TEXT, maj_le TEXT);
CREATE TABLE IF NOT EXISTS equipements(id TEXT PRIMARY KEY, id_etude TEXT NOT NULL REFERENCES etudes(id), categorie TEXT DEFAULT 'Bouche', piece TEXT DEFAULT '', typologie TEXT DEFAULT '', designation TEXT NOT NULL,
  reference TEXT DEFAULT '', fabricant TEXT DEFAULT '', valeur TEXT DEFAULT '', unite TEXT DEFAULT '', quantite REAL DEFAULT 1, source_document TEXT DEFAULT '', source_date TEXT DEFAULT '',
  fiabilite TEXT DEFAULT 'À vérifier', notes TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY, id_chantier TEXT NOT NULL REFERENCES chantiers(id), titre TEXT NOT NULL, id_etude TEXT, cree_le TEXT, maj_le TEXT);
CREATE TABLE IF NOT EXISTS listing_lignes(id TEXT PRIMARY KEY, id_listing TEXT NOT NULL REFERENCES listings(id), categorie TEXT DEFAULT '', designation TEXT NOT NULL, reference TEXT DEFAULT '',
  quantite REAL DEFAULT 0, unite TEXT DEFAULT 'u', caracteristiques TEXT DEFAULT '', observations TEXT DEFAULT '', ordre INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS demandes_prix(id TEXT PRIMARY KEY, id_chantier TEXT NOT NULL REFERENCES chantiers(id), id_listing TEXT REFERENCES listings(id), titre TEXT NOT NULL, statut TEXT DEFAULT 'En préparation', notes TEXT DEFAULT '', cree_le TEXT);
CREATE TABLE IF NOT EXISTS offres(id TEXT PRIMARY KEY, id_demande TEXT NOT NULL REFERENCES demandes_prix(id), fournisseur TEXT NOT NULL, envoyee_le TEXT DEFAULT '', recue_le TEXT DEFAULT '', reference_offre TEXT DEFAULT '', id_document TEXT, notes TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS offre_lignes(id TEXT PRIMARY KEY, id_offre TEXT NOT NULL REFERENCES offres(id), id_ligne TEXT NOT NULL REFERENCES listing_lignes(id), reference TEXT DEFAULT '', designation TEXT DEFAULT '',
  quantite REAL, prix_unitaire REAL, remise REAL DEFAULT 0, observations TEXT DEFAULT '', UNIQUE(id_offre, id_ligne));
CREATE TABLE IF NOT EXISTS historique(id INTEGER PRIMARY KEY AUTOINCREMENT, objet TEXT, id_objet TEXT, id_chantier TEXT, quand TEXT, auteur TEXT, source TEXT, resume TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS paquets(id_paquet TEXT PRIMARY KEY, empreinte TEXT, type TEXT, sens TEXT, appareil TEXT, cree_le TEXT, recu_le TEXT, integre_le TEXT, etat TEXT, fichier TEXT);
CREATE TABLE IF NOT EXISTS operations_recues(id_operation TEXT PRIMARY KEY, id_paquet TEXT, type TEXT, etat TEXT, motif TEXT, recu_le TEXT, integre_le TEXT, cree_le TEXT, contenu TEXT);
CREATE TABLE IF NOT EXISTS conflits(id INTEGER PRIMARY KEY AUTOINCREMENT, id_operation TEXT UNIQUE, id_logement TEXT, valeur_pc TEXT, valeur_mobile TEXT, etat TEXT, decision TEXT, decide_le TEXT);
CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY AUTOINCREMENT, quand TEXT, evenement TEXT, detail TEXT);`;

  const now = () => new Date().toISOString();
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const id = p => p + '-' + EO.uuid().slice(0, 8);
  function q(sql, p) { const st = db.prepare(sql); st.bind(p || []); const o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; }
  const un = (sql, p) => { const r = q(sql, p); return r.length ? Object.values(r[0])[0] : null; };
  const run = (sql, p) => db.run(sql, p || []);
  const journal = (ev, detail) => run('INSERT INTO journal(quand,evenement,detail) VALUES(?,?,?)', [now(), ev, detail || '']);
  function hist(objet, idObjet, idChantier, resume, detail, source, auteur) {
    run('INSERT INTO historique(objet,id_objet,id_chantier,quand,auteur,source,resume,detail) VALUES(?,?,?,?,?,?,?,?)',
      [objet, idObjet, idChantier || null, now(), auteur || appareil, source || 'PC', resume, detail ? JSON.stringify(detail) : null]);
  }
  // ---------- fichiers du dossier de travail
  async function sousDossier(chemin, creer = true) { let d = dir; for (const p of chemin.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create: creer }); return d; }
  async function ecrireFichier(chemin, data) {
    const parts = chemin.split('/'), nom = parts.pop(), d = await sousDossier(parts.join('/'));
    const h = await d.getFileHandle(nom, { create: true }), w = await h.createWritable(); await w.write(data); await w.close();
  }
  async function lireFichier(chemin) { const parts = chemin.split('/'), nom = parts.pop(), d = await sousDossier(parts.join('/'), false); return (await d.getFileHandle(nom)).getFile(); }
  async function existe(chemin) { try { await lireFichier(chemin); return true; } catch (e) { return false; } }
  // ---------- enregistrement : écriture dans un fichier temporaire puis remplacement
  let enCours = Promise.resolve();
  function sauver() {
    enCours = enCours.then(async () => {
      const data = db.export();
      await ecrireFichier(NOM + '.tmp', data);
      await ecrireFichier(NOM, data);
      try { await dir.removeEntry(NOM + '.tmp'); } catch (e) { }
    });
    return enCours;
  }
  const horo = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
  async function sauvegarde(motif) {
    const nom = 'sauvegardes/eopur_os_' + horo() + '_' + (motif || 'manuelle').replace(/[^a-z0-9]+/gi, '-') + '.sqlite';
    await ecrireFichier(nom, db.export()); journal('sauvegarde', nom); return nom;
  }
  async function listeSauvegardes() {
    const o = []; try { const d = await sousDossier('sauvegardes', false); for await (const [n, h] of d.entries()) if (h.kind === 'file' && n.endsWith('.sqlite')) { const f = await h.getFile(); o.push({ nom: n, taille: f.size, date: f.lastModified }); } } catch (e) { }
    return o.sort((a, b) => b.date - a.date);
  }
  async function restaurer(nom) {
    const f = await lireFichier('sauvegardes/' + nom), test = new SQL.Database(new Uint8Array(await f.arrayBuffer()));
    const ic = test.exec('PRAGMA integrity_check')[0].values[0][0]; if (ic !== 'ok') { test.close(); throw new Error('sauvegarde endommagée : ' + ic); }
    await sauvegarde('avant-restauration'); db.close(); db = test; migrer(); journal('restauration', nom); await sauver();
  }
  function migrer() {
    db.run('PRAGMA foreign_keys=ON'); db.run(SCHEMA);
    if (!un("SELECT v FROM meta WHERE k='appareil'")) run("INSERT INTO meta VALUES('appareil',?)", ['PC-' + EO.uuid().slice(0, 8)]);
    if (!un("SELECT v FROM meta WHERE k='schema'")) run("INSERT INTO meta VALUES('schema',?)", [String(VERSION_SCHEMA)]);
    appareil = un("SELECT v FROM meta WHERE k='appareil'");
  }
  async function ouvrir(dossier) {
    dir = dossier; if (!SQL) SQL = await initSqlJs({ locateFile: f => 'lib/' + f });
    let f = null; try { f = await (await dir.getFileHandle(NOM)).getFile(); } catch (e) { }
    if (!f || !f.size) { try { const t = await (await dir.getFileHandle(NOM + '.tmp')).getFile(); if (t.size) f = t; } catch (e) { } }
    db = f && f.size ? new SQL.Database(new Uint8Array(await f.arrayBuffer())) : new SQL.Database();
    const ic = db.exec('PRAGMA integrity_check')[0].values[0][0]; if (ic !== 'ok') throw new Error('base endommagée (' + ic + ') : restaurer une sauvegarde depuis Paramètres');
    const neuve = !f || !f.size; migrer(); if (neuve) journal('base', 'base créée');
    // une sauvegarde automatique par jour d'utilisation
    const der = un("SELECT v FROM meta WHERE k='derniere_sauvegarde_auto'");
    if (!neuve && der !== today()) { await sauvegarde('auto'); run("INSERT OR REPLACE INTO meta VALUES('derniere_sauvegarde_auto',?)", [today()]); }
    await sauver(); return { neuve };
  }
  // transaction : tout ou rien, puis enregistrement
  async function tx(fn) {
    run('BEGIN');
    try { let r = fn(); if (r && typeof r.then === 'function') r = await r; run('COMMIT'); await sauver(); return r; }
    catch (e) { try { run('ROLLBACK'); } catch (x) { } throw e; }
  }
  // ---------- règles métier communes
  function verifierObligatoires(obj, champs) { const manq = champs.filter(c => !String(obj[c] ?? '').trim()); if (manq.length) throw new Error('champ(s) obligatoire(s) manquant(s) : ' + manq.join(', ')); }
  // modification d'un logement avec historique ; refuse les doublons d'adresse/numéro
  function majLogement(idL, champs, source, auteur) {
    const l = q('SELECT * FROM logements WHERE id=?', [idL])[0]; if (!l) throw new Error('logement inconnu');
    const n = Object.assign({}, l, champs), diff = {};
    for (const k of Object.keys(champs)) if (String(l[k] ?? '') !== String(n[k] ?? '')) diff[k] = [l[k], n[k]];
    if (!Object.keys(diff).length) return l.revision;
    if (n.statut && !STATUTS_LOGEMENT.includes(n.statut)) throw new Error('statut inconnu : ' + n.statut);
    const rev = l.revision + 1, cols = Object.keys(champs);
    run('UPDATE logements SET ' + cols.map(c => c + '=?').join(',') + ',revision=?,maj_le=?,maj_par=? WHERE id=?', [...cols.map(c => n[c] ?? ''), rev, now(), auteur || appareil, idL]);
    hist('logement', idL, l.id_chantier, Object.entries(diff).map(([k, v]) => k + ' : « ' + (v[0] ?? '') + ' » → « ' + (v[1] ?? '') + ' »').join(' ; '), { revision: rev, diff }, source, auteur);
    return rev;
  }
  // effet d'un résultat de passage sur le logement
  function statutApresResultat(resultat, repassage) {
    if (resultat === 'Intervention réalisée') return 'Intervention réalisée';
    if (repassage && resultat !== "Refus d'accès") return resultat === 'Absent' || resultat === 'Inaccessible' ? resultat : 'À repasser';
    return resultat;
  }
  return {
    STATUTS_LOGEMENT, RESULTATS, ETATS_CHANTIER, STATUTS_ANOMALIE, PRIORITES,
    ouvrir, sauver, sauvegarde, listeSauvegardes, restaurer, tx, q, un, run, journal, hist, id, now, today,
    ecrireFichier, lireFichier, existe, sousDossier, verifierObligatoires, majLogement, statutApresResultat,
    get appareil() { return appareil; }, get dossier() { return dir; }, get ouvert() { return !!db; }, get brut() { return db; }
  };
})();
