// EOPUR OS – programme d'essai PC (B5, B6). Données fictives. Aucun accès réseau.
package main

import (
	"archive/zip"
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const version = "essai-pc 1"

var lignes []string

func dire(f string, a ...any) {
	l := fmt.Sprintf(f, a...)
	lignes = append(lignes, l)
	fmt.Println(l)
}

type fichierM struct {
	Nom    string `json:"nom"`
	Taille int64  `json:"taille"`
	Sha256 string `json:"sha256"`
}
type manifeste struct {
	Format        string     `json:"format"`
	VersionFormat int        `json:"version_format"`
	Type          string     `json:"type"`
	IDPaquet      string     `json:"id_paquet"`
	Appareil      string     `json:"appareil"`
	CreeLe        string     `json:"cree_le"`
	Fichiers      []fichierM `json:"fichiers"`
}

var idOK = regexp.MustCompile(`^[0-9A-Za-z-]{8,64}$`)

func empreinteFichier(p string) (string, int64, error) {
	f, err := os.Open(p)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	return hex.EncodeToString(h.Sum(nil)), n, err
}

// verifierPaquet ouvre le paquet, lit le manifeste et contrôle l'empreinte de chaque fichier.
func verifierPaquet(p string) (*manifeste, int, error) {
	z, err := zip.OpenReader(p)
	if err != nil {
		return nil, 0, fmt.Errorf("paquet illisible (%v)", err)
	}
	defer z.Close()
	contenu := map[string]*zip.File{}
	for _, f := range z.File {
		contenu[f.Name] = f
	}
	mf, ok := contenu["manifeste.json"]
	if !ok {
		return nil, 0, fmt.Errorf("manifeste absent")
	}
	r, err := mf.Open()
	if err != nil {
		return nil, 0, err
	}
	b, err := io.ReadAll(r)
	r.Close()
	if err != nil {
		return nil, 0, err
	}
	var m manifeste
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, 0, fmt.Errorf("manifeste illisible (%v)", err)
	}
	if m.Format != "eopur-os-paquet" {
		return &m, 0, fmt.Errorf("format inconnu « %s »", m.Format)
	}
	if m.VersionFormat != 1 {
		return &m, 0, fmt.Errorf("version de format %d non prise en charge", m.VersionFormat)
	}
	if !idOK.MatchString(m.IDPaquet) {
		return &m, 0, fmt.Errorf("identifiant de paquet invalide")
	}
	ok2 := 0
	for _, fm := range m.Fichiers {
		zf, ok := contenu[fm.Nom]
		if !ok {
			return &m, ok2, fmt.Errorf("fichier manquant : %s", fm.Nom)
		}
		rc, err := zf.Open()
		if err != nil {
			return &m, ok2, err
		}
		h := sha256.New()
		n, err := io.Copy(h, rc)
		rc.Close()
		if err != nil {
			return &m, ok2, fmt.Errorf("lecture incomplète de %s (%v)", fm.Nom, err)
		}
		if n != fm.Taille || hex.EncodeToString(h.Sum(nil)) != fm.Sha256 {
			return &m, ok2, fmt.Errorf("empreinte différente : %s", fm.Nom)
		}
		ok2++
	}
	return &m, ok2, nil
}

// attendreStable vérifie que la taille du fichier ne change plus (synchronisation terminée).
func attendreStable(p string, pause time.Duration, essais int) (int64, bool) {
	var prec int64 = -1
	for i := 0; i < essais; i++ {
		st, err := os.Stat(p)
		if err != nil {
			return 0, false
		}
		if st.Size() == prec && prec > 0 {
			return prec, true
		}
		prec = st.Size()
		time.Sleep(pause)
	}
	return prec, false
}

func dossierOneDrive() (string, string) {
	for _, v := range []string{"OneDriveCommercial", "OneDrive"} {
		if d := os.Getenv(v); d != "" {
			return d, v
		}
	}
	return "", ""
}

