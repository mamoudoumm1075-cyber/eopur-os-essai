// EOPUR OS – fonctions communes PC / téléphone (format des paquets, identifiants, empreintes)
const EO = {
  VERSION_FORMAT: 2, VERSION_APP: '1.0.0',
  STATUTS: ['À planifier','À prévenir','Passage programmé','Intervention réalisée','Absent','Inaccessible','À repasser',"Refus d'accès",'Problème technique','Terminé'],
  RESULTATS: ['Intervention réalisée','Absent','Inaccessible',"Refus d'accès",'Problème technique','À repasser'],
  uuid() { return crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)); },
  now() { return new Date().toISOString(); },
  async sha(buf) { const h = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); },
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  dateFr(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); },
  // fichiers : [{nom, data: ArrayBuffer|Uint8Array|string}]
  async fabriquer(type, appareil, fichiers, extra) {
    const zip = new JSZip(), id = EO.uuid(), liste = [];
    for (const f of fichiers) {
      const b = typeof f.data === 'string' ? new TextEncoder().encode(f.data) : new Uint8Array(f.data);
      zip.file(f.nom, b); liste.push({ nom: f.nom, taille: b.byteLength, sha256: await EO.sha(b) });
    }
    const manifeste = Object.assign({ format: 'eopur-os-paquet', version_format: EO.VERSION_FORMAT, type, id_paquet: id, appareil, cree_le: EO.now(), fichiers: liste }, extra || {});
    zip.file('manifeste.json', JSON.stringify(manifeste, null, 1));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    return { id, blob, empreinte: await EO.sha(await blob.arrayBuffer()), manifeste, nom: 'eopur_' + type + '_' + id.slice(0, 8) + '.zip' };
  },
  // lit et contrôle un paquet ; lève une erreur lisible si quoi que ce soit ne va pas
  async lire(buf) {
    let zip; try { zip = await JSZip.loadAsync(buf); } catch (e) { throw new Error('paquet illisible ou incomplet'); }
    const mf = zip.file('manifeste.json'); if (!mf) throw new Error('manifeste absent');
    let m; try { m = JSON.parse(await mf.async('string')); } catch (e) { throw new Error('manifeste illisible'); }
    if (m.format !== 'eopur-os-paquet') throw new Error('format inconnu');
    if (m.version_format !== EO.VERSION_FORMAT) throw new Error('version de format ' + m.version_format + ' incompatible : mettre l\'application à jour');
    if (!/^[0-9A-Za-z-]{8,64}$/.test(m.id_paquet || '')) throw new Error('identifiant de paquet invalide');
    const contenu = {};
    for (const f of m.fichiers || []) {
      const z = zip.file(f.nom); if (!z) throw new Error('pièce manquante : ' + f.nom);
      const b = await z.async('arraybuffer');
      if (b.byteLength !== f.taille || await EO.sha(b) !== f.sha256) throw new Error('empreinte différente : ' + f.nom);
      contenu[f.nom] = b;
    }
    return { m, contenu, empreinte: await EO.sha(buf), json: n => JSON.parse(new TextDecoder().decode(contenu[n])) };
  }
};
