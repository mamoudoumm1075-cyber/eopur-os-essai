// Tests EOPUR OS : documents, exports Word/Excel, études, chiffrage, et échanges PC ⇄ téléphone par paquets
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765/', OUT = path.join(__dirname, 'sorties'); fs.mkdirSync(OUT, { recursive: true });
const res = []; const ok = (n, c, d) => { res.push([n, !!c]); console.log((c ? 'OK  ' : 'ÉCHEC ') + n + (d ? ' – ' + d : '')); };
const PREP = require('./prep');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const pg = await ctx.newPage();
  const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
  await pg.addInitScript(PREP); await pg.goto(BASE + 'pc.html'); await pg.click('#acc_btn button'); await pg.waitForSelector('#accueil', { state: 'detached' });
  const E = (f, a) => pg.evaluate(f, a);
  const sauver = async (nom, b64) => fs.writeFileSync(path.join(OUT, nom), Buffer.from(b64, 'base64'));
  const b64 = `async blob => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); }`;
  await E(`window.B64 = ${b64}`);
  const idc = await E(async () => M.creerChantier({ reference: 'N-2026', nom: 'Nanterre Parc Sud', adresse: '5 av. de la République', ville: 'Nanterre', client: 'Bailleur Y', etat: 'En cours' }));
  // ---------- import Excel au format de la trame (2 blocs d'adresse, un doublon, un statut inconnu)
  const xl = await E(async () => { const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Feuil1'); const H = ['Typo', 'Etage', 'Numero de Lgt', 'Adresse', 'Ville', 'Locataires', '1er Passage', '2e Passage', '3e Passage', 'Fait Oui/Non/Retour', 'Observation'];
    ws.addRow(H); ws.addRow(['T3', 'RDC', 1, '5 av. de la République', 'Nanterre', 'DUPONT', new Date(Date.UTC(2026, 9, 1)), null, null, 'Fait', '']); ws.addRow(['T2', 'RDC', 2, '5 av. de la République', 'Nanterre', 'MARTIN', new Date(Date.UTC(2026, 9, 1)), new Date(Date.UTC(2026, 9, 8)), null, 'Abs', 'absent 2 fois']);
    ws.addRow(['T4', '1er', 3, '5 av. de la République', 'Nanterre', '', null, null, null, '', '']); ws.addRow(['T3', '1er', 3, '5 av. de la République', 'Nanterre', '', null, null, null, '', '']);
    ws.addRow(H); ws.addRow(['T3', 'RDC', 10, '7 av. de la République', 'Nanterre', '', new Date(Date.UTC(2026, 9, 2)), null, null, 'Com Client', 'gaine bouchée']); ws.addRow(['T3', 'RDC', 11, '7 av. de la République', 'Nanterre', '', new Date(Date.UTC(2026, 9, 2)), null, null, 'Bizarre', '']);
    const buf = await wb.xlsx.writeBuffer(); const { lignes } = await XL.lireClasseur(buf); const a = XL.analyser(DB.q('SELECT id FROM chantiers')[0].id, lignes);
    return { n: lignes.length, nouveaux: a.nouveaux.length, dbl: a.doublonsFichier.length, inconnus: [...a.statutsInconnus], st: a.nouveaux.map(l => l.statut) }; });
  ok('lecture de la trame Excel (blocs d\'adresse)', xl.n === 6, JSON.stringify(xl));
  ok('doublon dans le fichier détecté, non fusionné', xl.dbl === 1 && xl.nouveaux === 5);
  ok('statuts de la trame convertis', xl.st.join(',') === "Intervention réalisée,Absent,À planifier,Problème technique,À planifier");
  ok('statut inconnu signalé et conservé en observation', xl.inconnus[0] === 'Bizarre');
  // import réel via l'écran (fichier choisi)
  const fx = path.join(OUT, 'trame_import.xlsx'); fs.writeFileSync(fx, Buffer.from(await E(async () => { const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('S'); ws.addRow(['Typo', 'Etage', 'Numero de Lgt', 'Adresse', 'Ville', 'Locataires', '1er Passage', '2e Passage', '3e Passage', 'Fait Oui/Non/Retour', 'Observation']);
    for (let n = 1; n <= 8; n++) ws.addRow([n % 2 ? 'T3' : 'T2', 'Étage ' + Math.ceil(n / 3), n, '5 av. de la République', 'Nanterre', '', n <= 3 ? new Date(Date.UTC(2026, 9, 1)) : null, n === 2 ? new Date(Date.UTC(2026, 9, 8)) : null, null, n === 1 ? 'Fait' : n === 2 ? 'Abs' : n === 3 ? 'Retour' : '', n === 3 ? 'à revoir' : '']);
    return B64(new Blob([await wb.xlsx.writeBuffer()])); }), 'base64'));
  await E(idc => { document.querySelector('#chantier_actif').innerHTML += `<option value="${idc}">x</option>`; document.querySelector('#chantier_actif').value = idc; APP.aller('logements'); }, idc);
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#imp')]); await fc.setFiles(fx);
  await pg.waitForSelector('.modal #ok'); await pg.click('.modal #ok'); await pg.waitForTimeout(800);
  ok('import Excel validé : logements créés', await E(() => DB.un('SELECT COUNT(*) FROM logements') === 8));
  ok('historique des passages repris du fichier', await E(() => DB.un("SELECT COUNT(*) FROM interventions WHERE origine='import'") === 2 && DB.un("SELECT COUNT(*) FROM passages WHERE resultat='Absent'") === 1));
  ok('fichier importé archivé dans le centre documentaire', await E(() => DB.un("SELECT COUNT(*) FROM documents WHERE categorie='Listes de logements'") === 1));
  // ---------- export suivi : relu = même contenu
  const rt = await E(async idc => { const r = await XL.fabriquerSuivi(idc); const { lignes } = await XL.lireClasseur(await r.blob.arrayBuffer()); await window.__s('suivi.xlsx', await B64(r.blob)); return { n: lignes.length, st: lignes.map(l => l.statutFichier).join(','), p: lignes[1].p.length, nom: r.nom }; }, idc).catch(async () => null);
  // (expose la fonction d'écriture vers le disque puis relance)
  await pg.exposeFunction('__s', (n, d) => sauver(n, d));
  const rt2 = await E(async idc => { const r = await XL.fabriquerSuivi(idc); const { lignes } = await XL.lireClasseur(await r.blob.arrayBuffer()); await window.__s('suivi.xlsx', await B64(r.blob)); return { n: lignes.length, st: lignes.map(l => l.statutFichier).join(','), p: lignes[1].p.length, nom: r.nom }; }, idc);
  ok('export suivi au format trame relu à l\'identique', rt2.n === 8 && rt2.st.startsWith('Fait,Abs,Retour') && rt2.p === 2, JSON.stringify(rt2));
  const cr = await E(async idc => { const r = await XL.fabriquerCR(idc); await window.__s('cr.xlsx', await B64(r.blob)); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await r.blob.arrayBuffer()); let noms = false; wb.eachSheet(ws => ws.eachRow(row => row.eachCell(c => { if (/DUPONT|MARTIN/.test(String(c.value))) noms = true; }))); return { feuilles: wb.worksheets.map(w => w.name), noms, nR: r.nR }; }, idc);
  ok('compte rendu bailleur sans nom d\'occupant', !cr.noms && cr.feuilles.join() === 'Synthèse,À repasser,À signaler', JSON.stringify(cr));
  // ---------- circuit : brouillon puis validation
  await E(idc => XL.exporterSuivi(idc), idc); await pg.waitForSelector('.modal #ok');
  ok('validation impossible sans case de contrôle', await pg.$eval('.modal #ok', x => x.disabled));
  await pg.click('.modal #br'); await pg.waitForTimeout(600);
  ok('brouillon archivé (statut brouillon)', await E(() => DB.un("SELECT COUNT(*) FROM documents WHERE statut='brouillon' AND categorie='Suivi logements'") === 1));
  await E(idc => XL.exporterSuivi(idc), idc); await pg.waitForSelector('.modal #ok'); await pg.check('.modal #vu');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('.modal #ok')]); await dl.saveAs(path.join(OUT, 'suivi_telecharge.xlsx'));
  ok('validation → téléchargement + archivage', /SUIVI DU REMPLACEMENT DES BOUCHES/.test(dl.suggestedFilename()) && await E(() => DB.un("SELECT COUNT(*) FROM documents WHERE statut='validé' AND categorie='Suivi logements'") === 1), dl.suggestedFilename());
  // ---------- Word : document standard + modèle avec balises éclatées entre runs
  const w = await E(async () => { const blob = await DOCX.generer('Rapport test', [{ champs: [['Chantier', 'Nanterre & Co <test>']] }, { h1: 'Constats' }, { p: 'ligne 1\nligne 2' }, { table: { entetes: ['A', 'B'], lignes: [['1', '2']] } }]); await window.__s('standard.docx', await B64(blob));
    const z = new JSZip(); const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Chantier : {{chan</w:t></w:r><w:r><w:t>tier}} le {{date}}</w:t></w:r></w:p><w:p><w:r><w:t>{{#logements}}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>';
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'); z.file('word/document.xml', doc);
    const modele = await z.generateAsync({ type: 'arraybuffer' }); const bal = await DOCX.balises(modele);
    const out = await DOCX.remplirModele(modele, { chantier: 'Parc Sud & Fils', date: '15/11/2026' }, { logements: { entetes: ['N°'], lignes: [['1'], ['2']] } }); await window.__s('modele_rempli.docx', await B64(out));
    const t = await DOCX.texte(await out.arrayBuffer()); const orig = await (await JSZip.loadAsync(modele)).file('word/document.xml').async('string');
    return { bal, t, origIntact: orig === doc }; });
  ok('balises détectées dans le modèle', w.bal.join() === 'chantier,date,#logements', w.bal.join());
  ok('modèle rempli (balise éclatée, échappement, tableau)', /Chantier : Parc Sud & Fils le 15\/11\/2026/.test(w.t) && /1\s*\n?2/.test(w.t), JSON.stringify(w.t.slice(0, 120)));
  ok('modèle d\'origine non modifié', w.origIntact);
  // ---------- centre documentaire : doublon exact, version, texte, recherche, assistant
  const d = await E(async idc => { const f1 = new File(['CCTP lot ventilation : débit cuisine T3 = 105 m3/h en pointe ; bouches hygro B.'], 'CCTP_VMC_ind_A.txt'), f2 = new File(['CCTP lot ventilation : débit cuisine T3 = 120 m3/h en pointe (indice B).'], 'CCTP_VMC_ind_B.txt'), f3 = new File(['CCTP lot ventilation : débit cuisine T3 = 105 m3/h en pointe ; bouches hygro B.'], 'copie.txt');
    const r1 = await DOCS.importerFichier(f1, { id_chantier: idc, categorie: 'CCTP / DCE' }), r2 = await DOCS.importerFichier(f2, { id_chantier: idc, categorie: 'CCTP / DCE' }), r3 = await DOCS.importerFichier(f3, { id_chantier: idc, categorie: 'CCTP / DCE' }, true);
    const rep = PD.repondre('débit cuisine T3', idc), rien = PD.repondre('garantie décennale toiture', idc);
    return { r1: r1.statut, r2: r2.statut + r2.version, r3: r3.statut, rep: rep.includes('105') && rep.includes('120') && rep.includes('version remplacée'), rien: /Information non trouvée/.test(rien) }; }, idc);
  ok('import document', d.r1 === 'ajouté'); ok('nouvelle version reconnue (même nom, autre indice)', d.r2 === 'version2'); ok('doublon exact refusé', d.r3 === 'doublon');
  ok('assistant : réponse sourcée, version remplacée signalée', d.rep); ok('assistant : « information non trouvée » sans invention', d.rien);
  ok('copie du document dans la base', await E(async () => (await DB.lireFichier(DB.q('SELECT chemin FROM documents WHERE ext=\'txt\' LIMIT 1')[0].chemin)).size > 10));
  // ---------- études VMC : provenance obligatoire, pas d'invention
  const et = await E(async idc => { const ide = await ET.creerEtude({ id_chantier: idc, titre: 'Étude VMC Parc Sud', systeme: 'Hygroréglable B' }); let refus = false;
    try { await ET.enregistrerEquipement(ide, { categorie: "Bouche d'extraction", designation: 'Bouche cuisine', fiabilite: 'Confirmé' }); } catch (e) { refus = true; }
    await ET.enregistrerEquipement(ide, { categorie: "Bouche d'extraction", designation: 'Bouche cuisine hygro B', typologie: 'T3', quantite: 1, reference: 'BAH 5-45/105', source_document: 'CCTP_VMC_ind_B', fiabilite: 'Confirmé' });
    await ET.enregistrerEquipement(ide, { categorie: "Bouche d'extraction", designation: 'Bouche SdB', typologie: 'T2', quantite: 1, fiabilite: 'Confirmé', source_document: 'CCTP' });
    const id3 = await ET.enregistrerEquipement(ide, { categorie: "Entrée d'air", designation: 'Entrée d\'air 30', quantite: '', fiabilite: 'Hypothèse' });
    const e3 = DB.q('SELECT * FROM equipements WHERE id=?', [id3])[0]; const pr = ET.propositionListing(ide); const typos = DB.q("SELECT typo,COUNT(*) n FROM logements WHERE id_chantier=? GROUP BY typo", [idc]);
    return { refus, e3fiab: e3.fiabilite, e3q: e3.quantite, lignes: pr.lignes.map(l => [l.designation, l.quantite, l.observations]), alertes: pr.alertes, typos, ide }; }, idc);
  ok('donnée « Confirmé » sans source refusée', et.refus);
  ok('hypothèse sans source gardée « Hypothèse », quantité absente laissée vide', et.e3fiab === 'Hypothèse' && et.e3q === null, et.e3fiab + ' / ' + et.e3q);
  const lT3 = et.lignes.find(l => l[0] === 'Bouche cuisine hygro B'), nT3 = (et.typos.find(t => t.typo === 'T3') || {}).n;
  ok('listing : quantité calculée à partir des logements réels', lT3 && lT3[1] === nT3 && /calcul : 1 ×/.test(lT3[2]), JSON.stringify(lT3));
  ok('listing : quantité non calculable laissée vide et signalée', et.lignes.some(l => l[1] === null) && et.alertes.length >= 1);
  // ---------- listing, doublons, demande de prix, offres, comparatif
  const cp = await E(async ([idc, ide]) => { const pr = ET.propositionListing(ide); const idl = await ET.creerListing(idc, 'Listing test', ide, pr.lignes.concat([{ designation: 'Bouche cuisine hygro B', reference: 'BAH 5-45/105', quantite: 2, unite: 'u' }]));
    const dbl = ET.doublons(idl); await ET.fusionnerLignes(dbl[0].lignes.map(l => l.id)); const apres = ET.doublons(idl).length;
    const L = DB.q('SELECT * FROM listing_lignes WHERE id_listing=? ORDER BY ordre', [idl]);
    await DB.tx(() => { DB.run('INSERT INTO demandes_prix(id,id_chantier,id_listing,titre,cree_le) VALUES(?,?,?,?,?)', ['DP-t', idc, idl, 'DP test', DB.now()]); DB.run("INSERT INTO offres(id,id_demande,fournisseur) VALUES('OF-a','DP-t','Lindab'),('OF-b','DP-t','Aldes')");
      DB.run('INSERT INTO offre_lignes(id,id_offre,id_ligne,prix_unitaire,remise) VALUES(?,?,?,?,?)', ['x1', 'OF-a', L[0].id, 10, 0]); DB.run('INSERT INTO offre_lignes(id,id_offre,id_ligne,prix_unitaire,remise) VALUES(?,?,?,?,?)', ['x2', 'OF-b', L[0].id, 12, 20]); });
    const k = ET.comparatif('DP-t'); const blob = await PT.classeurComparatif(k, k.d); await window.__s('comparatif.xlsx', await B64(blob)); const bl = await PT.classeurListing({ titre: 'Listing test', ch: 'Parc Sud' }, L, true); await window.__s('bordereau.xlsx', await B64(bl));
    return { dbl: dbl.length, apres, min: k.lignes[0].min, l0: k.lignes[0].px.map(p => p && +p.total.toFixed(2)), manq: k.totaux.map(t => t.manquants) }; }, [idc, et.ide]);
  ok('doublons de listing détectés puis regroupés sur décision', cp.dbl >= 1 && cp.apres === 0, JSON.stringify(cp));
  ok('comparatif : remise appliquée, moins cher identifié', cp.l0 && +cp.min.toFixed(2) === Math.min(...cp.l0.filter(x => x != null)) && cp.l0[0] === 38.4, JSON.stringify(cp.l0));
  // ---------- échanges PC ⇄ téléphone
  const L = await E(idc => DB.q("SELECT id FROM logements WHERE id_chantier=? ORDER BY CAST(numero AS INTEGER)", [idc]).map(r => r.id), idc);
  await E(async ([idc, L]) => M.creerIntervention({ id_chantier: idc, date: DB.today(), type: 'Passage', intervenant: 'Alexandre' }, [L[3], L[4], L[5]]), [idc, L]);
  await E(() => APP.aller('synchro')); await pg.waitForTimeout(300); await pg.click('#env'); await pg.waitForTimeout(800);
  const paquet = await E(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('OneDrive_EOPUR_OS'); const vt = await d.getDirectoryHandle('vers_telephone'); for await (const [n, h] of vt.entries()) if (n.includes('chantier')) return { n, b: await B64(await h.getFile()) }; });
  ok('paquet chantier déposé dans OneDrive/vers_telephone', !!paquet, paquet && paquet.n);
  const fp = path.join(OUT, paquet.n); fs.writeFileSync(fp, Buffer.from(paquet.b, 'base64'));
  const z = await E(async b => { const p = await EO.lire(Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer); const c = p.json('chantier.json'); return { occ: c.logements.some(l => 'occupant' in l), n: c.logements.length, it: c.interventions.length }; }, paquet.b);
  ok('paquet : strict nécessaire (pas de nom d\'occupant par défaut)', !z.occ && z.n === 8 && z.it === 1, JSON.stringify(z));
  // téléphone
  const tel = await ctx.newPage(); tel.on('pageerror', e => erreurs.push('[tel] ' + e.message)); await tel.setViewportSize({ width: 390, height: 844 });
  await tel.goto(BASE + 'mobile/'); await tel.waitForTimeout(500);
  await tel.setInputFiles('#recv', fp); await tel.waitForTimeout(600);
  ok('téléphone : chantier reçu', (await tel.textContent('#vue')).includes('Nanterre Parc Sud'));
  await tel.click('nav [data-e="jour"]'); await tel.waitForTimeout(200); await tel.click('[data-i]'); await tel.waitForTimeout(200);
  const lgs = await tel.$$('[data-l]'); ok('téléphone : logements de l\'intervention du jour', lgs.length === 3);
  await lgs[0].click(); await tel.waitForTimeout(200); await tel.click('[data-r="Intervention réalisée"]'); await tel.fill('#obs', 'bouches posées'); await tel.click('#ok'); await tel.waitForTimeout(300);
  await (await tel.$$('[data-l]'))[1].click(); await tel.waitForTimeout(200); await tel.click('[data-r="Absent"]'); await tel.fill('#rep', '2030-03-03'); await tel.click('#ok'); await tel.waitForTimeout(300);
  await (await tel.$$('[data-l]'))[2].click(); await tel.waitForTimeout(200); await tel.click('[data-r="Problème technique"]'); await tel.click('#ok'); await tel.waitForTimeout(200);
  ok('téléphone : observation exigée pour un problème technique', (await tel.textContent('#msg')).includes('observation'));
  await tel.fill('#obs', 'conduit écrasé'); await tel.click('#ok'); await tel.waitForTimeout(300);
  await (await tel.$$('[data-l]'))[2].click(); await tel.waitForTimeout(200); await tel.click('#ano'); await tel.fill('#ds', 'Conduit écrasé dans la gaine palière'); await tel.selectOption('#pr', 'Haute'); await tel.click('#ok'); await tel.waitForTimeout(300);
  // hors ligne : les saisies restent après rechargement
  await tel.reload(); await tel.waitForTimeout(500); await tel.click('nav [data-e="envoi"]'); await tel.waitForTimeout(200);
  ok('téléphone : 4 saisies conservées localement', (await tel.textContent('#ev')).includes('4'));
  // conflit : le PC modifie le 3e logement entre-temps
  await E(async l => M.majLogement(l, { observation: 'modifié au bureau' }), L[5]);
  const [dlt] = await Promise.all([tel.waitForEvent('download'), tel.click('#ev')]); const fo = path.join(OUT, dlt.suggestedFilename()); await dlt.saveAs(fo);
  ok('téléphone : paquet d\'opérations produit', /eopur_operations_/.test(dlt.suggestedFilename()));
  const depot = async f => E(async ([n, b]) => { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('OneDrive_EOPUR_OS')).getDirectoryHandle('vers_pc'); const h = await d.getFileHandle(n, { create: true }), w = await h.createWritable(); await w.write(Uint8Array.from(atob(b), c => c.charCodeAt(0))); await w.close(); }, [path.basename(f), fs.readFileSync(f).toString('base64')]);
  await depot(fo);
  // paquet tronqué (transfert incomplet) : laissé en place
  fs.writeFileSync(path.join(OUT, 'eopur_operations_tronque.zip'), fs.readFileSync(fo).subarray(0, 200)); await depot(path.join(OUT, 'eopur_operations_tronque.zip'));
  const an = await E(async () => { const p = await SY.analyser(); return p.map(x => ({ nom: x.nom, etat: x.etat, ops: x.ops.map(o => o.res) })); });
  ok('PC : paquet tronqué détecté et laissé en place', an.some(x => x.etat === 'illisible'), JSON.stringify(an));
  const bon = an.find(x => x.etat === 'à intégrer');
  ok('PC : contrôle des opérations (3 ok, 1 conflit)', bon && bon.ops.filter(r => r === 'ok').length === 3 && bon.ops.filter(r => r === 'conflit').length === 1, JSON.stringify(bon));
  ok('rien n\'est intégré avant validation', await E(() => DB.un("SELECT COUNT(*) FROM anomalies WHERE source='téléphone'") === 0));
  await E(async () => { const p = SY.propositions.find(x => x.etat === 'à intégrer'); await SY.integrer(p); });
  ok('PC : intégration (résultats, anomalie, intervention réalisée partiellement)', await E(([l0, l1]) => DB.q('SELECT statut FROM logements WHERE id=?', [l0])[0].statut === 'Intervention réalisée' && DB.q('SELECT repassage FROM logements WHERE id=?', [l1])[0].repassage === '2030-03-03' && DB.un("SELECT COUNT(*) FROM anomalies WHERE source='téléphone' AND priorite='Haute'") === 1, [L[3], L[4]]));
  ok('PC : conflit enregistré, valeur du PC conservée', await E(l => DB.un("SELECT COUNT(*) FROM conflits WHERE etat='ouvert'") === 1 && DB.q('SELECT observation FROM logements WHERE id=?', [l])[0].observation === 'modifié au bureau', L[5]));
  ok('PC : sauvegarde automatique avant intégration', await E(async () => (await DB.listeSauvegardes()).some(s => s.nom.includes('avant-integration'))));
  // idempotence : le même paquet redéposé
  await depot(fo); const an2 = await E(async () => (await SY.analyser()).map(x => x.etat));
  ok('PC : paquet redéposé reconnu « déjà intégré » (pas de double intégration)', an2.includes('déjà intégré') && await E(() => DB.un("SELECT COUNT(*) FROM anomalies WHERE source='téléphone'") === 1), JSON.stringify(an2));
  // conflit tranché
  await E(async () => SY.resoudre(DB.q("SELECT id FROM conflits WHERE etat='ouvert'")[0].id, 'mobile'));
  ok('conflit tranché : valeur du téléphone retenue et historisée', await E(l => { const x = DB.q('SELECT statut,observation FROM logements WHERE id=?', [l])[0]; return x.statut === 'Problème technique' && x.observation === 'conduit écrasé'; }, L[5]));
  // accusés vers le téléphone
  const acc = await E(async () => { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('OneDrive_EOPUR_OS')).getDirectoryHandle('vers_telephone'); const o = []; for await (const [n, h] of d.entries()) if (n.includes('accuse')) o.push({ n, b: await B64(await h.getFile()), t: (await h.getFile()).lastModified }); return o.sort((a, b) => a.t - b.t); });
  ok('accusés « reçu » et « intégré » déposés', acc.length >= 3, acc.length + ' accusé(s)');
  for (const a of acc) { const f = path.join(OUT, a.n); fs.writeFileSync(f, Buffer.from(a.b, 'base64')); await tel.setInputFiles('#recv', f); await tel.waitForTimeout(250); }
  await tel.click('nav [data-e="envoi"]'); await tel.waitForTimeout(200); const txt = await tel.textContent('#vue');
  ok('téléphone : toutes les saisies confirmées « intégré »', /Intégré à la base\s*4/.test(txt.replace(/\s+/g, ' ')), txt.replace(/\s+/g, ' ').slice(0, 300));
  ok('fichiers traités déplacés dans « traites »', await E(async () => { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('OneDrive_EOPUR_OS')).getDirectoryHandle('traites'); let n = 0; for await (const x of d.keys()) n++; return n >= 1; }));
  await tel.screenshot({ path: path.join(__dirname, 'capture_mobile.png') });
  // ---------- exports Word par les écrans : rapport + avis
  await E(([idc, ide]) => APP.aller('etudes:' + ide), [idc, et.ide]); await pg.waitForTimeout(300); await pg.click('#wd'); await pg.waitForSelector('.modal #vu'); await pg.check('.modal #vu');
  const [de] = await Promise.all([pg.waitForEvent('download'), pg.click('.modal #ok')]); await de.saveAs(path.join(OUT, 'etude.docx'));
  ok('étude VMC exportée en Word (données non confirmées signalées)', de.suggestedFilename().endsWith('.docx'));
  await pg.screenshot({ path: path.join(__dirname, 'capture_etude.png') });
  ok('aucune erreur JavaScript', !erreurs.length, erreurs.slice(0, 5).join(' | '));
  await b.close(); const ko = res.filter(r => !r[1]); console.log('\n' + (res.length - ko.length) + '/' + res.length + ' réussis'); process.exit(ko.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
