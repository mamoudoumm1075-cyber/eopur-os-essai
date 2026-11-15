// EOPUR OS – composants d'interface communs (PC)
const PAGES = {}; // registre des écrans
const UI = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const dateFr = d => { if (!d) return ''; const s = String(d); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, j] = s.split('-'); return j + '/' + m + '/' + y; } const x = new Date(s); return isNaN(x) ? s : x.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); };
  function toast(t, type) {
    const z = $('#toasts'), d = document.createElement('div'); d.className = 'toast ' + (type || 'ok'); d.textContent = t; z.appendChild(d);
    setTimeout(() => d.classList.add('out'), type === 'ko' ? 7000 : 3500); setTimeout(() => d.remove(), type === 'ko' ? 7600 : 4100);
  }
  // exécute une action et affiche l'erreur de façon lisible
  async function action(fn, okMsg) { try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { console.error(e); toast(e.message || String(e), 'ko'); return undefined; } }
  const PASTILLE = {
    'À planifier': 'gris', 'À prévenir': 'bleu', 'Passage programmé': 'bleu', 'Intervention réalisée': 'vert', 'Terminé': 'vert', 'Absent': 'orange', 'Inaccessible': 'orange', 'À repasser': 'orange',
    "Refus d'accès": 'rouge', 'Problème technique': 'rouge', 'Planifiée': 'bleu', 'Réalisée': 'vert', 'Annulée': 'gris', 'Nouvelle': 'rouge', 'À analyser': 'orange', 'En cours': 'bleu',
    'En attente': 'orange', 'Résolue': 'vert', 'Clôturée': 'gris', 'À faire': 'orange', 'Fait': 'vert', 'En préparation': 'gris', 'Suspendu': 'orange', 'Archivé': 'gris',
    'Urgente': 'rouge', 'Haute': 'orange', 'Normale': 'gris', 'Basse': 'gris', 'Manquante': 'rouge', 'Fournie': 'vert', 'brouillon': 'orange', 'validé': 'vert',
    'Confirmé': 'vert', 'Hypothèse': 'orange', 'À vérifier': 'rouge', 'Reçue': 'vert', 'Envoyée': 'bleu'
  };
  const pastille = s => s ? `<span class="pa ${PASTILLE[s] || 'gris'}">${esc(s)}</span>` : '';
  // fenêtre modale avec formulaire ; champs : {k, l, t:'text|date|time|select|textarea|number|check', o:[options], req, v, aide}
  function formulaire(titre, champs, valeurs, opts) {
    return new Promise(res => {
      const v = valeurs || {}, m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = `<div class="boite ${opts && opts.large ? 'large' : ''}"><h3>${esc(titre)}</h3>${opts && opts.intro ? `<p class="s">${opts.intro}</p>` : ''}<form>${champs.map(c => {
        const val = v[c.k] ?? c.v ?? '', id = 'f_' + c.k, lab = `<label for="${id}">${esc(c.l)}${c.req ? ' *' : ''}</label>`;
        let inp;
        if (c.t === 'select') inp = `<select id="${id}" name="${c.k}">${(c.vide !== false ? '<option value=""></option>' : '')}${c.o.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
        else if (c.t === 'textarea') inp = `<textarea id="${id}" name="${c.k}" rows="${c.rows || 3}">${esc(val)}</textarea>`;
        else if (c.t === 'multi') inp = `<div class="multi" id="${id}">${c.o.map(([ov, ol]) => `<label><input type="checkbox" name="${c.k}" value="${esc(ov)}" ${(val || []).includes(ov) ? 'checked' : ''}> ${esc(ol)}</label>`).join('') || '<em>Aucun élément</em>'}</div>`;
        else if (c.t === 'check') return `<div class="ch"><label><input type="checkbox" name="${c.k}" ${val ? 'checked' : ''}> ${esc(c.l)}</label></div>`;
        else inp = `<input id="${id}" name="${c.k}" type="${c.t || 'text'}" value="${esc(val)}" ${c.t === 'number' ? 'step="any"' : ''}>`;
        return `<div class="ch ${c.t === 'textarea' || c.t === 'multi' || c.plein ? 'plein' : ''}">${lab}${inp}${c.aide ? `<small>${esc(c.aide)}</small>` : ''}</div>`;
      }).join('')}<div class="alertes" id="f_alertes"></div><div class="pied"><button type="button" class="b g" data-x>Annuler</button><button class="b">${esc(opts && opts.ok || 'Enregistrer')}</button></div></form></div>`;
      document.body.appendChild(m);
      const f = $('form', m), fin = r => { m.remove(); res(r); };
      const lire = () => { const o = {}; for (const c of champs) { if (c.t === 'multi') o[c.k] = $$(`input[name="${c.k}"]:checked`, f).map(x => x.value); else if (c.t === 'check') o[c.k] = $(`input[name="${c.k}"]`, f).checked ? 1 : 0; else o[c.k] = f.elements[c.k].value; } return o; };
      $('[data-x]', m).onclick = () => fin(null);
      m.addEventListener('keydown', e => { if (e.key === 'Escape') fin(null); });
      if (opts && opts.surChange) f.addEventListener('change', () => { $('#f_alertes', m).innerHTML = (opts.surChange(lire()) || []).map(a => `<div>⚠ ${esc(a)}</div>`).join(''); });
      f.onsubmit = e => { e.preventDefault(); const o = lire(); const manq = champs.filter(c => c.req && !String(o[c.k] ?? '').trim()); if (manq.length) { $('#f_alertes', m).innerHTML = '<div>Obligatoire : ' + manq.map(c => esc(c.l)).join(', ') + '</div>'; return; } fin(o); };
      const p = $('input,select,textarea', f); if (p) p.focus();
    });
  }
  function confirmer(texte, ok) { return new Promise(res => { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="boite"><p>${texte}</p><div class="pied"><button class="b g" data-n>Annuler</button><button class="b ${ok && ok.danger ? 'r' : ''}" data-o>${esc(ok && ok.l || 'Confirmer')}</button></div></div>`; document.body.appendChild(m); $('[data-n]', m).onclick = () => { m.remove(); res(false); }; $('[data-o]', m).onclick = () => { m.remove(); res(true); }; }); }
  function fenetre(titre, html, large) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="boite ${large ? 'large' : ''}"><h3>${esc(titre)}</h3><div class="contenu">${html}</div><div class="pied"><button class="b g" data-x>Fermer</button></div></div>`; document.body.appendChild(m); $('[data-x]', m).onclick = () => m.remove(); return m; }
  // tableau interactif : colonnes [{k, l, f:(row)=>html, tri:true}], filtre texte, tri au clic
  function tableau(cible, lignes, colonnes, opts) {
    opts = opts || {}; let tri = opts.tri || null, sens = 1, filtre = '';
    const dessin = () => {
      let L = lignes.filter(r => !filtre || colonnes.some(c => String(c.txt ? c.txt(r) : r[c.k] ?? '').toLowerCase().includes(filtre)));
      if (tri) { const c = colonnes.find(x => x.k === tri); L = [...L].sort((a, b) => { const x = c && c.txt ? c.txt(a) : a[tri], y = c && c.txt ? c.txt(b) : b[tri]; return (String(x ?? '').localeCompare(String(y ?? ''), 'fr', { numeric: true })) * sens; }); }
      cible.innerHTML = (opts.filtre === false ? '' : `<div class="barre-t"><input class="filtre" placeholder="Filtrer…" value="${esc(filtre)}"><span class="s">${L.length} / ${lignes.length}</span>${opts.outils || ''}</div>`) +
        `<div class="tw"><table class="t"><thead><tr>${opts.select ? '<th><input type="checkbox" data-tout></th>' : ''}${colonnes.map(c => `<th data-k="${c.k}" class="${c.k === tri ? 'tri' + sens : ''}">${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${L.map(r => `<tr data-id="${esc(r.id)}" class="${opts.clic ? 'cl' : ''}">${opts.select ? `<td><input type="checkbox" data-s="${esc(r.id)}"></td>` : ''}${colonnes.map(c => `<td>${c.f ? c.f(r) : esc(r[c.k])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${colonnes.length + (opts.select ? 1 : 0)}" class="vide">${opts.vide || 'Aucun élément.'}</td></tr>`}</tbody></table></div>`;
      const fi = $('.filtre', cible); if (fi) fi.oninput = e => { filtre = e.target.value.toLowerCase(); const pos = e.target.selectionStart; dessin(); const n = $('.filtre', cible); n.focus(); n.setSelectionRange(pos, pos); };
      $$('th[data-k]', cible).forEach(th => th.onclick = () => { if (tri === th.dataset.k) sens = -sens; else { tri = th.dataset.k; sens = 1; } dessin(); });
      if (opts.clic) $$('tbody tr[data-id]', cible).forEach(tr => tr.onclick = e => { if (e.target.closest('button,input,select,a')) return; opts.clic(tr.dataset.id); });
      const tt = $('[data-tout]', cible); if (tt) tt.onchange = () => $$('[data-s]', cible).forEach(x => x.checked = tt.checked);
      if (opts.apres) opts.apres(cible);
    };
    dessin(); return { selection: () => $$('[data-s]:checked', cible).map(x => x.dataset.s), redessiner: dessin };
  }
  // téléchargement : fonctionne sur la page locale (Chrome/Edge)
  function telecharger(blob, nom) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  const nomFichier = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'document';
  return { esc, $, $$, dateFr, toast, action, pastille, formulaire, confirmer, fenetre, tableau, telecharger, nomFichier };
})();
