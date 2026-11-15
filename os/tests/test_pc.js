// Tests de bout en bout EOPUR OS (PC) – Chromium + dossier simulé (OPFS)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8765/';
const res = []; const ok = (n, c, d) => { res.push([n, !!c, d || '']); console.log((c ? 'OK  ' : 'ÉCHEC ') + n + (d ? ' – ' + d : '')); };
const PREP = require('./prep');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const pg = await ctx.newPage();
  const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  await pg.addInitScript(PREP);
  await pg.goto(BASE + 'pc.html');
  await pg.click('#acc_btn button'); await pg.waitForSelector('#accueil', { state: 'detached', timeout: 15000 });
  ok('ouverture : base créée dans le dossier', await pg.evaluate(() => DB.ouvert && DB.appareil.startsWith('PC-')));
  const E = (f, a) => pg.evaluate(f, a);
  // --- chantiers
  const idc = await E(async () => M.creerChantier({ reference: 'A-001', nom: 'Résidence Les Tilleuls', adresse: '12 rue des Lilas', ville: 'Nanterre', client: 'Bailleur X', etat: 'En cours' }));
  ok('création chantier', !!idc);
  ok('référence unique', await E(async () => { try { await M.creerChantier({ reference: 'A-001', nom: 'doublon' }); return false; } catch (e) { return /existe/.test(e.message); } }));
  ok('nom obligatoire', await E(async () => { try { await M.creerChantier({ nom: '' }); return false; } catch (e) { return true; } }));
  await E(async () => { await M.majChantier((DB.q('SELECT id FROM chantiers')[0]).id, { responsable: 'M. Magassa' }); });
  ok('historique chantier', await E(() => DB.un("SELECT COUNT(*) FROM historique WHERE objet='chantier' AND resume LIKE '%responsable%'") === 1));
  // --- logements
  const nb = await E(async idc => (await M.creerLogementsSerie(idc, { adresse: '12 rue des Lilas', ville: 'Nanterre', batiment: 'A', niveaux: 4, parNiveau: 3, premier: 1 })).length, idc);
  ok('création en série', nb === 12, nb + ' logements');
  ok('doublon de logement refusé (série annulée en entier)', await E(async idc => { try { await M.creerLogementsSerie(idc, { adresse: '12 rue des Lilas', batiment: 'A', niveaux: 1, parNiveau: 2, premier: 12 }); return false; } catch (e) { return DB.un('SELECT COUNT(*) FROM logements') === 12; } }, idc));
  ok('numéro obligatoire', await E(async idc => { try { await M.creerLogement(idc, { adresse: 'x' }); return false; } catch (e) { return true; } }, idc));
  const L = await E(idc => DB.q('SELECT id FROM logements WHERE id_chantier=? ORDER BY CAST(numero AS INTEGER)', [idc]).map(r => r.id), idc);
  // --- planning
  const auj = await E(() => DB.today());
  const iid = await E(async ([idc, L, d]) => M.creerIntervention({ id_chantier: idc, date: d, heure_debut: '08:30', heure_fin: '12:00', intervenant: 'Alexandre', type: 'Passage' }, L.slice(0, 6)), [idc, L, auj]);
  ok('intervention planifiée → logements « Passage programmé »', await E(() => DB.un("SELECT COUNT(*) FROM logements WHERE statut='Passage programmé'") === 6));
  const al = await E(([idc, L, d]) => M.alertesIntervention({ id_chantier: idc, date: d, heure_debut: '10:00', heure_fin: '11:00', intervenant: 'alexandre' }, [L[0]]), [idc, L, auj]);
  ok('alerte doublon même jour', al.some(a => a.startsWith('doublon')), al.join(' | '));
  ok('alerte chevauchement intervenant', al.some(a => a.startsWith('chevauchement')));
  ok('alerte incohérence horaire', (await E(([idc, d]) => M.alertesIntervention({ id_chantier: idc, date: d, heure_debut: '11:00', heure_fin: '09:00' }, []), [idc, auj])).some(a => /fin est avant/.test(a)));
  // --- résultats
  const P = await E(iid => DB.q('SELECT p.id,p.id_logement FROM passages p WHERE id_intervention=? ', [iid]), iid);
  await E(async P => { await M.enregistrerResultat(P[0].id, { resultat: 'Intervention réalisée', observation: 'bouches remplacées' }); await M.enregistrerResultat(P[1].id, { resultat: 'Absent', repassage: '2030-01-10' }); await M.enregistrerResultat(P[2].id, { resultat: 'Problème technique', observation: 'gaine obstruée' }); }, P);
  ok('résultat réalisé → statut logement', await E(id => DB.q('SELECT statut FROM logements WHERE id=?', [id])[0].statut === 'Intervention réalisée', P[0].id_logement));
  ok('absent + date de repassage conservés', await E(id => { const l = DB.q('SELECT * FROM logements WHERE id=?', [id])[0]; return l.statut === 'Absent' && l.repassage === '2030-01-10'; }, P[1].id_logement));
  ok('révision et historique du logement', await E(id => DB.q('SELECT revision FROM logements WHERE id=?', [id])[0].revision >= 3 && DB.un("SELECT COUNT(*) FROM historique WHERE id_objet=?", [id]) >= 3, P[0].id_logement));
  await E(async P => { for (const p of P.slice(3)) await M.enregistrerResultat(p.id, { resultat: 'Intervention réalisée' }); }, P);
  ok('intervention « Réalisée » quand tout est saisi', await E(iid => DB.q('SELECT statut FROM interventions WHERE id=?', [iid])[0].statut === 'Réalisée', iid));
  // annulation
  const i2 = await E(async ([idc, L]) => M.creerIntervention({ id_chantier: idc, date: '2031-02-02', type: 'Passage' }, [L[8], L[9]]), [idc, L]);
  await E(async i2 => M.majIntervention(i2, { statut: 'Annulée' }), i2);
  ok('annulation → logements « À planifier »', await E(id => DB.q('SELECT statut FROM logements WHERE id=?', [id])[0].statut === 'À planifier', L[8]));
  // --- anomalies et échéances
  const ia = await E(async ([idc, l]) => M.creerAnomalie({ id_chantier: idc, id_logement: l, description: 'Gaine obstruée cuisine', priorite: 'Urgente' }), [idc, P[2].id_logement]);
  await E(async ia => M.majAnomalie(ia, { statut: 'En cours', responsable: 'Mamoudou' }), ia);
  ok('anomalie : statut et historique', await E(ia => DB.q('SELECT statut FROM anomalies WHERE id=?', [ia])[0].statut === 'En cours' && DB.un("SELECT COUNT(*) FROM historique WHERE objet='anomalie' AND id_objet=?", [ia]) === 2, ia));
  ok('statut d\'anomalie inconnu refusé', await E(async ia => { try { await M.majAnomalie(ia, { statut: 'Bidon' }); return false; } catch (e) { return true; } }, ia));
  await E(async idc => M.creerEcheance({ id_chantier: idc, titre: 'Remise DOE', date: '2020-01-01', type: 'Rendu DOE' }), idc);
  const k = await E(() => M.indicateurs());
  ok('tableau de bord : indicateurs réels', k.chantiersActifs === 1 && k.absents === 1 && k.anomaliesUrgentes === 1 && k.echeancesDepassees === 1 && k.realisees === 4, JSON.stringify(k));
  ok('échéancier unifié (échéance + repassage + fin)', await E(() => { const e = M.toutesEcheances(); return e.some(x => x.type === 'Repassage') && e.some(x => x.source === 'Échéancier'); }));
  // --- pages : chaque écran s'affiche sans erreur
  for (const p of ['tableau', 'chantiers', 'chantiers:' + idc, 'logements', 'planning', 'interventions', 'interventions:' + iid, 'anomalies', 'echeancier', 'documents', 'rapports', 'avis', 'doe', 'assistant', 'etudes', 'listings', 'prix', 'synchro', 'parametres']) {
    await E(p => APP.aller(p), p); await pg.waitForTimeout(250);
    const err = await pg.$('#zone .err-rendu'); ok('écran ' + p, !err, err ? await err.textContent() : '');
  }
  // vues du planning
  for (const v of ['jour', 'semaine', 'mois']) { await E(v => { sessionStorage.setItem('eo_vue', v); APP.aller('planning'); }, v); await pg.waitForTimeout(150); ok('planning vue ' + v, !(await pg.$('#zone .err-rendu'))); }
  await E(idc => { document.querySelector('#chantier_actif').value = idc; APP.aller('logements'); }, idc); await pg.waitForTimeout(200);
  ok('liste des logements affichée', (await pg.$$('#zone tbody tr[data-id]')).length === 12);
  // recherche globale
  await pg.fill('#recherche', 'obstruée'); await pg.press('#recherche', 'Enter'); await pg.waitForTimeout(200);
  ok('recherche globale', (await pg.textContent('.modal')).includes('Gaine obstruée')); await pg.click('.modal [data-x]');
  // sauvegarde / restauration
  const sv = await E(async () => { const n = await DB.sauvegarde('test'); return n; });
  await E(async () => M.creerChantier({ nom: 'Temporaire' }));
  await E(async n => DB.restaurer(n.split('/').pop()), sv);
  ok('restauration d\'une sauvegarde', await E(() => DB.un("SELECT COUNT(*) FROM chantiers WHERE nom='Temporaire'") === 0 && DB.un('SELECT COUNT(*) FROM chantiers') === 1));
  ok('fichier base sur disque', await E(async () => (await DB.lireFichier('eopur_os.sqlite')).size > 10000));
  // persistance : recharger la page
  // (Chromium sans écran ferme l'onglet quand il relit un dossier OPFS mémorisé : on oublie le dossier et on le rechoisit, la base est relue depuis le disque)
  await E(() => new Promise(r => { const q = indexedDB.deleteDatabase('eopur_os_pc'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await pg.goto(BASE + 'pc.html'); await pg.click('#acc_btn button'); await pg.waitForSelector('#accueil', { state: 'detached', timeout: 15000 });
  ok('persistance après rechargement', await E(() => DB.un('SELECT COUNT(*) FROM logements') === 12 && DB.un('SELECT COUNT(*) FROM historique') > 20));
  require('fs').writeFileSync(__dirname + '/etat_ids.json', JSON.stringify({ idc, iid, L }));
  ok('aucune erreur JavaScript', !erreurs.length, erreurs.slice(0, 5).join(' | '));
  await pg.screenshot({ path: __dirname + '/capture_logements.png', fullPage: false });
  await E(() => APP.aller('tableau')); await pg.waitForTimeout(300); await pg.screenshot({ path: __dirname + '/capture_tableau.png' });
  await b.close();
  const ko = res.filter(r => !r[1]); console.log('\n' + (res.length - ko.length) + '/' + res.length + ' réussis'); process.exit(ko.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
