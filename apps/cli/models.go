package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
)

// `mockingbird models` in a terminal: two tabs, the cleanup models Ollama
// has and the Whisper files on this Mac, picked with the arrow keys and
// Enter, so nothing is typed. The engine lists them (`models --json`) and
// does the switch (`models use`, which saves through the agent and restarts
// it); this only draws and waits for keys.

type modelEntry struct {
	Name      string `json:"name"`
	File      string `json:"file"` // transcription models only
	Size      int64  `json:"size"`
	InUse     bool   `json:"inUse"`
	IsDefault bool   `json:"isDefault"`
}

type modelListing struct {
	Cleanup       []modelEntry `json:"cleanup"`
	Transcription []modelEntry `json:"transcription"`
	CleanupError  string       `json:"cleanupError"`
}

// The tabs, in order.
var modelTabs = []string{"Cleanup", "Transcription"}

type (
	listingMsg  modelListing
	switchedMsg struct {
		out string
		ok  bool
	}
)

type modelsModel struct {
	engine  []string // bun and the engine's cli.ts
	list    modelListing
	tab     int
	cursor  [2]int
	width   int
	busy    string // what's running, shown in place of the key hints
	note    string // how the last switch went
	noteBad bool
	closed  bool // drawn as nothing, so the picker leaves no trace
}

// loadModels asks the engine for both lists. An engine without `models
// --json` (an older clone), or one that takes over 5s, fails here, and the
// caller falls back to the plain list.
func loadModels(engine []string) (modelListing, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, engine[0], append(engine[1:], "models", "--json")...).Output()
	var list modelListing
	if err == nil {
		err = json.Unmarshal(out, &list)
	}
	return list, err
}

// newModels starts each tab's cursor on the model in use.
func newModels(engine []string, list modelListing) modelsModel {
	m := modelsModel{engine: engine}
	m.setList(list)
	return m
}

func (m *modelsModel) setList(list modelListing) {
	m.list = list
	for tab := range modelTabs {
		rows := m.entries(tab)
		// A shorter list after a reload mustn't leave the cursor past its end.
		m.cursor[tab] = max(0, min(m.cursor[tab], len(rows)-1))
		for i, e := range rows {
			if e.InUse {
				m.cursor[tab] = i
			}
		}
	}
}

func (m modelsModel) entries(tab int) []modelEntry {
	if tab == 0 {
		return m.list.Cleanup
	}
	return m.list.Transcription
}

func (m modelsModel) Init() tea.Cmd { return nil }

func (m modelsModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
	case listingMsg:
		m.setList(modelListing(msg))
		m.busy = ""
	case switchedMsg:
		m.note, m.noteBad = msg.out, !msg.ok
		if !msg.ok {
			m.busy = ""
			return m, nil
		}
		m.busy = "checking what's in use…"
		engine := m.engine
		return m, callEngine(engine, func(out []byte, err error) tea.Msg {
			var list modelListing
			if err == nil && json.Unmarshal(out, &list) == nil {
				return listingMsg(list)
			}
			return listingMsg(m.list)
		}, "models", "--json")
	case tea.KeyPressMsg:
		return m.key(msg.String())
	}
	return m, nil
}

func (m modelsModel) key(k string) (tea.Model, tea.Cmd) {
	if k == "q" || k == "esc" || k == "ctrl+c" {
		m.closed = true
		return m, tea.Quit
	}
	if m.busy != "" {
		return m, nil
	}
	rows := m.entries(m.tab)
	switch k {
	case "left", "h", "shift+tab":
		m.tab = (m.tab + len(modelTabs) - 1) % len(modelTabs)
	case "right", "l", "tab":
		m.tab = (m.tab + 1) % len(modelTabs)
	case "up", "k":
		m.cursor[m.tab] = max(0, m.cursor[m.tab]-1)
	case "down", "j":
		m.cursor[m.tab] = max(0, min(len(rows)-1, m.cursor[m.tab]+1))
	case "enter":
		if m.cursor[m.tab] >= len(rows) || rows[m.cursor[m.tab]].InUse {
			return m, nil
		}
		chosen := rows[m.cursor[m.tab]]
		// The default clears the saved choice rather than pinning today's
		// default, so a later release's default still reaches this Mac.
		value := chosen.Name
		if m.tab == 1 {
			value = chosen.File
		}
		if chosen.IsDefault {
			value = "--default"
		}
		args := []string{"models", "use", value}
		if m.tab == 1 {
			args = []string{"models", "use", "speech", value}
		}
		m.busy, m.note = "switching to "+chosen.Name+", restarting mockingbird…", ""
		return m, callEngine(m.engine, func(out []byte, err error) tea.Msg {
			return switchedMsg{firstLine(string(out)), err == nil}
		}, args...)
	}
	return m, nil
}

