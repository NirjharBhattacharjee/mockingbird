package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	tea "charm.land/bubbletea/v2"
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

func TestGlyphsAreRectangular(t *testing.T) {
	for ch, g := range glyphs {
		if len(g) != wordH {
			t.Errorf("%q has %d rows, want %d", ch, len(g), wordH)
		}
		for _, row := range g {
			if len(row) != len(g[0]) {
				t.Errorf("%q has ragged rows", ch)
			}
		}
	}
	if w := len(word[0]); w > minCols {
		t.Errorf("wordmark is %d wide, more than minCols %d", w, minCols)
	}
	if len(letters) != len("mockingbird") {
		t.Errorf("got %d letter boxes", len(letters))
	}
}

var escapes = regexp.MustCompile(`\x1b\[[0-9;]*m`)

// Every frame has to fit the terminal, or the inline renderer scrolls and
// leaves pieces of old frames behind.
func TestEveryFrameFits(t *testing.T) {
	start := time.Unix(0, 0)
	// 4x30 and 80x5: resized below the minimum after the animation started.
	for _, size := range [][2]int{{4, 30}, {80, 5}, {minCols, minRows}, {80, 24}, {100, 30}, {200, 60}} {
		for _, at := range []float64{0, 0.3, 0.9, 1.4, 3.3, 10} {
			for _, finished := range []bool{false, true} {
				m := newSplash(start)
				m.cols, m.rows = size[0], size[1]
				m.now = start.Add(time.Duration(at * float64(time.Second)))
				m.finished = finished
				lines := strings.Split(m.render(), "\n")
				if len(lines) > size[1] {
					t.Errorf("%dx%d at %.1fs: %d lines", size[0], size[1], at, len(lines))
				}
				for i, l := range lines {
					if w := utf8.RuneCountInString(escapes.ReplaceAllString(l, "")); w > size[0] {
						t.Errorf("%dx%d at %.1fs: line %d is %d wide", size[0], size[1], at, i, w)
					}
				}
			}
		}
	}
}

func TestBirdOnlyWhenTall(t *testing.T) {
	m := newSplash(time.Unix(0, 0))
	m.now = m.start.Add(5 * time.Second)
	m.cols = 100
	tests := []struct{ rows, lines int }{
		{fullRows - 1, minRows - 1}, // no bird
		{fullRows, fullRows - 1},    // bird
	}
	for _, tt := range tests {
		m.rows = tt.rows
		if got := strings.Count(m.render(), "\n") + 1; got != tt.lines {
			t.Errorf("%d rows: view is %d lines, want %d", tt.rows, got, tt.lines)
		}
	}
}

func TestQuitsOnlyAfterEngineAndMinShow(t *testing.T) {
	start := time.Unix(0, 0)
	at := func(s float64) tea.Msg { return tickMsg(start.Add(time.Duration(s * float64(time.Second)))) }

	var m tea.Model = newSplash(start)
	m, _ = m.Update(at(minShow + 1))
	if m.(splash).finished {
		t.Fatal("finished before the engine did")
	}
	m, _ = m.Update(doneMsg{})
	m, _ = m.Update(at(minShow / 2))
	if m.(splash).finished {
		t.Fatal("finished before minShow")
	}
	m, cmd := m.Update(at(minShow))
	if !m.(splash).finished || cmd == nil {
		t.Fatal("didn't quit once the engine was done and minShow had passed")
	}
}

func TestStatusShowsLatestEngineLine(t *testing.T) {
	var m tea.Model = newSplash(time.Unix(0, 0))
	m, _ = m.Update(lineMsg("Logs: /tmp/agent.log"))
	m, _ = m.Update(lineMsg("   "))
	if got := m.(splash).status; got != "Logs: /tmp/agent.log" {
		t.Errorf("status = %q", got)
	}
}

func TestCanvasHalfBlocks(t *testing.T) {
	tests := []struct {
		name     string
		top, bot rgb
		want     string
	}{
		{"empty", none, none, " "},
		{"top only", sky, none, paint("▀", sky)},
		{"bottom only", none, sky, paint("▄", sky)},
		{"both", sky, teal, fg(sky) + bg(teal) + "▀" + reset},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := newCanvas(1, 2)
			c.set(0, 0, tt.top)
			c.set(0, 1, tt.bot)
			if got := c.render(); got != tt.want {
				t.Errorf("render = %q, want %q", got, tt.want)
			}
		})
	}
}
