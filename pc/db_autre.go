//go:build !windows

package main

import (
	"fmt"
	"regexp"
	"strings"
)

// Remplaçant de test hors Windows : simule la base pour vérifier le reste du programme.
type baseSQL struct {
	essais  int
	paquets map[string]bool
}

func ouvrirBase(string) (*baseSQL, error) { return &baseSQL{paquets: map[string]bool{}}, nil }
func (d *baseSQL) moteur() string         { return "simulation (hors Windows)" }

var reIns = regexp.MustCompile(`INSERT INTO paquets_traites VALUES\('([^']+)'`)
var reSel = regexp.MustCompile(`WHERE id_paquet='([^']+)'`)

func (d *baseSQL) exec(sql string) error {
	if strings.Contains(sql, "INSERT INTO essais") {
		d.essais++
	}
	if m := reIns.FindStringSubmatch(sql); m != nil {
		if d.paquets[m[1]] {
			return fmt.Errorf("UNIQUE constraint failed")
		}
		d.paquets[m[1]] = true
	}
	return nil
}
func (d *baseSQL) entier(sql string) (int64, error) {
	if m := reSel.FindStringSubmatch(sql); m != nil {
		if d.paquets[m[1]] {
			return 1, nil
		}
		return 0, nil
	}
	return int64(d.essais), nil
}
func (d *baseSQL) texte(string) (string, error) { return "ok", nil }
func (d *baseSQL) fermer()                      {}
func etatNuage(string) string                   { return "non applicable hors Windows" }