// firstLine is the engine's reply, "transcription model: …", without the
// restart's output after it.
func firstLine(s string) string {
	for _, l := range strings.Split(s, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			return l
		}
	}
	return ""
}

func (m modelsModel) View() tea.View {
	if m.closed {
		return tea.NewView("")
	}
	return tea.NewView(m.render())
}

func (m modelsModel) render() string {
	var b strings.Builder
	b.WriteString("\n  " + paint("mockingbird models", mauve) + "\n\n  ")
	for i, name := range modelTabs {
		if i > 0 {
			b.WriteString(paint("  ┃  ", overlay0))
		}
		if i == m.tab {
			b.WriteString(paint(name, mauve))
		} else {
			b.WriteString(paint(name, overlay0))
		}
	}
	b.WriteString("\n\n")

	rows := m.entries(m.tab)
	switch {
	case len(rows) == 0 && m.tab == 0 && m.list.CleanupError != "":
		b.WriteString(paint(wrap(m.list.CleanupError, m.width-4, "  "), yellow) + "\n")
	case len(rows) == 0 && m.tab == 0:
		b.WriteString(paint(wrap("Ollama has no models that write text. `mockingbird models pull` gets the default one.", m.width-4, "  "), yellow) + "\n")
	case len(rows) == 0:
		b.WriteString(paint(wrap("No transcription model yet. `mockingbird models pull` downloads one.", m.width-4, "  "), yellow) + "\n")
	}
	nameWidth := 0
	for _, e := range rows {
		nameWidth = max(nameWidth, len([]rune(e.Name)))
	}
	if m.width > 0 {
		// Indent, pointer, size and the in-use mark need about 34 columns.
		nameWidth = min(nameWidth, max(10, m.width-34))
	}
	for i, e := range rows {
		pointer, color := "  ", text
		if i == m.cursor[m.tab] {
			pointer, color = paint("▸ ", mauve), mauve
		}
		name := cut(e.Name, nameWidth)
		line := "  " + pointer + paint(fmt.Sprintf("%-*s", nameWidth, name), color) + "  " + paint(fmt.Sprintf("%7s", sizeOf(e.Size)), subtext0)
		var marks []string
		if e.InUse {
			marks = append(marks, paint("● in use", green))
		}
		if e.IsDefault {
			marks = append(marks, paint("default", subtext0))
		}
		if len(marks) > 0 {
			line += "   " + strings.Join(marks, paint(" · ", overlay0))
		}
		b.WriteString(line + "\n")
	}

	if m.note != "" {
		color := green
		if m.noteBad {
			color = red
		}
		b.WriteString("\n" + paint(wrap(m.note, m.width-4, "  "), color) + "\n")
	}
	b.WriteString("\n  ")
	if m.busy != "" {
		b.WriteString(paint(m.busy, sky))
	} else {
		b.WriteString(paint("←/→ tab · ↑/↓ move · enter use · q quit", overlay0))
	}
	return b.String() + "\n"
}

// sizeOf is a model's size as the plain list shows it: GB, or MB under 0.1 GB.
func sizeOf(bytes int64) string {
	if bytes < 100_000_000 {
		return fmt.Sprintf("%d MB", bytes/1_000_000)
	}
	return fmt.Sprintf("%.1f GB", float64(bytes)/1e9)
}
