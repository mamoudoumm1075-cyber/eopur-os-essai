// EOPUR OS – centre documentaire : import (copie, l'original n'est jamais modifié), empreintes, doublons, versions, texte pour la recherche,
// modèles EOPUR, circuit génération → prévisualisation → contrôle → validation humaine → export → archivage
const DOCS = (() => {
  const { esc, toast } = UI, q = DB.q, un = DB.un;
  const EXT_OK = ['pdf', 'docx', 'doc', 'xlsx', 'xlsm', 'xls', 'csv', 'txt', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'dotx'];
  const base = n => String(n).replace(/\.[^.]+$/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\s-]*(v|ind|indice|version)[\s._-]*[0-9a-z]{1,3}$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
  let pdfPret = null;
  function chargerPdf() { if (!pdfPret) pdfPret = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'lib/pdf.min.js'; s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js'; ok(); }; s.onerror = () => ko(new Error('lecteur PDF indisponible')); document.head.appendChild(s); }); return pdfPret; }
  async function texteDe(nom, buf) {
    const ext = nom.split('.').pop().toLowerCase();
    try {
      if (ext === 'pdf') { await chargerPdf(); const d = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise; let t = ''; for (let i = 1; i <= Math.min(d.numPages, 200); i++) { const c = await (await d.getPage(i)).getTextContent(); t += c.items.map(x => x.str).join(' ') + '\n'; } return t; }
      if (ext === 'docx' || ext === 'dotx') return await DOCX.texte(buf);
      if (['xlsx', 'xlsm'].includes(ext)) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); let t = ''; wb.eachSheet(ws => { t += '[' + ws.name + ']\n'; ws.eachRow(r => { t += r.values.filter(v => v != null).map(v => typeof v === 'object' ? (v.text || v.result || (v.richText ? v.richText.map(x => x.text).join('') : '')) : v).join(' | ') + '\n'; }); }); return t.slice(0, 400000); }
      if (['txt', 'csv'].includes(ext)) return new TextDecoder().decode(buf).slice(0, 400000);
    } catch (e) { console.warn('texte non extrait', nom, e); }
    return '';
  }
  // import d'un fichier : renvoie {id, statut:'ajouté'|'doublon'|'version'}
  async function importerFichier(f, meta, silencieux) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!EXT_OK.includes(ext)) { if (!silencieux) toast('Format non pris en charge : ' + f.name, 'ko'); return { statut: 'refusé' }; }
    const buf = await f.arrayBuffer(), sha = await EO.sha(buf);
    const dup = q('SELECT d.id,d.titre,d.nom_fichier,c.nom ch FROM documents d LEFT JOIN chantiers c ON c.id=d.id_chantier WHERE d.sha256=?', [sha])[0];
    if (dup) { if (!silencieux) toast('Doublon : « ' + f.name + ' » est identique à « ' + (dup.titre || dup.nom_fichier) + ' » (' + (dup.ch || 'sans chantier') + ') – non réimporté', 'ko'); return { statut: 'doublon', id: dup.id }; }
    const fam = q('SELECT id_famille,MAX(version) v FROM documents WHERE COALESCE(id_chantier,\'\')=? AND categorie=? GROUP BY id_famille', [meta.id_chantier || '', meta.categorie || 'Divers']).find(r => { const d = q('SELECT nom_fichier FROM documents WHERE id_famille=? LIMIT 1', [r.id_famille])[0]; return d && base(d.nom_fichier) === base(f.name); });
    const i = DB.id('DO'), dossier = 'documents/' + (meta.id_chantier || 'general'), chemin = dossier + '/' + i + '_' + UI.nomFichier(f.name.replace(/\.[^.]+$/, '')) + '.' + ext;
    await DB.ecrireFichier(chemin, buf);
    const txt = await texteDe(f.name, buf);
    await DB.tx(() => {
      DB.run('INSERT INTO documents(id,id_chantier,categorie,titre,nom_fichier,ext,sha256,taille,version,id_famille,origine,statut,chemin,texte,notes,ajoute_le) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [i, meta.id_chantier || null, meta.categorie || 'Divers', meta.titre || f.name.replace(/\.[^.]+$/, ''), f.name, ext, sha, buf.byteLength, fam ? fam.v + 1 : 1, fam ? fam.id_famille : i, meta.origine || 'import', meta.statut || 'reçu', chemin, txt, meta.notes || '', DB.now()]);
      DB.hist('document', i, meta.id_chantier, (fam ? 'nouvelle version ' + (fam.v + 1) + ' : ' : 'document importé : ') + f.name, null, meta.origine || 'import');
    });
    return { statut: fam ? 'version' : 'ajouté', id: i, version: fam ? fam.v + 1 : 1 };
  }
  async function fichier(idDoc) { const d = q('SELECT * FROM documents WHERE id=?', [idDoc])[0]; return { d, f: await DB.lireFichier(d.chemin) }; }
  async function telechargerDoc(idDoc) { const { d, f } = await fichier(idDoc); UI.telecharger(f, d.nom_fichier); }
  // ----- modèles EOPUR (Word/Excel) : copie conservée dans modeles/, l'original n'est pas touché
  const TYPES_MODELES = [['rapport', 'Rapport de visite'], ['avis', 'Avis de passage'], ['avis_groupe', 'Avis de passage groupé (une page par logement)'], ['demande_prix', 'Demande de prix fournisseur'], ['etude', 'Étude technique VMC'], ['doe', 'Page de garde DOE']];
  async function ajouterModele(type, f) {
    const ext = f.name.split('.').pop().toLowerCase(); if (!['docx', 'dotx'].includes(ext)) throw new Error('le modèle doit être un fichier Word .docx');
    const buf = await f.arrayBuffer(), sha = await EO.sha(buf), i = DB.id('MO'), chemin = 'modeles/' + type + '_' + i + '.' + ext;
    const bal = await DOCX.balises(buf);
    await DB.ecrireFichier(chemin, buf);
    await DB.tx(() => { DB.run('UPDATE modeles SET actif=0 WHERE type=?', [type]); DB.run('INSERT INTO modeles(id,type,nom,ext,chemin,sha256,ajoute_le,actif) VALUES(?,?,?,?,?,?,?,1)', [i, type, f.name, ext, chemin, sha, DB.now()]); DB.journal('modèle', type + ' : ' + f.name + ' – balises ' + bal.join(', ')); });
    return bal;
  }
  async function modeleActif(type) { const m = q('SELECT * FROM modeles WHERE type=? AND actif=1', [type])[0]; if (!m) return null; return { m, buf: await (await DB.lireFichier(m.chemin)).arrayBuffer() }; }
  // ----- circuit de production : aperçu, alertes, case de contrôle, validation, export, archivage
  function circuit(o) {
    const m = UI.fenetre(o.titre, `${(o.alertes || []).length ? '<h4>Contrôles</h4>' + o.alertes.map(a => `<div class="alerte-l">⚠ ${esc(a)}</div>`).join('') : '<div class="ok-l">Contrôles : aucune anomalie détectée.</div>'}
      <h4>Prévisualisation</h4>${o.apercu || ''}
      <div class="carte" style="margin-top:12px"><label><input type="checkbox" id="vu"> J'ai relu l'aperçu et les contrôles ; je valide ce document.</label>
      <div class="ligne fin" style="margin-top:10px"><button class="b g" id="br">Enregistrer en brouillon</button><button class="b" id="ok" disabled>Valider, exporter et archiver</button></div></div>`, true);
    const cb = m.querySelector('#vu'), ok = m.querySelector('#ok'); cb.onchange = () => ok.disabled = !cb.checked;
    const faire = statut => UI.action(async () => {
      const r = await o.produire(); if (!r) return;
      const id = await archiver(r.blob, r.nom, { id_chantier: o.id_chantier, categorie: o.categorie, statut, titre: o.titreDoc || r.nom.replace(/\.[^.]+$/, ''), notes: (o.alertes || []).length ? 'Validé malgré : ' + o.alertes.join(' ; ') : '' });
      if (statut === 'validé') UI.telecharger(r.blob, r.nom);
      m.remove(); toast(statut === 'validé' ? 'Document validé, téléchargé et archivé' : 'Brouillon archivé dans le centre documentaire (à valider)'); if (o.fini) o.fini(id); APP.rafraichir();
    });
    ok.onclick = () => faire('validé'); m.querySelector('#br').onclick = () => faire('brouillon');
    if (o.apres) o.apres(m);
    return m;
  }
  async function archiver(blob, nom, meta) {
    const buf = await blob.arrayBuffer(), sha = await EO.sha(buf), i = DB.id('DO'), ext = nom.split('.').pop().toLowerCase(), chemin = 'exports/' + (meta.id_chantier || 'general') + '/' + i + '_' + UI.nomFichier(nom.replace(/\.[^.]+$/, '')) + '.' + ext;
    await DB.ecrireFichier(chemin, buf);
    const txt = await texteDe(nom, buf);
    await DB.tx(() => { DB.run('INSERT INTO documents(id,id_chantier,categorie,titre,nom_fichier,ext,sha256,taille,version,id_famille,origine,statut,chemin,texte,notes,ajoute_le) VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)', [i, meta.id_chantier || null, meta.categorie || 'Documents produits', meta.titre || nom, nom, ext, sha, buf.byteLength, i, 'généré', meta.statut, chemin, txt, meta.notes || '', DB.now()]);
      DB.hist('document', i, meta.id_chantier, 'document produit (' + meta.statut + ') : ' + nom, null, 'génération'); });
    return i;
  }
  async function valider(idDoc) { await DB.tx(() => { DB.run("UPDATE documents SET statut='validé' WHERE id=?", [idDoc]); const d = q('SELECT * FROM documents WHERE id=?', [idDoc])[0]; DB.hist('document', idDoc, d.id_chantier, 'document validé : ' + d.nom_fichier); }); }
  return { importerFichier, texteDe, fichier, telechargerDoc, TYPES_MODELES, ajouterModele, modeleActif, circuit, archiver, valider, base };
})();
