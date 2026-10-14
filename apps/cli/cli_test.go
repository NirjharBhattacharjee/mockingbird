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

func TestHomeRunsTheChosenCommand(t *testing.T) {
	info := homeInfo{Status: status{Agent: "stopped"}, Commands: []command{
		{"start", "run in the background"},
		{"models pull", "download the models\n(the only network use)"},
	}}
	var m tea.Model = home{info: info, width: 80}
	if !strings.Contains(escapes.ReplaceAllString(m.(home).render(), ""), "○ stopped") {
		t.Error("the agent's state isn't shown as text")
	}
	for _, k := range []tea.KeyPressMsg{{Code: tea.KeyDown}, {Code: 'j', Text: "j"}, {Code: tea.KeyUp}, {Code: 'j', Text: "j"}} {
		m, _ = m.Update(k)
	}
	if got := m.(home).cursor; got != 1 {
		t.Fatalf("cursor = %d, want it held at the last command", got)
	}
	m, cmd := m.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	if m.(home).chosen != "models pull" || cmd == nil {
		t.Errorf("enter chose %q", m.(home).chosen)
	}
	if m, _ = (home{info: info}).Update(tea.KeyPressMsg{Code: 'q', Text: "q"}); m.(home).chosen != "" {
		t.Error("q ran a command")
	}
}

func TestHomeFitsItsWidth(t *testing.T) {
	for _, agent := range []string{"running", "stopped", "not-installed", "crashed", "exited"} {
		action := "Show Emoji & Symbols"
		m := home{width: homeCols, info: homeInfo{
			Status: status{
				Agent:    agent,
				Missing:  []string{"Input Monitoring", "Accessibility", "Microphone"},
				FnAction: &action,
			},
			Commands: []command{{"fn", strings.Repeat("long summary ", 10)}},
		}}
		for _, line := range strings.Split(escapes.ReplaceAllString(m.render(), ""), "\n") {
			if n := len([]rune(line)); n > homeCols {
				t.Errorf("%s, %d columns: %q", agent, n, line)
			}
		}
	}
}

func TestHomeStartsOnTheNextStep(t *testing.T) {
	emoji := "Show Emoji & Symbols"
	cmds := []command{{"start", ""}, {"restart", ""}, {"fn", ""}, {"status", ""}}
	tests := []struct {
		st   status
		want string
		says string
	}{
		{status{Agent: "stopped"}, "start", "○ stopped"},
		{status{Agent: "running", Missing: []string{"Accessibility"}}, "restart", "✕ missing Accessibility"},
		{status{Agent: "running", Missing: []string{}, FnAction: &emoji}, "fn", "tapping Fn opens Show Emoji & Symbols"},
		{status{Agent: "running", Missing: []string{}}, "start", "● running"},
	}
	for _, tt := range tests {
		m := newHome(homeInfo{Commands: cmds, Status: tt.st})
		if got := cmds[m.cursor].Name; got != tt.want {
			t.Errorf("%+v: cursor on %q, want %q", tt.st, got, tt.want)
		}
		if !strings.Contains(escapes.ReplaceAllString(m.render(), ""), tt.says) {
			t.Errorf("%+v: screen doesn't say %q", tt.st, tt.says)
		}
	}
}

func TestHomeShowsTheWholeWarningWhenNarrow(t *testing.T) {
	m := home{width: homeCols, info: homeInfo{Status: status{
		Agent:   "running",
		Missing: []string{"Input Monitoring", "Accessibility", "Microphone"},
	}}}
	screen := strings.Join(strings.Fields(escapes.ReplaceAllString(m.render(), "")), " ")
	for _, want := range []string{"Input Monitoring, Accessibility, Microphone", "then restart"} {
		if !strings.Contains(screen, want) {
			t.Errorf("at %d columns the screen doesn't say %q", homeCols, want)
		}
	}
	if rows := strings.Count(m.render(), "\n") + 1; rows > homeRows {
		t.Errorf("%d rows, more than homeRows %d", rows, homeRows)
	}
}

