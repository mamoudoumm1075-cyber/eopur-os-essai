// EOPUR OS – Excel : import de logements, suivi au format de la trame EOPUR, compte rendu de passage
const XL = (() => {
  const { esc, toast, dateFr } = UI, q = DB.q, un = DB.un;
  const ENTETE = ['Typo', 'Etage', 'Numero de Lgt', 'Adresse', 'Ville', 'Locataires', '1er Passage', '2e Passage', '3e Passage', 'Fait Oui/Non/Retour', 'Observation'];
  const LARG = [7, 16, 13, 26, 14, 30, 13, 13, 13, 18, 60], BLEU = 'FF1F3864', GRIS = 'FFD9E1F2';
  // correspondance entre la trame (Fait / Abs / Retour / Com Client / Inaccessible / Refus) et les statuts EOPUR OS
  const DE_TRAME = { 'fait': 'Intervention réalisée', 'oui': 'Intervention réalisée', 'abs': 'Absent', 'absent': 'Absent', 'retour': 'À repasser', 'com client': 'Problème technique', 'inaccessible': 'Inaccessible', 'refus': "Refus d'accès", 'non': 'À repasser' };
  const VERS_TRAME = { 'Intervention réalisée': 'Fait', 'Terminé': 'Fait', 'Absent': 'Abs', 'À repasser': 'Retour', 'Problème technique': 'Com Client', 'Inaccessible': 'Inaccessible', "Refus d'accès": 'Refus' };
  const enDate = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return y ? new Date(Date.UTC(y, m - 1, d)) : null; };
  function versIso(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
    const s = String(v).trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  }
  const texte = v => { if (v == null) return ''; if (typeof v === 'object') { if (v.richText) return v.richText.map(r => r.text).join('').trim(); if (v.text != null) return String(v.text).trim(); if (v.result != null) return String(v.result).trim(); if (v instanceof Date) return v.toISOString().slice(0, 10); } return String(v).trim(); };
  const sansAcc = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  // lecture : repère chaque ligne d'en-tête (n° de logement + adresse/étage/typo) puis lit le bloc qui suit
  async function lireClasseur(buf) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const lignes = [], feuilles = [];
    wb.eachSheet(ws => {
      let col = null, n = 0;
      ws.eachRow({ includeEmpty: false }, row => {
        const vals = []; for (let c = 1; c <= 20; c++) vals.push(row.getCell(c).value);
        const t = vals.map(texte), k = t.map(sansAcc);
        const iNum = k.findIndex(x => /^(numero|n°|no|num)\b|numero de l|n° de l|n° lgt|logement$/.test(x));
        if (iNum >= 0 && k.some(x => /^(adresse|etage|typo)/.test(x))) {
          col = {}; k.forEach((h, i) => {
            if (h === 'typo' || h.startsWith('typolog')) col.typo = i; else if (h.startsWith('etage') || h === 'niveau') col.etage = i; else if (i === iNum) col.numero = i;
            else if (h.startsWith('adresse')) col.adresse = i; else if (h === 'ville' || h === 'commune') col.ville = i; else if (h.startsWith('locataire') || h.startsWith('occupant') || h === 'nom') col.occupant = i;
            else if (h.startsWith('tel')) col.telephone = i; else if (h.startsWith('bat')) col.batiment = i; else if (h.startsWith('cage') || h.startsWith('escalier')) col.cage = i;
            else if (h.startsWith('1er') || h.startsWith('1e ')) col.p1 = i; else if (h.startsWith('2e') || h.startsWith('2eme')) col.p2 = i; else if (h.startsWith('3e') || h.startsWith('3eme')) col.p3 = i;
            else if (h.startsWith('fait') || h === 'statut' || h === 'etat') col.statut = i; else if (h.startsWith('observ') || h.startsWith('remarque') || h.startsWith('commentaire')) col.observation = i;
          }); return;
        }
        if (!col || col.numero == null || !t[col.numero]) return;
        const g = x => col[x] == null ? '' : t[col[x]], d = x => col[x] == null ? '' : versIso(vals[col[x]]);
        lignes.push({ feuille: ws.name, ligne: row.number, typo: g('typo'), etage: g('etage'), numero: g('numero'), adresse: g('adresse'), ville: g('ville'), occupant: g('occupant'), telephone: g('telephone'), batiment: g('batiment'), cage: g('cage'),
          p: [d('p1'), d('p2'), d('p3')].filter(Boolean), statutFichier: g('statut'), observation: g('observation') }); n++;
      });
      if (n) feuilles.push(ws.name + ' (' + n + ')');
    });
    return { lignes, feuilles };
  }
  function analyser(idc, lignes) {
    const vus = new Map(), res = { nouveaux: [], doublonsBase: [], doublonsFichier: [], statutsInconnus: new Set() };
    for (const l of lignes) {
      const s = sansAcc(l.statutFichier || ''); l.statut = !s ? (l.p.length ? 'À repasser' : 'À planifier') : DE_TRAME[s] || null;
      if (s && !l.statut) { res.statutsInconnus.add(l.statutFichier); l.statut = 'À planifier'; l.observation = '[statut du fichier : ' + l.statutFichier + '] ' + (l.observation || ''); }
      if (!s && l.p.length) l.observation = '[passage(s) sans résultat dans le fichier] ' + (l.observation || '');
      const k = M.cleLog(l);
      if (M.existeLogement(idc, l)) { res.doublonsBase.push(l); continue; }
      if (vus.has(k)) { res.doublonsFichier.push(Object.assign(l, { premier: vus.get(k) })); continue; }
      vus.set(k, l.feuille + ' ligne ' + l.ligne); res.nouveaux.push(l);
    }
    return res;
  }
  // import : aperçu, contrôle, validation ; les doublons ne sont jamais fusionnés
  function importerLogements(idc) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xlsm';
    inp.onchange = () => UI.action(async () => {
      const f = inp.files[0]; const { lignes, feuilles } = await lireClasseur(await f.arrayBuffer());
      if (!lignes.length) throw new Error('aucune ligne de logement reconnue : il faut une ligne d\'en-tête avec « Numero de Lgt » (ou « N° ») et « Adresse »/« Etage »/« Typo »');
      const a = analyser(idc, lignes), avecP = a.nouveaux.filter(l => l.p.length).length;
      const m = UI.fenetre('Import de « ' + f.name + ' »', `<p>Feuilles lues : ${esc(feuilles.join(', '))}</p>
        <div class="ok-l">${a.nouveaux.length} logement(s) à créer${avecP ? ' dont ' + avecP + ' avec des dates de passage' : ''}</div>
        ${a.doublonsBase.length ? `<div class="alerte-l">${a.doublonsBase.length} logement(s) déjà présents dans le chantier : ignorés (aucune fusion automatique). ${esc(a.doublonsBase.slice(0, 8).map(l => l.adresse + ' n° ' + l.numero).join(', '))}${a.doublonsBase.length > 8 ? '…' : ''}</div>` : ''}
        ${a.doublonsFichier.length ? `<div class="alerte-l">${a.doublonsFichier.length} doublon(s) dans le fichier : seule la première occurrence est prise. ${esc(a.doublonsFichier.slice(0, 6).map(l => l.adresse + ' n° ' + l.numero + ' (' + l.feuille + ' l.' + l.ligne + ')').join(', '))}</div>` : ''}
        ${a.statutsInconnus.size ? `<div class="alerte-l">Statut(s) non reconnu(s) : ${esc([...a.statutsInconnus].join(', '))} → logement « À planifier », valeur d'origine conservée dans l'observation.</div>` : ''}
        <div class="tw" style="max-height:40vh"><table class="t"><tr><th>Feuille</th><th>Ligne</th><th>Adresse</th><th>Étage</th><th>N°</th><th>Statut fichier</th><th>→ Statut</th><th>Passages</th><th>Observation</th></tr>${a.nouveaux.slice(0, 400).map(l => `<tr><td>${esc(l.feuille)}</td><td>${l.ligne}</td><td>${esc(l.adresse)}</td><td>${esc(l.etage)}</td><td>${esc(l.numero)}</td><td>${esc(l.statutFichier)}</td><td>${UI.pastille(l.statut)}</td><td>${l.p.map(dateFr).join(', ')}</td><td>${esc(l.observation)}</td></tr>`).join('')}</table></div>
        <label style="display:block;margin-top:10px"><input type="checkbox" id="hp" checked> Créer l'historique des passages à partir des dates du fichier (interventions « Réalisée », résultat du dernier passage = statut du fichier, passages antérieurs sans résultat précisé)</label>
        <div class="pied"><button class="b" id="ok" ${a.nouveaux.length ? '' : 'disabled'}>Valider l'import</button></div>`, true);
      m.querySelector('#ok').onclick = () => UI.action(async () => {
        const hp = m.querySelector('#hp').checked;
        await DB.tx(() => {
          const parDate = {};
          for (const l of a.nouveaux) { const lid = M.insererLogement(idc, l, 'import Excel ' + f.name); if (hp) l.p.forEach((d, k) => (parDate[d] = parDate[d] || []).push([lid, k === l.p.length - 1 && l.statutFichier ? l.statut : '', k === l.p.length - 1 ? l.observation : ''])); }
          for (const [d, L] of Object.entries(parDate)) {
            const iid = DB.id('IT'); DB.run('INSERT INTO interventions(id,id_chantier,date,type,statut,observations,origine,cree_le,maj_le) VALUES(?,?,?,?,?,?,?,?,?)', [iid, idc, d, 'Passage', 'Réalisée', 'Passage repris du fichier ' + f.name, 'import', DB.now(), DB.now()]);
            for (const [lid, r, o] of L) DB.run('INSERT INTO passages(id,id_intervention,id_logement,resultat,observation,saisi_le,saisi_par) VALUES(?,?,?,?,?,?,?)', [DB.id('PA'), iid, lid, DB.RESULTATS.includes(r) ? r : '', r ? o : 'résultat non précisé dans le fichier importé', DB.now(), 'import']);
          }
          DB.hist('chantier', idc, idc, 'import Excel « ' + f.name + ' » : ' + a.nouveaux.length + ' logement(s) créé(s), ' + (a.doublonsBase.length + a.doublonsFichier.length) + ' doublon(s) ignoré(s)', null, 'import');
          DB.journal('import Excel', f.name + ' – ' + a.nouveaux.length + ' créés');
        });
        // le fichier source est archivé tel quel dans le centre documentaire
        await DOCS.importerFichier(f, { id_chantier: idc, categorie: 'Listes de logements', origine: 'import logements' }, true);
        m.remove(); toast(a.nouveaux.length + ' logement(s) importé(s)'); APP.rafraichir();
      });
    });
    inp.click();
  }
  // passages réels d'un logement (hors interventions annulées), dans l'ordre
  const passagesDe = lid => q("SELECT i.date FROM passages p JOIN interventions i ON i.id=p.id_intervention WHERE p.id_logement=? AND i.statut<>'Annulée' AND (p.resultat<>'' OR i.statut='Réalisée') ORDER BY i.date", [lid]).map(r => r.date);
  const bord = () => ({ top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } });
  const triLg = (a, b) => String(a.adresse).localeCompare(b.adresse, 'fr', { numeric: true }) || String(a.batiment).localeCompare(b.batiment, 'fr', { numeric: true }) || (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0) || String(a.numero).localeCompare(b.numero);
  const blobDe = async wb => new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const horo = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()); };
  const nomMaj = s => UI.nomFichier(s).replace(/_/g, ' ').toUpperCase();
  function controler(idc) {
    const lg = q('SELECT * FROM logements WHERE id_chantier=?', [idc]), al = [];
    const obs = lg.filter(l => ['À repasser', 'Problème technique', 'Inaccessible', "Refus d'accès"].includes(l.statut) && !l.observation); if (obs.length) al.push(obs.length + ' logement(s) « À repasser / Problème technique / Inaccessible / Refus » sans observation : ' + obs.slice(0, 6).map(l => l.adresse + ' n° ' + l.numero).join(', ') + (obs.length > 6 ? '…' : ''));
    const sansP = lg.filter(l => VERS_TRAME[l.statut] && !passagesDe(l.id).length); if (sansP.length) al.push(sansP.length + ' logement(s) avec un résultat mais sans date de passage');
    const nonT = lg.filter(l => !VERS_TRAME[l.statut]); if (nonT.length) al.push(nonT.length + ' logement(s) sans résultat de passage (colonne « Fait » vide)');
    const cf = un("SELECT COUNT(*) FROM conflits c JOIN logements l ON l.id=c.id_logement WHERE c.etat='ouvert' AND l.id_chantier=?", [idc]); if (cf) al.push(cf + ' conflit(s) téléphone/PC non tranché(s) : les valeurs exportées sont celles du PC');
    const sansAd = lg.filter(l => !l.adresse); if (sansAd.length) al.push(sansAd.length + ' logement(s) sans adresse');
    return { n: lg.length, alertes: al };
  }
  function entete(ws, r) { const row = ws.getRow(r); ENTETE.forEach((h, i) => { const c = row.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLEU } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = bord(); }); row.height = 30; }
  async function fabriquerSuivi(idc) {
    const c = q('SELECT * FROM chantiers WHERE id=?', [idc])[0], lg = q('SELECT * FROM logements WHERE id_chantier=?', [idc]).sort(triLg);
    const wb = new ExcelJS.Workbook(); wb.creator = 'EOPUR OS'; wb.created = new Date();
    const ws = wb.addWorksheet('Suivi', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    LARG.forEach((w, i) => ws.getColumn(i + 1).width = w);
    let r = 1, ad = null;
    for (const l of lg) {
      if (l.adresse !== ad) { ad = l.adresse; entete(ws, r++); }
      const row = ws.getRow(r++), P = passagesDe(l.id), st = VERS_TRAME[l.statut] || '';
      [l.typo, l.etage, l.numero, l.adresse, l.ville, l.occupant, enDate(P[0]), enDate(P[1]), enDate(P[2]), st, l.observation].forEach((x, i) => { const cl = row.getCell(i + 1); cl.value = (x === '' || x == null) ? null : (i === 2 && /^\d+$/.test(x) ? +x : x); cl.border = bord(); cl.alignment = { vertical: 'top', wrapText: i === 10, horizontal: [0, 2, 6, 7, 8, 9].includes(i) ? 'center' : 'left' }; if (i >= 6 && i <= 8) cl.numFmt = 'dd/mm/yyyy'; });
      if (st) row.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st === 'Fait' ? 'FFC6EFCE' : ['Abs', 'Retour'].includes(st) ? 'FFFFEB9C' : 'FFFFC7CE' } };
    }
    return { blob: await blobDe(wb), nom: 'SUIVI DU REMPLACEMENT DES BOUCHES ' + nomMaj(c.nom) + ' ' + horo() + '.xlsx', lg };
  }
  function chiffres(idc) {
    const lg = q('SELECT * FROM logements WHERE id_chantier=?', [idc]).sort(triLg), st = ['Fait', 'Abs', 'Retour', 'Com Client', 'Inaccessible', 'Refus'];
    lg.forEach(l => l.t = VERS_TRAME[l.statut] || '');
    const tot = {}; st.forEach(s => tot[s] = lg.filter(l => l.t === s).length); tot['Sans résultat'] = lg.filter(l => !l.t).length;
    const ads = [...new Set(lg.map(l => l.adresse))].map(a => { const x = lg.filter(l => l.adresse === a), o = { adresse: a, n: x.length }; st.forEach(s => o[s] = x.filter(l => l.t === s).length); o.av = x.length ? o.Fait / x.length : 0; return o; });
    return { lg, st, tot, ads, n: lg.length };
  }
  async function fabriquerCR(idc) {
    const c = q('SELECT * FROM chantiers WHERE id=?', [idc])[0], k = chiffres(idc), wb = new ExcelJS.Workbook(); wb.creator = 'EOPUR OS';
    const titre = (ws, t, s) => { ws.getCell('A1').value = t; ws.getCell('A1').font = { bold: true, size: 14, color: { argb: BLEU } }; ws.getCell('A2').value = s; ws.getCell('A2').font = { italic: true, color: { argb: 'FF555555' } }; };
    const tete = (ws, r, cols) => { const row = ws.getRow(r); cols.forEach((h, i) => { const cl = row.getCell(i + 1); cl.value = h; cl.font = { bold: true }; cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }; cl.border = bord(); cl.alignment = { wrapText: true, vertical: 'middle' }; }); };
    const sous = 'Chantier : ' + c.nom + (c.client ? ' – ' + c.client : '') + ' – état au ' + new Date().toLocaleDateString('fr-FR');
    const s1 = wb.addWorksheet('Synthèse'); [34, 12, 10, 10, 10, 12, 13, 10, 12].forEach((w, i) => s1.getColumn(i + 1).width = w);
    titre(s1, 'Compte rendu de passage – remplacement des bouches', sous); tete(s1, 4, ['Statut', 'Logements']); let r = 5;
    for (const [s, n] of Object.entries(k.tot)) { s1.getCell('A' + r).value = s; s1.getCell('B' + r).value = n; ['A', 'B'].forEach(x => s1.getCell(x + r).border = bord()); r++; }
    s1.getCell('A' + r).value = 'Total'; s1.getCell('B' + r).value = k.n; s1.getRow(r).font = { bold: true }; r += 2;
    s1.getCell('A' + r).value = 'Avancement'; s1.getCell('B' + r).value = k.n ? k.tot.Fait / k.n : 0; s1.getCell('B' + r).numFmt = '0%'; s1.getRow(r).font = { bold: true }; r += 2;
    tete(s1, r, ['Adresse', 'Logements', ...k.st, 'Avancement']); r++;
    for (const a of k.ads) { const row = s1.getRow(r++); [a.adresse, a.n, ...k.st.map(s => a[s]), a.av].forEach((x, i) => { const cl = row.getCell(i + 1); cl.value = x; cl.border = bord(); if (i === 8) cl.numFmt = '0%'; }); }
    const cols = ['Adresse', 'Étage', 'N° logement', 'Typo', '1er passage', '2e passage', '3e passage', 'Statut', 'Observation'];
    const liste = (nom, t, filtre) => { const ws = wb.addWorksheet(nom); [26, 16, 12, 8, 13, 13, 13, 14, 60].forEach((w, i) => ws.getColumn(i + 1).width = w); titre(ws, t, sous); tete(ws, 4, cols); let rr = 5;
      for (const l of k.lg.filter(filtre)) { const P = passagesDe(l.id), row = ws.getRow(rr++); [l.adresse, l.etage, l.numero, l.typo, enDate(P[0]), enDate(P[1]), enDate(P[2]), l.t, l.observation].forEach((x, i) => { const cl = row.getCell(i + 1); cl.value = x || null; cl.border = bord(); if (i >= 4 && i <= 6) cl.numFmt = 'dd/mm/yyyy'; if (i === 8) cl.alignment = { wrapText: true, vertical: 'top' }; }); }
      if (rr === 5) ws.getCell('A5').value = 'Aucun logement.'; return rr - 5; };
    const nR = liste('À repasser', 'Logements à repasser', l => ['Abs', 'Retour', 'Inaccessible', 'Refus'].includes(l.t));
    const nC = liste('À signaler', 'Impossibilités techniques à signaler', l => l.t === 'Com Client');
    return { blob: await blobDe(wb), nom: 'COMPTE RENDU DE PASSAGE ' + nomMaj(c.nom) + ' ' + horo() + '.xlsx', k, nR, nC };
  }
  function texteMail(idc) {
    const c = q('SELECT * FROM chantiers WHERE id=?', [idc])[0], k = chiffres(idc);
    return ['Bonjour,', '', 'Veuillez trouver ci-joint le compte rendu de passage pour le remplacement des bouches, ' + c.nom + ', état au ' + new Date().toLocaleDateString('fr-FR') + '.', '',
      'Sur ' + k.n + ' logements : ' + Object.entries(k.tot).filter(([, n]) => n).map(([s, n]) => n + ' ' + ({ Fait: 'faits', Abs: 'absents', Retour: 'avec retour à prévoir', 'Com Client': 'avec une impossibilité technique à vous signaler', Inaccessible: 'inaccessibles', Refus: 'refus d\'accès', 'Sans résultat': 'restant à visiter' }[s] || s)).join(', ') + '.',
      'Avancement : ' + (k.n ? Math.round(100 * k.tot.Fait / k.n) : 0) + ' %.', '', 'Le détail des logements à repasser et des impossibilités techniques figure dans le fichier joint.', '', 'Cordialement.'].join('\n');
  }
  // export du suivi : aperçu + contrôle + validation, puis archivage
  function exporterSuivi(idc) {
    const k = chiffres(idc), ctl = controler(idc);
    DOCS.circuit({ titre: 'Export du suivi des logements (trame EOPUR)', id_chantier: idc, categorie: 'Suivi logements', alertes: ctl.alertes,
      apercu: `<p>${k.n} logement(s) · ${Object.entries(k.tot).map(([s, n]) => s + ' : ' + n).join(' · ')}</p><p class="s">Colonnes : ${ENTETE.join(' | ')}. Un bloc d'en-tête par adresse. Contient le nom des occupants : usage interne.</p>` +
        '<div class="tw" style="max-height:40vh"><table class="t"><tr>' + ENTETE.map(h => '<th>' + h + '</th>').join('') + '</tr>' + k.lg.slice(0, 300).map(l => { const P = passagesDe(l.id); return `<tr><td>${esc(l.typo)}</td><td>${esc(l.etage)}</td><td>${esc(l.numero)}</td><td>${esc(l.adresse)}</td><td>${esc(l.ville)}</td><td>${esc(l.occupant)}</td><td>${dateFr(P[0])}</td><td>${dateFr(P[1])}</td><td>${dateFr(P[2])}</td><td>${esc(l.t)}</td><td>${esc(l.observation)}</td></tr>`; }).join('') + '</table></div>' +
        `<p style="margin-top:12px"><button class="b g" id="cr">Compte rendu bailleur (sans noms) à la place</button></p>`,
      produire: () => fabriquerSuivi(idc), apres: m => { const b = m.querySelector('#cr'); if (b) b.onclick = () => { m.remove(); exporterCR(idc); }; } });
  }
  function exporterCR(idc) {
    const k = chiffres(idc), ctl = controler(idc);
    DOCS.circuit({ titre: 'Compte rendu de passage (bailleur, sans nom ni téléphone)', id_chantier: idc, categorie: 'Comptes rendus', alertes: ctl.alertes,
      apercu: `<table class="t"><tr><th>Statut</th><th>Logements</th></tr>${Object.entries(k.tot).map(([s, n]) => `<tr><td>${s}</td><td>${n}</td></tr>`).join('')}<tr><th>Total</th><th>${k.n}</th></tr></table><h4>Texte du mail proposé</h4><textarea style="width:100%;height:170px">${esc(texteMail(idc))}</textarea>`,
      produire: () => fabriquerCR(idc) });
  }
  return { lireClasseur, analyser, importerLogements, exporterSuivi, exporterCR, fabriquerSuivi, fabriquerCR, controler, texteMail, versIso, chiffres, passagesDe, VERS_TRAME, DE_TRAME, blobDe, bord, horo };
})();
