//go:build windows

package main

import (
	"errors"
	"fmt"
	"syscall"
	"unsafe"
)

// SQLite fourni par Windows (winsqlite3.dll) : aucune installation.
var (
	dll       = syscall.NewLazyDLL("winsqlite3.dll")
	pOpen     = dll.NewProc("sqlite3_open")
	pClose    = dll.NewProc("sqlite3_close")
	pExec     = dll.NewProc("sqlite3_exec")
	pErrmsg   = dll.NewProc("sqlite3_errmsg")
	pPrepare  = dll.NewProc("sqlite3_prepare_v2")
	pStep     = dll.NewProc("sqlite3_step")
	pColInt64 = dll.NewProc("sqlite3_column_int64")
	pColText  = dll.NewProc("sqlite3_column_text")
	pFinalize = dll.NewProc("sqlite3_finalize")
	pLibVer   = dll.NewProc("sqlite3_libversion")
)

type baseSQL struct{ h uintptr }

func init() {
	// accents lisibles dans la fenêtre noire
	k := syscall.NewLazyDLL("kernel32.dll")
	k.NewProc("SetConsoleOutputCP").Call(65001)
}

func cstr(s string) *byte { b := append([]byte(s), 0); return &b[0] }
func gostr(p uintptr) string {
	if p == 0 {
		return ""
	}
	var b []byte
	for i := uintptr(0); i < 4096; i++ {
		c := *(*byte)(unsafe.Pointer(p + i))
		if c == 0 {
			break
		}
		b = append(b, c)
	}
	return string(b)
}

func ouvrirBase(chemin string) (*baseSQL, error) {
	if err := dll.Load(); err != nil {
		return nil, fmt.Errorf("winsqlite3.dll absent : %v", err)
	}
	var h uintptr
	rc, _, _ := pOpen.Call(uintptr(unsafe.Pointer(cstr(chemin))), uintptr(unsafe.Pointer(&h)))
	if rc != 0 {
		return nil, fmt.Errorf("ouverture refusée (code %d)", rc)
	}
	return &baseSQL{h}, nil
}
func (d *baseSQL) moteur() string {
	p, _, _ := pLibVer.Call()
	return "SQLite " + gostr(p) + " fourni par Windows (winsqlite3.dll)"
}
func (d *baseSQL) err() error {
	p, _, _ := pErrmsg.Call(d.h)
	return errors.New(gostr(p))
}
func (d *baseSQL) exec(sql string) error {
	rc, _, _ := pExec.Call(d.h, uintptr(unsafe.Pointer(cstr(sql))), 0, 0, 0)
	if rc != 0 {
		return d.err()
	}
	return nil
}
func (d *baseSQL) ligne(sql string, f func(st uintptr)) error {
	var st uintptr
	rc, _, _ := pPrepare.Call(d.h, uintptr(unsafe.Pointer(cstr(sql))), ^uintptr(0), uintptr(unsafe.Pointer(&st)), 0)
	if rc != 0 {
		return d.err()
	}
	defer pFinalize.Call(st)
	rc, _, _ = pStep.Call(st)
	if rc != 100 { // SQLITE_ROW
		return fmt.Errorf("aucune ligne (code %d)", rc)
	}
	f(st)
	return nil
}
func (d *baseSQL) entier(sql string) (int64, error) {
	var v int64
	err := d.ligne(sql, func(st uintptr) { r, _, _ := pColInt64.Call(st, 0); v = int64(r) })
	return v, err
}
func (d *baseSQL) texte(sql string) (string, error) {
	var v string
	err := d.ligne(sql, func(st uintptr) { r, _, _ := pColText.Call(st, 0); v = gostr(r) })
	return v, err
}
func (d *baseSQL) fermer() { pClose.Call(d.h) }

func etatNuage(p string) string {
	ptr, err := syscall.UTF16PtrFromString(p)
	if err != nil {
		return "inconnu"
	}
	a, err := syscall.GetFileAttributes(ptr)
	if err != nil {
		return "inconnu"
	}
	switch {
	case a&0x00400000 != 0 || a&0x1000 != 0:
		return "en ligne uniquement (sera téléchargé à la lecture)"
	case a&0x00080000 != 0:
		return "toujours conservé sur cet appareil"
	default:
		return "disponible sur cet appareil"
	}
}
