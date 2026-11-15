// EOPUR OS – études techniques VMC, listings pour devis, demandes de prix et comparatif (aucune commande, aucun achat)
const ET = (() => {
  const q = DB.q, un = DB.un, net = s => String(s ?? '').trim();
  const FIABILITES = ['Confirmé', 'Hypothèse', 'À vérifier'];
  const CATEGORIES = ['Bouche d\'extraction', 'Entrée d\'air', 'Caisson / extracteur', 'Conduit / gaine', 'Raccord / accessoire', 'Régulation', 'Débit réglementaire', 'Autre'];
  const PIECES = ['Cuisine', 'Salle de bains', 'Salle d\'eau', 'WC', 'Cellier', 'Séjour', 'Chambre', 'Parties communes', 'Toiture', 'Autre'];
  const SYSTEMES = ['Hygroréglable A', 'Hygroréglable B', 'Autoréglable', 'Double flux', 'Autre'];
  // une donnée sans source ne peut pas être « Confirmé » ; on ne complète jamais une valeur manquante
  function controlerEquipement(e) {
    DB.verifierObligatoires(e, ['designation', 'categorie']);
    if (e.fiabilite === 'Confirmé' && !net(e.source_document)) throw new Error('une donnée « Confirmé » doit indiquer son document source');
    if (!FIABILITES.includes(e.fiabilite)) e.fiabilite = 'À vérifier';
    if (!net(e.source_document) && e.fiabilite !== 'À vérifier') e.fiabilite = 'Hypothèse';
    return e;
  }
  const CH_EQ = ['categorie', 'piece', 'typologie', 'designation', 'reference', 'fabricant', 'valeur', 'unite', 'quantite', 'source_document', 'source_date', 'fiabilite', 'notes'];
  async function creerEtude(e) { DB.verifierObligatoires(e, ['id_chantier', 'titre']); return DB.tx(() => { const i = DB.id('ET'); DB.run('INSERT INTO etudes(id,id_chantier,titre,systeme,type_installation,notes,cree_le,maj_le) VALUES(?,?,?,?,?,?,?,?)', [i, e.id_chantier, net(e.titre), e.systeme || '', e.type_installation || '', net(e.notes), DB.now(), DB.now()]); DB.hist('etude', i, e.id_chantier, 'étude créée : ' + net(e.titre)); return i; }); }
  async function majEtude(i, e) { const x = q('SELECT * FROM etudes WHERE id=?', [i])[0]; return DB.tx(() => { DB.run('UPDATE etudes SET titre=?,systeme=?,type_installation=?,notes=?,maj_le=? WHERE id=?', [net(e.titre), e.systeme, e.type_installation, net(e.notes), DB.now(), i]); DB.hist('etude', i, x.id_chantier, 'étude modifiée'); }); }
  async function enregistrerEquipement(idEtude, e, idEq) {
    controlerEquipement(e); const et = q('SELECT * FROM etudes WHERE id=?', [idEtude])[0];
    return DB.tx(() => {
      if (idEq) { const a = q('SELECT * FROM equipements WHERE id=?', [idEq])[0]; DB.run('UPDATE equipements SET ' + CH_EQ.map(k => k + '=?').join(',') + ' WHERE id=?', [...CH_EQ.map(k => k === 'quantite' ? (e[k] === '' || e[k] == null ? null : +e[k]) : net(e[k])), idEq]);
        DB.hist('equipement', idEq, et.id_chantier, 'donnée d\'étude modifiée : ' + CH_EQ.filter(k => String(a[k] ?? '') !== String(e[k] ?? '')).map(k => k + ' « ' + (a[k] ?? '') + ' » → « ' + (e[k] ?? '') + ' »').join(' ; ')); DB.run('UPDATE etudes SET maj_le=? WHERE id=?', [DB.now(), idEtude]); return idEq; }
      const i = DB.id('EQ'); DB.run('INSERT INTO equipements(id,id_etude,' + CH_EQ.join(',') + ') VALUES(?,?,' + CH_EQ.map(() => '?').join(',') + ')', [i, idEtude, ...CH_EQ.map(k => k === 'quantite' ? (e[k] === '' || e[k] == null ? null : +e[k]) : net(e[k]))]);
      DB.hist('equipement', i, et.id_chantier, 'donnée d\'étude ajoutée : ' + net(e.designation) + ' (' + e.fiabilite + ')'); return i;
    });
  }
  // listing : quantités calculées uniquement à partir des données présentes (typologies réellement renseignées)
  function propositionListing(idEtude) {
    const et = q('SELECT * FROM etudes WHERE id=?', [idEtude])[0], E = q("SELECT * FROM equipements WHERE id_etude=? AND categorie<>'Débit réglementaire' ORDER BY categorie,designation", [idEtude]);
    const typos = Object.fromEntries(q("SELECT typo,COUNT(*) n FROM logements WHERE id_chantier=? AND typo<>'' GROUP BY typo", [et.id_chantier]).map(r => [r.typo, r.n]));
    const sansTypo = un("SELECT COUNT(*) FROM logements WHERE id_chantier=? AND typo=''", [et.id_chantier]);
    const lignes = [], alertes = [];
    for (const e of E) {
      const qte = e.quantite === '' || e.quantite == null ? null : +e.quantite; let total = null, obs = [];
      if (qte == null) obs.push('quantité non renseignée dans l\'étude');
      else if (e.typologie) { const n = typos[e.typologie]; if (n) { total = qte * n; obs.push('calcul : ' + qte + ' × ' + n + ' logement(s) ' + e.typologie); } else obs.push('aucun logement ' + e.typologie + ' renseigné : quantité à établir'); }
      else total = qte;
      if (e.fiabilite !== 'Confirmé') obs.push('donnée « ' + e.fiabilite + ' »');
      lignes.push({ categorie: e.categorie, designation: e.designation, reference: e.reference, quantite: total, unite: e.unite || 'u', caracteristiques: [e.fabricant, e.valeur !== '' && e.valeur != null ? e.valeur + ' ' + (e.unite || '') : '', e.piece].filter(Boolean).join(' · '), observations: obs.join(' ; ') });
    }
    if (sansTypo && E.some(e => e.typologie)) alertes.push(sansTypo + ' logement(s) du chantier sans typologie : non comptés dans les quantités par typologie');
    if (lignes.some(l => l.quantite == null)) alertes.push(lignes.filter(l => l.quantite == null).length + ' ligne(s) sans quantité calculable (laissées vides)');
    return { lignes: regrouperIdentiques(lignes), alertes };
  }
  // regroupe seulement les lignes strictement identiques (même référence non vide ET même désignation)
  function regrouperIdentiques(L) { const o = [], m = new Map(); for (const l of L) { const k = l.reference ? (l.reference + '|' + l.designation).toLowerCase() : null; if (k && m.has(k) && m.get(k).quantite != null && l.quantite != null && m.get(k).unite === l.unite) { const x = m.get(k); x.quantite += l.quantite; x.observations = [x.observations, l.observations].filter(Boolean).join(' | '); } else { const c = Object.assign({}, l); o.push(c); if (k) m.set(k, c); } } return o; }
  // doublons potentiels dans un listing (à arbitrer par l'utilisateur)
  function doublons(idListing) {
    const L = q('SELECT * FROM listing_lignes WHERE id_listing=?', [idListing]), n = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''), g = {};
    for (const l of L) { for (const k of [l.reference ? 'r:' + n(l.reference) : null, 'd:' + n(l.designation)].filter(Boolean)) (g[k] = g[k] || []).push(l); }
    const vus = new Set(), res = []; for (const [k, v] of Object.entries(g)) if (v.length > 1) { const cle = v.map(x => x.id).sort().join(); if (!vus.has(cle)) { vus.add(cle); res.push({ motif: k.startsWith('r:') ? 'même référence' : 'même désignation', lignes: v }); } }
    return res;
  }
  async function creerListing(idc, titre, idEtude, lignes) {
    return DB.tx(() => { const i = DB.id('LI'); DB.run('INSERT INTO listings(id,id_chantier,titre,id_etude,cree_le,maj_le) VALUES(?,?,?,?,?,?)', [i, idc, net(titre), idEtude || null, DB.now(), DB.now()]);
      (lignes || []).forEach((l, k) => DB.run('INSERT INTO listing_lignes(id,id_listing,categorie,designation,reference,quantite,unite,caracteristiques,observations,ordre) VALUES(?,?,?,?,?,?,?,?,?,?)', [DB.id('LL'), i, l.categorie || '', net(l.designation), net(l.reference), l.quantite ?? null, l.unite || 'u', net(l.caracteristiques), net(l.observations), k + 1]));
      DB.hist('listing', i, idc, 'listing créé : ' + net(titre) + ' (' + (lignes || []).length + ' ligne(s))'); return i; });
  }
  async function fusionnerLignes(ids) { // décision explicite de l'utilisateur
    const L = q('SELECT * FROM listing_lignes WHERE id IN (' + ids.map(() => '?').join(',') + ')', ids); if (L.length < 2) return;
    if (new Set(L.map(l => l.unite)).size > 1) throw new Error('unités différentes : regroupement impossible');
    const lis = q('SELECT * FROM listings WHERE id=?', [L[0].id_listing])[0];
    return DB.tx(() => { const tot = L.some(l => l.quantite == null) ? null : L.reduce((a, l) => a + +l.quantite, 0); DB.run('UPDATE listing_lignes SET quantite=?,observations=? WHERE id=?', [tot, L.map(l => l.observations).filter(Boolean).join(' | ') + ' | regroupement de ' + L.length + ' lignes', L[0].id]);
      for (const l of L.slice(1)) { DB.run('DELETE FROM offre_lignes WHERE id_ligne=?', [l.id]); DB.run('DELETE FROM listing_lignes WHERE id=?', [l.id]); } DB.hist('listing', lis.id, lis.id_chantier, L.length + ' lignes regroupées : ' + L[0].designation); });
  }
  // comparatif : prix par ligne et par offre
  function comparatif(idDemande) {
    const d = q('SELECT * FROM demandes_prix WHERE id=?', [idDemande])[0], L = q('SELECT * FROM listing_lignes WHERE id_listing=? ORDER BY ordre', [d.id_listing]), O = q('SELECT * FROM offres WHERE id_demande=? ORDER BY fournisseur', [idDemande]);
    const P = {}; for (const r of q('SELECT ol.* FROM offre_lignes ol JOIN offres o ON o.id=ol.id_offre WHERE o.id_demande=?', [idDemande])) P[r.id_offre + '|' + r.id_ligne] = r;
    const lignes = L.map(l => { const px = O.map(o => { const r = P[o.id + '|' + l.id]; if (!r || r.prix_unitaire == null || r.prix_unitaire === '') return null; const pu = +r.prix_unitaire * (1 - (+r.remise || 0) / 100), qte = r.quantite != null && r.quantite !== '' ? +r.quantite : l.quantite; return { pu, qte, total: qte != null ? pu * qte : null, ref: r.reference, obs: r.observations }; });
      const tots = px.filter(x => x && x.total != null).map(x => x.total); return { l, px, min: tots.length > 1 ? Math.min(...tots) : null, max: tots.length > 1 ? Math.max(...tots) : null }; });
    const totaux = O.map((o, k) => { const v = lignes.map(x => x.px[k]); return { total: v.reduce((a, x) => a + (x && x.total != null ? x.total : 0), 0), manquants: v.filter(x => !x || x.total == null).length }; });
    return { d, L, O, lignes, totaux };
  }
  return { FIABILITES, CATEGORIES, PIECES, SYSTEMES, creerEtude, majEtude, enregistrerEquipement, propositionListing, doublons, creerListing, fusionnerLignes, comparatif, controlerEquipement };
})();
