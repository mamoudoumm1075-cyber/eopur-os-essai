// Parcours à la souris : avis de passage, rapport de visite, DOE, centre documentaire, listing et demande de prix
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765/', OUT = path.join(__dirname, 'sorties');
const res = []; const ok = (n, c, d) => { res.push([n, !!c]); console.log((c ? 'OK  ' : 'ÉCHEC ') + n + (d ? ' – ' + d : '')); };
const PREP = require('./prep');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } }); const pg = await ctx.newPage();
  const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
  await pg.addInitScript(PREP); await pg.goto(BASE + 'pc.html'); await pg.click('#acc_btn button'); await pg.waitForSelector('#accueil', { state: 'detached' });
  const E = (f, a) => pg.evaluate(f, a);
  const telecharge = async (clic, nom) => { const [d] = await Promise.all([pg.waitForEvent('download'), clic()]); await d.saveAs(path.join(OUT, nom || d.suggestedFilename())); return d.suggestedFilename(); };
  const valider = async () => { await pg.waitForSelector('.modal #vu'); await pg.check('.modal #vu'); return telecharge(() => pg.click('.modal #ok')); };
  // chantier par l'écran
  await E(() => APP.aller('chantiers')); await pg.click('#nv'); await pg.fill('#f_reference', 'UI-1'); await pg.fill('#f_nom', 'Cité des Fleurs'); await pg.fill('#f_adresse', '3 rue Rose'); await pg.fill('#f_ville', 'Colombes'); await pg.click('.modal button:not([data-x])'); await pg.waitForTimeout(400);
  ok('chantier créé par le formulaire, fiche ouverte', (await pg.textContent('#titre')).includes('Cité des Fleurs'));
  await pg.click('#actif'); await pg.click('[data-o="inter"]'); await pg.waitForTimeout(150); await pg.click('#ai'); await pg.fill('#f_nom', 'M. Gardien'); await pg.selectOption('#f_role', 'Gardien'); await pg.fill('#f_telephone', '06 00 00 00 00'); await pg.click('.modal button:not([data-x])'); await pg.waitForTimeout(300);
  ok('interlocuteur ajouté', (await pg.textContent('#zone')).includes('M. Gardien'));
  await E(() => APP.aller('logements')); await pg.click('#ser'); await pg.fill('#f_adresse', '3 rue Rose'); await pg.fill('#f_niveaux', '3'); await pg.fill('#f_parNiveau', '2'); await pg.click('.modal button:not([data-x])'); await pg.waitForTimeout(500);
  ok('création en série par l\'écran', (await pg.$$('#zone tbody tr[data-id]')).length === 6);
  // avis de passage depuis une sélection
  const cases = await pg.$$('#zone [data-s]'); await cases[0].check(); await cases[1].check(); await cases[2].check(); await pg.click('#s_av'); await pg.waitForSelector('#f_date');
  await pg.fill('#f_date', '2030-05-05'); await pg.fill('#f_horaires', 'entre 8 h et 12 h'); await pg.fill('#f_telephone_contact', '01 23 45 67 89'); await pg.fill('#f_contact', 'EOPUR'); await pg.click('.modal button:not([data-x])');
  const fa = await valider(); await pg.waitForTimeout(400);
  ok('avis de passage groupé produit (Word)', fa.endsWith('.docx'), fa);
  ok('logements avisés passent « À prévenir »', await E(() => DB.un("SELECT COUNT(*) FROM logements WHERE statut='À prévenir'") === 3));
  // planification par l'écran + rapport
  await E(() => APP.aller('logements')); await pg.waitForTimeout(200); for (const c of (await pg.$$('#zone [data-s]')).slice(0, 4)) await c.check(); await pg.click('#s_pl'); await pg.waitForSelector('#f_date');
  await pg.fill('#f_date', await E(() => DB.today())); await pg.fill('#f_heure_debut', '09:00'); await pg.fill('#f_intervenant', 'Alexandre'); await pg.click('.modal button:not([data-x])'); await pg.waitForTimeout(500);
  const iid = await E(() => DB.q('SELECT id FROM interventions')[0].id); await E(i => APP.aller('interventions:' + i), iid); await pg.waitForTimeout(300);
  const lignes = await pg.$$('tr[data-p]'); ok('intervention : 4 passages à saisir', lignes.length === 4);
  await lignes[0].$('select').then(s => s.selectOption('Absent')); await lignes[0].$('[data-k="repassage"]').then(i => i.fill('2030-06-01')); await (await lignes[0].$('[data-ok]')).click(); await pg.waitForTimeout(400);
  ok('saisie d\'un résultat à l\'écran', await E(() => DB.un("SELECT COUNT(*) FROM logements WHERE statut='Absent' AND repassage='2030-06-01'") === 1));
  await pg.click('#tous'); await pg.click('.modal [data-o]'); await pg.waitForTimeout(500);
  ok('saisie groupée « réalisée » + intervention « Réalisée »', await E(i => DB.q('SELECT statut FROM interventions WHERE id=?', [i])[0].statut === 'Réalisée', iid));
  await pg.click('#rap'); await pg.waitForSelector('#f_objet'); await pg.fill('#f_redacteur', 'M. Magassa'); await pg.fill('#f_constats', 'Bouches remplacées sur 3 logements.'); await pg.click('.modal button:not([data-x])');
  const fr = await valider(); ok('rapport de visite produit (Word)', fr.endsWith('.docx'), fr);
  // aperçu, puis DOE
  await E(() => APP.aller('doe')); await pg.waitForTimeout(200); await pg.click('#init'); await pg.waitForTimeout(400);
  ok('DOE : liste type créée', (await pg.$$('#zone [data-li]')).length === 10);
  await (await pg.$$('#zone [data-li]'))[0].click(); await pg.waitForSelector('#f_id_document'); const opts = await pg.$$eval('#f_id_document option', o => o.map(x => x.value).filter(Boolean)); await pg.selectOption('#f_id_document', opts[0]); await pg.click('.modal button:not([data-x])'); await pg.waitForTimeout(400);
  ok('DOE : document lié → pièce « Fournie »', await E(() => DB.un("SELECT COUNT(*) FROM doe_pieces WHERE statut='Fournie'") === 1));
  await pg.click('#wd'); const fd = await valider(); ok('DOE : sommaire Word', fd.endsWith('.docx'));
  await pg.click('#xl'); const fx = await valider(); ok('DOE : bordereau Excel', fx.endsWith('.xlsx'));
  // centre documentaire : import par le formulaire
  fs.writeFileSync(path.join(OUT, 'notice.txt'), 'Notice caisson : vitesse 2, débit 450 m3/h.');
  await E(() => APP.aller('documents')); await pg.waitForTimeout(200); await pg.click('#imp'); await pg.waitForSelector('.modal input[type=file]');
  await pg.setInputFiles('.modal input[type=file]', path.join(OUT, 'notice.txt')); await pg.selectOption('#f_categorie', 'Fiches techniques'); await pg.click('.modal button:not([data-x])'); await pg.waitForTimeout(600);
  ok('import par le formulaire', await E(() => DB.un("SELECT COUNT(*) FROM documents WHERE categorie='Fiches techniques'") === 1));
  await (await pg.$('#zone tbody tr[data-id]')).click(); await pg.waitForTimeout(300); ok('fiche document avec aperçu du texte', (await pg.textContent('.modal')).includes('450 m3/h')); await pg.click('.modal [data-x]');
  // listing manuel + demande de prix par l'écran
  await E(() => APP.aller('listings')); await pg.click('#nv'); await pg.fill('#f_titre', 'Listing caissons'); await pg.click('.modal button:not([data-x])'); await pg.waitForTimeout(400);
  for (const [d, r, n] of [['Caisson basse conso', 'CBX-450', 2], ['Bouche hygro B cuisine', 'BHB-105', 6]]) { await pg.click('#aj'); await pg.fill('#f_designation', d); await pg.fill('#f_reference', r); await pg.fill('#f_quantite', String(n)); await pg.click('.modal button:not([data-x])'); await pg.waitForTimeout(300); }
  ok('listing : 2 lignes', (await pg.$$('#zone tbody tr[data-id]')).length === 2);
  await pg.click('#xl'); const fl = await valider(); ok('listing exporté (Excel)', fl.endsWith('.xlsx'), fl);
  await pg.click('#dp'); await pg.fill('#f_fournisseurs', 'Lindab\nAldes'); await pg.fill('#f_contact', 'M. Magassa'); await pg.click('.modal button:not([data-x])'); await pg.waitForTimeout(500);
  ok('demande de prix créée avec 2 fournisseurs', (await pg.$$('[data-dem]')).length === 2);
  await (await pg.$$('[data-dem]'))[0].click(); await pg.waitForSelector('.modal #vu'); await pg.check('.modal #vu');
  const dls = []; pg.on('download', d => dls.push(d.suggestedFilename())); await pg.click('.modal #ok'); await pg.waitForTimeout(1500);
  ok('demande de prix Word + bordereau Excel à chiffrer', dls.some(n => n.endsWith('.docx')) && dls.some(n => n.endsWith('.xlsx')), dls.join(', '));
  await (await pg.$$('[data-sai]'))[1].click(); await pg.waitForSelector('.modal [data-k="prix_unitaire"]'); const px = await pg.$$('.modal [data-k="prix_unitaire"]'); await px[0].fill('480'); await px[1].fill('21,5'.replace(',', '.')); await pg.click('.modal #ok'); await pg.waitForTimeout(400);
  await (await pg.$$('[data-sai]'))[0].click(); await pg.waitForSelector('.modal [data-k="prix_unitaire"]'); const px2 = await pg.$$('.modal [data-k="prix_unitaire"]'); await px2[0].fill('455'); await pg.click('.modal #ok'); await pg.waitForTimeout(400);
  const t = await pg.textContent('#zone'); ok('comparatif à l\'écran (offre incomplète signalée)', t.includes('non chiffrée') && t.includes('910,00'), '');
  await pg.click('#cmp'); const fc = await valider(); ok('comparatif exporté (Excel)', fc.endsWith('.xlsx'));
  await pg.screenshot({ path: path.join(__dirname, 'capture_prix.png') });
  ok('aucune erreur JavaScript', !erreurs.length, erreurs.join(' | '));
  await b.close(); const ko = res.filter(r => !r[1]); console.log('\n' + (res.length - ko.length) + '/' + res.length + ' réussis'); process.exit(ko.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
