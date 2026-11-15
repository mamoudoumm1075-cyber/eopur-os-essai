// EOPUR OS – production de documents Word (.docx)
// 1) remplissage d'un modèle EOPUR importé ({{champ}}, {{#tableau}} : tableau généré) – le modèle d'origine n'est jamais modifié
// 2) à défaut de modèle, document sobre généré (en-tête EOPUR, titres, paragraphes, tableaux)
const DOCX = (() => {
  let W = 9600; // largeur utile des tableaux (dxa), élargie en paysage
  const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const run = (t, o) => { o = o || {}; const pr = (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.c ? `<w:color w:val="${o.c}"/>` : '') + (o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '');
    return String(t ?? '').split('\n').map((l, k) => (k ? '<w:r><w:br/></w:r>' : '') + `<w:r>${pr ? '<w:rPr>' + pr + '</w:rPr>' : ''}<w:t xml:space="preserve">${x(l)}</w:t></w:r>`).join(''); };
  const para = (contenu, o) => { o = o || {}; const pPr = (o.style ? `<w:pStyle w:val="${o.style}"/>` : '') + (o.align ? `<w:jc w:val="${o.align}"/>` : '') + (o.saut ? '<w:pageBreakBefore/>' : '') + `<w:spacing w:after="${o.after ?? 120}"/>`;
    return `<w:p><w:pPr>${pPr}</w:pPr>${typeof contenu === 'string' ? run(contenu, o) : contenu.map(r => typeof r === 'string' ? run(r) : run(r.t, r)).join('')}</w:p>`; };
  // tableau : entetes [..], lignes [[..]], largeurs en % facultatives
  function table(entetes, lignes, largeurs) {
    const n = entetes.length, w = largeurs || entetes.map(() => 100 / n);
    const cell = (t, tete, k) => `<w:tc><w:tcPr><w:tcW w:w="${Math.round(W * w[k] / 100)}" w:type="dxa"/>${tete ? '<w:shd w:val="clear" w:color="auto" w:fill="1F3864"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${run(t, tete ? { b: 1, c: 'FFFFFF', sz: 18 } : { sz: 18 })}</w:p></w:tc>`;
    const b = '<w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/>';
    return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${b}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${w.map(p => `<w:gridCol w:w="${Math.round(W * p / 100)}"/>`).join('')}</w:tblGrid>` +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr>${entetes.map((h, k) => cell(h, 1, k)).join('')}</w:tr>` + lignes.map(l => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${l.map((c, k) => cell(c, 0, k)).join('')}</w:tr>`).join('') + '</w:tbl>' + para('', { after: 60 });
  }
  // blocs : {h1|h2|p|table|saut|champs:[[libellé,valeur]]}
  function corps(blocs) {
    return blocs.map(b => b.h1 != null ? para(b.h1, { style: 'Titre1', saut: b.saut }) : b.h2 != null ? para(b.h2, { style: 'Titre2' }) : b.p != null ? para(b.p, b) : b.table ? table(b.table.entetes, b.table.lignes, b.table.largeurs)
      : b.champs ? b.champs.map(([l, v]) => para([{ t: l + ' : ', b: 1 }, { t: v || '—' }], { after: 40 })).join('') : b.saut ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '').join('');
  }
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  async function generer(titre, blocs, opts) {
    opts = opts || {}; W = opts.paysage ? 14500 : 9600; const z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(titre)}</dc:title><dc:creator>EOPUR OS</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`);
    z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>');
    z.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Titre"><w:name w:val="Title"/><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Titre2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="0F766E"/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`);
    z.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run((opts.pied || 'EOPUR') + ' – ' + titre + ' – page ', { sz: 16, c: '666666' })}<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText>PAGE</w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`);
    const tete = para([{ t: 'EOPUR', b: 1, c: '1F3864', sz: 28 }], { after: 0 }) + para(opts.sousTitre || '', { c: '666666', sz: 18, after: 240 }) + para(titre, { style: 'Titre', after: 200 });
    const orient = opts.paysage ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
    z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${tete}${corps(blocs)}<w:sectPr><w:footerReference w:type="default" r:id="rId2"/>${orient}<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  // remplissage d'un modèle : les balises {{champ}} peuvent être éclatées entre plusieurs « runs » Word ; on les recolle paragraphe par paragraphe
  function remplirXml(xml, valeurs, tableaux) {
    return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, p => {
      const textes = [...p.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');
      if (!textes.includes('{{')) return p;
      const m = textes.match(/^\s*\{\{#\s*([\w.]+)\s*\}\}\s*$/); // paragraphe réservé à un tableau
      if (m && tableaux && tableaux[m[1]]) { const t = tableaux[m[1]]; return table(t.entetes, t.lignes, t.largeurs); }
      const plein = textes.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => x(valeurs[k] ?? ''));
      let premier = true; // tout le texte va dans le premier run, les autres sont vidés (mise en forme du premier conservée)
      return p.replace(/(<w:t(?: [^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (_, a, __, c) => { if (premier) { premier = false; return '<w:t xml:space="preserve">' + plein + c; } return a + c; });
    });
  }
  async function remplirModele(buf, valeurs, tableaux) {
    W = 9600; const z = await JSZip.loadAsync(buf), noms = Object.keys(z.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
    if (!noms.includes('word/document.xml')) throw new Error('le modèle n\'est pas un document Word valide');
    for (const n of noms) z.file(n, remplirXml(await z.file(n).async('string'), valeurs, n === 'word/document.xml' ? tableaux : null));
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  // balises présentes dans un modèle (pour l'aide et le contrôle)
  async function balises(buf) { const z = await JSZip.loadAsync(buf); let t = ''; for (const n of Object.keys(z.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) t += (await z.file(n).async('string')).replace(/<[^>]+>/g, ''); return [...new Set([...t.matchAll(/\{\{\s*(#?[\w.]+)\s*\}\}/g)].map(m => m[1]))]; }
  async function texte(buf) { const z = await JSZip.loadAsync(buf), f = z.file('word/document.xml'); if (!f) return ''; return (await f.async('string')).replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
  // aperçu HTML des mêmes blocs (prévisualisation avant validation)
  function apercu(titre, blocs) {
    const e = UI.esc; return `<div class="apercu"><div style="color:#1F3864;font-weight:700;font-size:18px">EOPUR</div><h2 style="color:#1F3864">${e(titre)}</h2>` + blocs.map(b => b.h1 != null ? `<h3 style="color:#1F3864">${e(b.h1)}</h3>` : b.h2 != null ? `<h4 style="color:#0F766E">${e(b.h2)}</h4>` : b.p != null ? `<p style="white-space:pre-wrap">${b.b ? '<b>' : ''}${e(b.p)}${b.b ? '</b>' : ''}</p>` : b.table ? `<table><tr>${b.table.entetes.map(h => `<th style="background:#1F3864;color:#fff">${e(h)}</th>`).join('')}</tr>${b.table.lignes.map(l => '<tr>' + l.map(c => `<td>${e(c)}</td>`).join('') + '</tr>').join('')}</table>` : b.champs ? b.champs.map(([l, v]) => `<div><b>${e(l)} :</b> ${e(v || '—')}</div>`).join('') : b.saut ? '<hr>' : '').join('') + '</div>';
  }
  return { generer, remplirModele, balises, texte, apercu };
})();
