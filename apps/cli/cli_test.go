package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindRoot(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, filepath.Dir(engineCLI)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, engineCLI), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(root, "apps", "cli")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	elsewhere := t.TempDir()

	tests := []struct {
		name, env, dir, want string
	}{
		{"env names the root", root, elsewhere, root},
		{"env is wrong, and wins anyway", elsewhere, nested, ""},
		{"walks up from the binary", "", nested, root},
		{"nothing found", "", elsewhere, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := findRoot(tt.env, tt.dir); got != tt.want {
				t.Errorf("findRoot = %q, want %q", got, tt.want)
			}
		})
	}
}