// TestSetupWalksEveryStep feeds the flow what the engine would report and
// checks each step comes up in turn. No engine command runs: the commands
// the model returns are never executed.
func TestSetupWalksEveryStep(t *testing.T) {
	emoji := "Show Emoji & Symbols"
	feed := func(m tea.Model, msg tea.Msg) setupModel { m, _ = m.Update(msg); return m.(setupModel) }
	key := func(s string) tea.Msg {
		if s == "enter" {
			return tea.KeyPressMsg{Code: tea.KeyEnter}
		}
		return tea.KeyPressMsg{Code: rune(s[0]), Text: s}
	}

	m := feed(newSetup([]string{"bun", "cli.ts"}), statusMsg{Agent: "stopped"})
	if m.stage != starting {
		t.Fatalf("stopped agent: stage %d, want starting", m.stage)
	}
	if m = feed(m, statusMsg{Agent: "stopped"}); !strings.Contains(m.note, "didn't start") {
		t.Errorf("an agent that won't start should say so, got note %q", m.note)
	}

	m = feed(m, statusMsg{Agent: "running", Missing: []string{"Accessibility"}})
	if m.stage != granting || m.perm != "Accessibility" {
		t.Fatalf("missing Accessibility: stage %d perm %q", m.stage, m.perm)
	}
	if m = feed(m, key("enter")); m.busy == "" {
		t.Error("enter on a permission should restart mockingbird to check")
	}
	m.busy = "" // the restart has finished
	if m = feed(m, statusMsg{Agent: "running", Missing: []string{"Accessibility"}}); !strings.Contains(m.note, "still shows as off") {
		t.Errorf("a permission still off should say so, got note %q", m.note)
	}

	m = feed(m, statusMsg{Agent: "running", Missing: []string{}, FnAction: &emoji})
	if m.stage != freeingFn {
		t.Fatalf("Fn taken: stage %d, want freeingFn", m.stage)
	}
	if !strings.Contains(escapes.ReplaceAllString(m.render(), ""), "Tapping Fn opens Show Emoji & Symbols") {
		t.Error("the Fn step doesn't say what Fn opens")
	}
	// Yes, but the setting doesn't change: not shown as free.
	yes := feed(m, key("y"))
	yes = feed(yes, engineMsg{"Fn is bound to dictation only. Log out of your Mac for it to apply."})
	yes = feed(yes, statusMsg{Agent: "running", Missing: []string{}, FnAction: &emoji})
	if screen := escapes.ReplaceAllString(yes.render(), ""); !strings.Contains(screen, "– the Fn key: tapping still opens") ||
		!strings.Contains(yes.note, "Fn didn't change") {
		t.Errorf("a failed fn shows as done, or says nothing:\n%s", screen)
	}
	// Enter means yes, and the status confirms it: done, pending a log out.
	yes = feed(feed(feed(m, key("enter")), engineMsg{"Log out of your Mac for it to apply."}),
		statusMsg{Agent: "running", Missing: []string{}})
	if screen := escapes.ReplaceAllString(yes.render(), ""); !strings.Contains(screen, "✓ the Fn key is free for dictation once you log out") {
		t.Errorf("a freed Fn isn't shown as done, pending a log out:\n%s", screen)
	}
	// It ends on the log out, not "All set": until then a tap still opens the
	// emoji picker (#31).
	yes = feed(yes, dictationMsg{Outcome: "typed", Detail: "16 characters"})
	screen := escapes.ReplaceAllString(yes.render(), "")
	if !strings.Contains(screen, "One more step: log out") || strings.Contains(screen, "All set") ||
		!strings.Contains(screen, "opens Show Emoji & Symbols; holding Fn") {
		t.Errorf("a freed Fn doesn't end on the log out:\n%s", screen)
	}
	for _, line := range strings.Split(screen, "\n") {
		if n := len([]rune(line)); n > setupCols {
			t.Errorf("%d columns: %q", n, line)
		}
	}

	if m = feed(m, key("n")); m.stage != dictating {
		t.Fatalf("declining fn: stage %d, want dictating", m.stage)
	}
	if !strings.Contains(escapes.ReplaceAllString(m.render(), ""), "– the Fn key: tapping still opens Show Emoji") {
		t.Error("declining fn shows the step as done")
	}

	if m = feed(m, dictationMsg{Outcome: "no-speech"}); !strings.Contains(m.note, "heard nothing") || m.stage != dictating {
		t.Errorf("no speech: note %q, stage %d", m.note, m.stage)
	}
	if m = feed(m, dictationMsg{Outcome: "typed", Detail: "16 characters"}); m.stage != finished {
		t.Fatalf("typed: stage %d, want finished", m.stage)
	}
	for _, line := range strings.Split(escapes.ReplaceAllString(m.render(), ""), "\n") {
		if n := len([]rune(line)); n > setupCols {
			t.Errorf("%d columns: %q", n, line)
		}
	}
}