func main() {
	debut := time.Now()
	dire("EOPUR OS – essai PC (%s) – %s", version, debut.Format("02/01/2006 15:04:05"))
	dire("Données fictives uniquement. Ce programme ne fait aucun appel réseau.")
	hote, _ := os.Hostname()
	dire("Poste : %s", hote)

	// ---------- B5 : base SQLite hors de OneDrive
	dire("")
	dire("== B5 : base locale hors de OneDrive ==")
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base, _ = os.UserHomeDir()
	}
	dos := filepath.Join(base, "EOPUR_OS_ESSAI")
	od, varOD := dossierOneDrive()
	b5 := "ÉCHEC"
	var db *baseSQL
	if err := os.MkdirAll(dos, 0o755); err != nil {
		dire("B5 ÉCHEC : impossible de créer %s (%v)", dos, err)
	} else {
		dire("Dossier local : %s", dos)
		if od != "" && strings.HasPrefix(strings.ToLower(dos), strings.ToLower(od)) {
			dire("ATTENTION : ce dossier est DANS OneDrive – à ne pas faire pour la base.")
		} else {
			dire("Ce dossier est hors de OneDrive : oui")
		}
		chemin := filepath.Join(dos, "base_essai.sqlite")
		var err error
		db, err = ouvrirBase(chemin)
		if err != nil {
			dire("B5 ÉCHEC : SQLite indisponible (%v)", err)
		} else {
			dire("Moteur SQLite : %s", db.moteur())
			err = db.exec(`CREATE TABLE IF NOT EXISTS essais(id INTEGER PRIMARY KEY AUTOINCREMENT, quand TEXT NOT NULL, poste TEXT);
CREATE TABLE IF NOT EXISTS paquets_traites(id_paquet TEXT PRIMARY KEY, empreinte TEXT NOT NULL, type TEXT, recu_le TEXT NOT NULL);`)
			if err == nil {
				err = db.exec(fmt.Sprintf(`INSERT INTO essais(quand,poste) VALUES('%s','%s');`, debut.Format(time.RFC3339), strings.ReplaceAll(hote, "'", "")))
			}
			if err != nil {
				dire("B5 ÉCHEC : écriture impossible (%v)", err)
			} else {
				n, e1 := db.entier(`SELECT COUNT(*) FROM essais;`)
				ic, e2 := db.texte(`PRAGMA integrity_check;`)
				if e1 != nil || e2 != nil {
					dire("B5 ÉCHEC : relecture impossible (%v %v)", e1, e2)
				} else {
					dire("Écriture puis relecture : %d lancement(s) enregistré(s) dans la base", n)
					dire("Contrôle d'intégrité de la base : %s", ic)
					if st, err := os.Stat(chemin); err == nil {
						dire("Fichier de base : %s (%d octets)", chemin, st.Size())
					}
					if ic == "ok" {
						b5 = "RÉUSSI"
					}
				}
			}
		}
	}
	dire("B5 : %s", b5)

	// ---------- B6 : lecture des paquets dans OneDrive
	dire("")
	dire("== B6 : lecture des paquets dans OneDrive ==")
	b6 := "ÉCHEC"
	essai := ""
	if od == "" {
		dire("B6 ÉCHEC : dossier OneDrive introuvable (variables OneDriveCommercial et OneDrive vides)")
	} else {
		dire("Dossier OneDrive (%s) : %s", varOD, od)
		essai = filepath.Join(od, "EOPUR_OS_ESSAI")
		entrees, err := os.ReadDir(essai)
		if err != nil {
			dire("B6 ÉCHEC : dossier %s illisible (%v)", essai, err)
		} else {
			vus, conformes, refuses, doublons := 0, 0, 0, 0
			for _, e := range entrees {
				if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".zip") {
					continue
				}
				vus++
				p := filepath.Join(essai, e.Name())
				dire("- %s", e.Name())
				dire("    état OneDrive : %s", etatNuage(p))
				t0 := time.Now()
				taille, stable := attendreStable(p, 1500*time.Millisecond, 6)
				if !stable {
					dire("    taille encore en mouvement (%d octets) : paquet laissé pour plus tard", taille)
					continue
				}
				h, n, err := empreinteFichier(p)
				if err != nil {
					dire("    lecture impossible (%v) : paquet laissé pour plus tard", err)
					continue
				}
				dire("    %d octets, empreinte %s, lu en %d ms", n, h[:16], time.Since(t0).Milliseconds())
				m, nb, err := verifierPaquet(p)
				if err != nil {
					refuses++
					dire("    REFUSÉ : %v", err)
					continue
				}
				conformes++
				dire("    paquet %s, type %s, appareil %s : %d fichier(s) conforme(s)", m.IDPaquet, m.Type, court(m.Appareil), nb)
				if db != nil {
					deja, _ := db.entier(fmt.Sprintf(`SELECT COUNT(*) FROM paquets_traites WHERE id_paquet='%s';`, m.IDPaquet))
					if deja > 0 {
						doublons++
						dire("    déjà traité lors d'un lancement précédent : ignoré (pas de doublon)")
					} else if err := db.exec(fmt.Sprintf(`INSERT INTO paquets_traites VALUES('%s','%s','%s','%s');`, m.IDPaquet, h, strings.ReplaceAll(m.Type, "'", ""), time.Now().Format(time.RFC3339))); err != nil {
						dire("    inscription dans la base impossible (%v)", err)
					} else {
						dire("    inscrit dans la base comme reçu")
					}
				}
			}
			dire("Paquets vus : %d – conformes : %d – refusés : %d – déjà traités : %d", vus, conformes, refuses, doublons)
			if vus > 0 && conformes > 0 {
				b6 = "RÉUSSI"
			} else if vus == 0 {
				dire("Aucun paquet .zip dans le dossier.")
			}
		}
	}
	dire("B6 : %s", b6)
	if db != nil {
		db.fermer()
	}

	// ---------- rapport
	dire("")
	dire("Durée totale : %d ms", time.Since(debut).Milliseconds())
	nom := "rapport_pc_" + debut.Format("20060102_150405") + ".txt"
	texte := "\ufeff" + strings.Join(lignes, "\r\n") + "\r\n"
	if essai != "" {
		if err := os.WriteFile(filepath.Join(essai, nom), []byte(texte), 0o644); err == nil {
			fmt.Println("Rapport écrit dans OneDrive : EOPUR_OS_ESSAI\\" + nom)
		} else {
			fmt.Println("Rapport non écrit dans OneDrive :", err)
		}
	}
	_ = os.WriteFile(filepath.Join(dos, nom), []byte(texte), 0o644)
	fmt.Println()
	fmt.Print("Terminé. Appuyez sur Entrée pour fermer.")
	bufio.NewReader(os.Stdin).ReadString('\n')
}

func court(s string) string {
	if len(s) > 8 {
		return s[:8] + "…"
	}
	return s
}
