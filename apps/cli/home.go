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

// The home screen for a bare `mockingbird`: what state mockingbird is in,
// and the engine's commands as a list to pick from. Both come from the engine
// (`help --json`), so they can't drift from what it accepts and reports.

type command struct {
	Name    string `json:"name"`
	Summary string `json:"summary"`
}

// status is `mockingbird status --json`.
type status struct {
	Agent    string   `json:"agent"`
	Missing  []string `json:"missing"`  // nil when the agent hasn't reported
	FnAction *string  `json:"fnAction"` // what macOS opens on a Fn tap, if anything
}

type homeInfo struct {
	Commands []command `json:"commands"`
	Status   status    `json:"status"`
}

// loadHome asks the engine for its commands and the agent's state. An older
// engine without `help --json`, or one that takes over 5s to answer, fails
// here, and the caller falls back to the plain usage text.
func loadHome(argv []string) (homeInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, argv[0], append(argv[1:], "help", "--json")...).Output()
	var info homeInfo
	if err == nil {
		err = json.Unmarshal(out, &info)
	}
	return info, err
}

type home struct {
	info   homeInfo
	width  int
	cursor int
	chosen string // the command to run once the screen closes; "" to just quit
	closed bool   // drawn as nothing, so the menu leaves no trace in the scrollback
}

// newHome starts the cursor on the command that fixes the first problem, so
// Enter is the next step: start a stopped agent, restart one that's missing
// a permission (after granting it), or free Fn. The list keeps its order.
func newHome(info homeInfo) home {
	next := ""
	switch st := info.Status; {
	case st.Agent != "running":
		next = "start"
	case len(st.Missing) > 0:
		next = "restart"
	case st.FnAction != nil:
		next = "fn"
	}
	m := home{info: info}
	for i, c := range info.Commands {
		if c.Name == next {
			m.cursor = i
		}
	}
	return m
}

func (m home) Init() tea.Cmd { return nil }

func (m home) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if size, ok := msg.(tea.WindowSizeMsg); ok {
		m.width = size.Width
	}
	key, ok := msg.(tea.KeyPressMsg)
	if !ok {
		return m, nil
	}
	switch key.String() {
	case "up", "k":
		m.cursor = max(0, m.cursor-1)
	case "down", "j":
		m.cursor = min(len(m.info.Commands)-1, m.cursor+1)
	case "enter":
		m.chosen = m.info.Commands[m.cursor].Name
		m.closed = true
		return m, tea.Quit
	case "q", "esc", "ctrl+c":
		m.closed = true
		return m, tea.Quit
	}
	return m, nil
}

func (m home) View() tea.View {
	if m.closed {
		return tea.NewView("")
	}
	return tea.NewView(m.render())
}

// statusLines pairs every state with a word and a symbol, so they read
// without color too (docs/TUI.md §8). Each line is cut to width, after the
// "  mockingbird  " title on the first.
func statusLines(st status, width int) string {
	text, color := agentLine(st.Agent)
	line := paint(text, color)
	if len(st.Missing) > 0 {
		missing := "✕ missing " + strings.Join(st.Missing, ", ")
		line += "  " + paint(cut(missing, width-17-len([]rune(text))), red) +
			"\n  " + paint(cut("! allow it in System Settings → Privacy & Security, then restart", width-2), yellow)
	}
	if st.FnAction != nil {
		line += "\n  " + paint(cut("! tapping Fn opens "+*st.FnAction+", so tapping won't dictate", width-2), yellow)
	}
	return line
}

func agentLine(state string) (string, rgb) {
	switch state {
	case "running":
		return "● running", green
	case "crashed", "exited":
		return "✕ " + state + ", see status", red
	case "not-installed":
		return "○ not started yet", yellow
	default:
		return "○ " + state, yellow
	}
}

func (m home) render() string {
	var b strings.Builder
	b.WriteString("\n  " + paint("mockingbird", mauve) + "  " + statusLines(m.info.Status, m.width) + "\n\n")
	for i, c := range m.info.Commands {
		// The engine wraps long summaries for --help; one line here, cut to
		// fit after the 19 columns of indent, pointer and name.
		summary := cut(strings.Join(strings.Fields(c.Summary), " "), m.width-19)
		pointer, color := "  ", text
		if i == m.cursor {
			pointer, color = paint("▸ ", mauve), mauve
		}
		b.WriteString("  " + pointer + paint(fmt.Sprintf("%-13s", c.Name), color) + paint(summary, subtext0) + "\n")
	}
	b.WriteString("\n  " + paint("↑/↓ move · enter run · q quit", overlay0))
	return b.String()
}

// cut shortens s to n columns with an ellipsis. n <= 0 means no limit: the
// width isn't known until the first WindowSizeMsg.
func cut(s string, n int) string {
	r := []rune(s)
	if n <= 0 || len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}
