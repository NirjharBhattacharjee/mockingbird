package main

import (
	"fmt"
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

// TestSetupOffersFnWhenUnset: on a Mac where nobody changed the Fn setting,
// status reports macOS's default, so setup still asks, and its longest lines
// wrap to fit (#31).
func TestSetupOffersFnWhenUnset(t *testing.T) {
	unset := "the macOS default (usually the emoji picker)"
	feed := func(m tea.Model, msg tea.Msg) setupModel { m, _ = m.Update(msg); return m.(setupModel) }
	m := feed(newSetup([]string{"bun", "cli.ts"}), statusMsg{Agent: "running", Missing: []string{}, FnAction: &unset})
	if m.stage != freeingFn {
		t.Fatalf("unset Fn: stage %d, want freeingFn", m.stage)
	}
	declined := feed(m, tea.KeyPressMsg{Code: 'n', Text: "n"})
	freed := feed(feed(feed(m, tea.KeyPressMsg{Code: tea.KeyEnter}), engineMsg{"Log out."}),
		statusMsg{Agent: "running", Missing: []string{}})
	freed = feed(freed, dictationMsg{Outcome: "typed", Detail: "16 characters"})
	for _, s := range []setupModel{m, declined, freed} {
		for _, line := range strings.Split(escapes.ReplaceAllString(s.render(), ""), "\n") {
			if n := len([]rune(line)); n > setupCols {
				t.Errorf("%d columns: %q", n, line)
			}
		}
	}
	if screen := escapes.ReplaceAllString(freed.render(), ""); !strings.Contains(screen, "One more step: log out") {
		t.Errorf("freeing an unset Fn doesn't end on the log out:\n%s", screen)
	}
}

// TestModelsPicker feeds the picker what `models --json` would say and walks
// it with the keys. No engine command runs: the commands the model returns
// are never executed, so Enter is checked by what it sets busy to.
func TestModelsPicker(t *testing.T) {
	list := modelListing{
		Cleanup: []modelEntry{
			{Name: "qwen3:4b-instruct-2507-q4_K_M", Size: 2_500_000_000, IsDefault: true},
			{Name: "gemma3:1b", Size: 800_000_000, InUse: true},
		},
		Transcription: []modelEntry{
			{Name: "large-v3 Q5_0", File: "ggml-large-v3-q5_0.bin", Size: 1_081_000_000, InUse: true, IsDefault: true},
			{Name: "base.en", File: "ggml-base.en.bin", Size: 148_000_000},
		},
	}
	feed := func(m tea.Model, msg tea.Msg) modelsModel { m, _ = m.Update(msg); return m.(modelsModel) }
	key := func(code rune) tea.Msg { return tea.KeyPressMsg{Code: code} }

	m := feed(newModels([]string{"bun", "cli.ts"}, list), tea.WindowSizeMsg{Width: modelsCols, Height: modelsRows})
	screen := escapes.ReplaceAllString(m.render(), "")
	if m.cursor != [2]int{1, 0} {
		t.Errorf("cursors %v, want each tab's on the model in use", m.cursor)
	}
	if !strings.Contains(screen, "▸ gemma3:1b") || strings.Contains(screen, "/37") {
		t.Errorf("cleanup tab doesn't point at the model in use, or shows scores:\n%s", screen)
	}

	// Enter on the model in use does nothing.
	if m = feed(m, key(tea.KeyEnter)); m.busy != "" {
		t.Errorf("enter on the model in use started %q", m.busy)
	}
	// Up to the default, Enter switches to it.
	m = feed(feed(m, key(tea.KeyUp)), key(tea.KeyEnter))
	if !strings.Contains(m.busy, "switching to qwen3") {
		t.Errorf("enter on another model: busy %q", m.busy)
	}
	// Keys wait while it switches; the reply then shows, and the list reloads.
	m = feed(m, key(tea.KeyRight))
	if m.tab != 0 {
		t.Error("a tab switch got through while busy")
	}
	m = feed(m, switchedMsg{"cleanup model: qwen3:4b-instruct-2507-q4_K_M", true})
	list.Cleanup[0].InUse, list.Cleanup[1].InUse = true, false
	m = feed(m, listingMsg(list))
	if m.busy != "" || m.cursor[0] != 0 || !strings.Contains(m.render(), "cleanup model: qwen3") {
		t.Errorf("after the switch: busy %q, cursor %d", m.busy, m.cursor[0])
	}

	// The Transcription tab, its Enter naming the file.
	m = feed(m, key(tea.KeyRight))
	screen = escapes.ReplaceAllString(m.render(), "")
	if m.tab != 1 || !strings.Contains(screen, "▸ large-v3 Q5_0") || !strings.Contains(screen, "● in use") {
		t.Errorf("transcription tab:\n%s", screen)
	}
	m = feed(feed(m, key(tea.KeyDown)), key(tea.KeyEnter))
	if !strings.Contains(m.busy, "switching to base.en") {
		t.Errorf("enter on base.en: busy %q", m.busy)
	}
	// A failed switch says so, and leaves the keys free.
	m = feed(m, switchedMsg{"mockingbird isn't running, so the choice can't be saved.", false})
	if m.busy != "" || !m.noteBad {
		t.Errorf("a failed switch: busy %q, bad %v", m.busy, m.noteBad)
	}
	for _, line := range strings.Split(escapes.ReplaceAllString(m.render(), ""), "\n") {
		if n := len([]rune(line)); n > modelsCols {
			t.Errorf("%d columns: %q", n, line)
		}
	}

	// Ollama down: the cleanup tab says why, the other still works.
	down := feed(newModels([]string{"bun", "cli.ts"}, modelListing{
		CleanupError:  "Ollama isn't answering at http://127.0.0.1:11434. `mockingbird start` starts it.",
		Transcription: list.Transcription,
	}), tea.WindowSizeMsg{Width: 60})
	if screen := escapes.ReplaceAllString(down.render(), ""); !strings.Contains(screen, "Ollama isn't answering") {
		t.Errorf("Ollama down doesn't say so:\n%s", screen)
	}
	// ↓ on the empty tab, then a reload with models but none in use: the
	// cursor stays in range, and Enter neither panics nor does nothing odd.
	down = feed(down, key(tea.KeyDown))
	if down = feed(down, key(tea.KeyEnter)); down.busy != "" || down.cursor[0] != 0 {
		t.Errorf("enter on an empty tab: busy %q, cursor %d", down.busy, down.cursor[0])
	}
	down = feed(down, listingMsg(modelListing{Cleanup: []modelEntry{{Name: "gemma3:1b"}}}))
	if down = feed(down, key(tea.KeyEnter)); !strings.Contains(down.busy, "switching to gemma3:1b") {
		t.Errorf("after the reload, enter: busy %q", down.busy)
	}
}

// TestDictionaryTable feeds the table what `dictionary list --json` would say
// and walks it with the keys. No engine command runs: the commands the model
// returns are never executed, so add and remove are checked by `busy`.
func TestDictionaryTable(t *testing.T) {
	s := func(v string) *string { return &v }
	rows := []dictRow{
		{Term: "Ollama", Heard: s("o llama"), Uses: 0, Learned: true, CreatedAt: 3},
		{Term: "Catppuccin", Heard: s("cat puck"), Hint: s("a colour theme"), Uses: 14, CreatedAt: 1},
		{Term: "Kubernetes", Uses: 9, CreatedAt: 2},
	}
	feed := func(m tea.Model, msg tea.Msg) dictModel { m, _ = m.Update(msg); return m.(dictModel) }
	key := func(code rune) tea.Msg { return tea.KeyPressMsg{Code: code} }
	typed := func(m dictModel, s string) dictModel {
		for _, r := range s {
			m = feed(m, tea.KeyPressMsg{Code: r, Text: string(r)})
		}
		return m
	}
	termsOf := func(m dictModel) []string {
		var out []string
		for _, r := range m.shown() {
			out = append(out, r.Term)
		}
		return out
	}

	m := feed(newDictionary([]string{"bun", "cli.ts"}, rows), tea.WindowSizeMsg{Width: dictCols, Height: 30})
	screen := escapes.ReplaceAllString(m.render(), "")
	if got := termsOf(m); strings.Join(got, ",") != "Catppuccin,Kubernetes,Ollama" {
		t.Errorf("default order %v, want most used first", got)
	}
	if !strings.Contains(screen, "3 words · 1 learned") || strings.Contains(screen, "null") {
		t.Errorf("title or blank cells wrong:\n%s", screen)
	}
	if !strings.Contains(screen, "learned") || !strings.Contains(screen, "by you") {
		t.Errorf("who added each word isn't shown:\n%s", screen)
	}
	for _, line := range strings.Split(screen, "\n") {
		if n := len([]rune(line)); n > dictCols {
			t.Errorf("%d columns: %q", n, line)
		}
	}

	// s: A–Z, then newest, then back to uses.
	if m = feed(m, key('s')); strings.Join(termsOf(m), ",") != "Catppuccin,Kubernetes,Ollama" {
		t.Errorf("A–Z: %v", termsOf(m))
	}
	if m = feed(m, key('s')); strings.Join(termsOf(m), ",") != "Ollama,Kubernetes,Catppuccin" {
		t.Errorf("newest: %v", termsOf(m))
	}
	m = feed(m, key('s'))

	// /: filters on the word, what it's heard as, and the note.
	m = typed(feed(m, key('/')), "colour")
	if got := termsOf(m); len(got) != 1 || got[0] != "Catppuccin" {
		t.Errorf("filter on the note: %v", got)
	}
	m = feed(m, key(tea.KeyEscape))
	if m.filter != "" || len(m.shown()) != 3 || m.mode != browsing {
		t.Errorf("esc should clear the filter: %q, %d rows", m.filter, len(m.shown()))
	}

	// a: types an entry and adds it through the engine.
	m = typed(feed(m, key('a')), "jira (the tracker)")
	if m = feed(m, key(tea.KeyEnter)); !strings.Contains(m.busy, "adding jira (the tracker)") {
		t.Errorf("add: busy %q", m.busy)
	}
	m = feed(m, dictDoneMsg{"added jira", true})
	m = feed(m, dictListMsg(append(rows, dictRow{Term: "jira", Hint: s("the tracker"), CreatedAt: 4})))
	if m.busy != "" || len(m.rows) != 4 {
		t.Errorf("after the add: busy %q, %d rows", m.busy, len(m.rows))
	}

	// d: asks first; anything but y keeps it, y removes the row under the cursor.
	m = feed(m, key('d'))
	if m.mode != removing || !strings.Contains(m.render(), "remove Catppuccin? y/n") {
		t.Errorf("d should ask:\n%s", m.render())
	}
	if m = feed(m, key('n')); m.mode != browsing || m.busy != "" {
		t.Error("n should keep it")
	}
	m = feed(feed(m, key('d')), key('y'))
	if !strings.Contains(m.busy, "removing Catppuccin") {
		t.Errorf("remove: busy %q", m.busy)
	}
	// A stopped agent can't change it: shown, and the keys free again.
	m = feed(m, dictDoneMsg{"mockingbird isn't running, so the dictionary can't be changed.", false})
	if m.busy != "" || !m.noteBad {
		t.Errorf("a failed change: busy %q, bad %v", m.busy, m.noteBad)
	}

	// Empty, and a long list in a short window keeps the cursor in view.
	empty := feed(newDictionary([]string{"bun", "cli.ts"}, nil), tea.WindowSizeMsg{Width: dictCols, Height: dictRows})
	if !strings.Contains(escapes.ReplaceAllString(empty.render(), ""), "The dictionary is empty") {
		t.Error("an empty dictionary doesn't say so")
	}
	var many []dictRow
	for i := range 30 {
		many = append(many, dictRow{Term: fmt.Sprintf("word%02d", i), Uses: 30 - i})
	}
	long := feed(newDictionary([]string{"bun", "cli.ts"}, many), tea.WindowSizeMsg{Width: dictCols, Height: dictRows})
	for range 20 {
		long = feed(long, key(tea.KeyDown))
	}
	if screen := escapes.ReplaceAllString(long.render(), ""); !strings.Contains(screen, "▸ word20") || !strings.Contains(screen, "more") {
		t.Errorf("the cursor's row isn't on screen:\n%s", screen)
	}
	// The add prompt and a long note take lines too: the whole screen still fits.
	long = feed(long, dictDoneMsg{"mockingbird isn't running, so the dictionary can't be changed. Start it with mockingbird start, then try again.", false})
	long = feed(long, key('a'))
	screen = strings.TrimSuffix(escapes.ReplaceAllString(long.render(), ""), "\n")
	if n := strings.Count(screen, "\n") + 1; n > dictRows || !strings.Contains(screen, "▸ word20") {
		t.Errorf("%d lines in a %d-row window, or the cursor scrolled off:\n%s", n, dictRows, screen)
	}
}

// TestCalibrate walks the calibration screen with the replies the engine
// would give. The commands the model returns are never run.
func TestCalibrate(t *testing.T) {
	long := "It was a long journey, and by the time we reached the village, everyone was tired, hungry and ready to sleep."
	script := []string{"Thank you for helping me set this up today.", long, "Six sticky skeletons stood silently in the street."}
	feed := func(m tea.Model, msg tea.Msg) calibModel { m, _ = m.Update(msg); return m.(calibModel) }
	key := func(code rune) tea.Msg { return tea.KeyPressMsg{Code: code} }
	plain := func(m calibModel) string { return escapes.ReplaceAllString(m.render(), "") }
	fitsScreen := func(m calibModel) {
		t.Helper()
		screen := plain(m)
		for _, line := range strings.Split(screen, "\n") {
			if n := len([]rune(line)); n > calibCols {
				t.Errorf("%d columns: %q", n, line)
			}
		}
		if n := strings.Count(screen, "\n") + 1; n > calibRows {
			t.Errorf("%d rows, more than calibRows %d:\n%s", n, calibRows, screen)
		}
	}

	m := feed(newCalibrate([]string{"bun", "cli.ts"}, script), tea.WindowSizeMsg{Width: calibCols, Height: calibRows})
	if s := plain(m); !strings.Contains(s, "sentence 1 of 3") || !strings.Contains(s, script[0]) {
		t.Errorf("first sentence:\n%s", s)
	}

	// The agent isn't running: Enter says so and the sentence stays up.
	m = feed(feed(m, key(tea.KeyEnter)), takeStartedMsg{"mockingbird isn't running. Start it with `mockingbird start`, then try again.\n", false})
	if m.state != calibReading || !strings.Contains(plain(m), "isn't running") {
		t.Errorf("failed start: state %d\n%s", m.state, plain(m))
	}

	// Enter, read, Enter: the scored sentence shows the misses.
	m = feed(feed(m, key(tea.KeyEnter)), takeStartedMsg{"recording", true})
	if m.state != calibRecording || !strings.Contains(plain(m), "● recording") || strings.Contains(plain(m), "isn't running") {
		t.Errorf("recording: state %d\n%s", m.state, plain(m))
	}
	m = feed(m, key(tea.KeyEnter))
	if m.state != calibHearing {
		t.Errorf("after the second enter: state %d", m.state)
	}
	heard := takeResult{
		Heard: "Thank you for helping me set this up to day.", Model: "large-v3-turbo", Edits: 2, Words: 9,
		Reference:  []diffWord{{"Thank", true}, {"you", true}, {"for", true}, {"helping", true}, {"me", true}, {"set", true}, {"this", true}, {"up", true}, {"today", false}},
		Hypothesis: []diffWord{{"Thank", true}, {"you", true}, {"for", true}, {"helping", true}, {"me", true}, {"set", true}, {"this", true}, {"up", true}, {"to", false}, {"day", false}},
	}
	m = feed(m, takeHeardMsg{result: heard, ok: true})
	if s := plain(m); m.state != calibScored || !strings.Contains(s, "7 of 9 words right") || !strings.Contains(s, "up to day") {
		t.Errorf("scored:\n%s", s)
	}
	if !strings.Contains(m.render(), paint("today", red)) {
		t.Error("the missed word isn't red")
	}
	fitsScreen(m)

	// r reads it again: keys wait for the agent, and a cancelled take
	// leaves the same sentence up. Enter then moves on.
	if m = feed(m, key('r')); m.state != calibWaiting || !strings.Contains(plain(m), "waiting for mockingbird") {
		t.Errorf("r: state %d\n%s", m.state, plain(m))
	}
	if m = feed(feed(m, key(tea.KeyEnter)), key('s')); m.state != calibWaiting || m.at != 0 {
		t.Errorf("keys got through while waiting: state %d, at %d", m.state, m.at)
	}
	m = feed(feed(m, takeStartedMsg{"recording", true}), key(tea.KeyEscape))
	if m.state != calibWaiting {
		t.Errorf("esc while recording: state %d, want waiting for the cancel", m.state)
	}
	if m = feed(m, takeCancelledMsg{}); m.state != calibReading || m.at != 0 {
		t.Errorf("after the cancel: state %d, at %d", m.state, m.at)
	}
	m = feed(feed(feed(m, key(tea.KeyEnter)), takeStartedMsg{"recording", true}), key(tea.KeyEnter))
	m = feed(feed(m, takeHeardMsg{result: heard, ok: true}), key(tea.KeyEnter))
	if m.at != 1 || m.state != calibReading {
		t.Errorf("enter after a score: at %d, state %d", m.at, m.state)
	}
	fitsScreen(m)
	longWords := []diffWord{}
	for _, w := range strings.Fields(long) {
		longWords = append(longWords, diffWord{strings.Trim(w, ",."), true})
	}
	m = feed(feed(feed(m, key(tea.KeyEnter)), takeStartedMsg{"recording", true}), key(tea.KeyEnter))
	m = feed(m, takeHeardMsg{result: takeResult{Model: "large-v3-turbo", Words: len(longWords), Reference: longWords, Hypothesis: longWords}, ok: true})
	fitsScreen(m)

	// On the last sentence, s pressed while a start is on its way doesn't
	// move past the script (it used to, and the start's reply then drew a
	// sentence that isn't there). s once it's back skips, and the run ends.
	m = feed(feed(m, key(tea.KeyEnter)), key(tea.KeyEnter))
	m = feed(feed(m, key('s')), takeStartedMsg{"error: a take is already recording", false})
	if m.at != 2 || m.state != calibReading || !strings.Contains(plain(m), "already recording") {
		t.Errorf("s while starting on the last sentence: at %d, state %d\n%s", m.at, m.state, plain(m))
	}
	m = feed(m, key('s'))
	s := plain(m)
	// 2 wrong of 9 + 21 words.
	want := fmt.Sprintf("large-v3-turbo got %d%% of your words right.", 100*(9+len(longWords)-2)/(9+len(longWords)))
	if m.state != calibDone || !strings.Contains(s, want) || !strings.Contains(s, "in 2 sentences.") {
		t.Errorf("done, want %q:\n%s", want, s)
	}
	fitsScreen(m)

	// q while a start is on its way: once the agent says it started, the
	// take is cancelled before the screen goes.
	q := feed(feed(newCalibrate([]string{"bun", "cli.ts"}, script), key(tea.KeyEnter)), key('q'))
	if q.closed {
		t.Error("q while waiting closed the screen before the agent answered")
	}
	next, cmd := q.Update(takeStartedMsg{"recording", true})
	if !next.(calibModel).closed || cmd == nil {
		t.Error("the started take wasn't cancelled on the way out")
	}

	// Skipping everything scores nothing.
	none := newCalibrate([]string{"bun", "cli.ts"}, script[:1])
	if none = feed(none, key('s')); !strings.Contains(plain(none), "nothing to score") {
		t.Errorf("all skipped:\n%s", plain(none))
	}
}
