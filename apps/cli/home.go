package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"

	tea "charm.land/bubbletea/v2"
)

// The home screen for a bare `mockingbird`: whether the agent is running,
// and the engine's commands as a list to pick from. The list comes from the
// engine (`help --json`), so it can't drift from what the engine accepts.

type command struct {
	Name    string `json:"name"`
	Summary string `json:"summary"`
}

type homeInfo struct {
	Agent    string    `json:"agent"`
	Commands []command `json:"commands"`
}

// loadHome asks the engine for its commands and the agent's state. An older
// engine without `help --json` fails here, and the caller falls back to the
// plain usage text.
func loadHome(argv []string) (homeInfo, error) {
	out, err := exec.Command(argv[0], append(argv[1:], "help", "--json")...).Output()
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

// agentLine pairs every state with a word and a symbol, so it reads without
// color too (docs/TUI.md §8).
func agentLine(state string) string {
	switch state {
	case "running":
		return paint("● running", green)
	case "crashed", "exited":
		return paint("✕ "+state+", see `mockingbird status`", red)
	case "not-installed":
		return paint("○ not started yet", yellow)
	default:
		return paint("○ "+state, yellow)
	}
}

func (m home) render() string {
	var b strings.Builder
	b.WriteString("\n  " + paint("mockingbird", mauve) + "  " + agentLine(m.info.Agent) + "\n\n")
	for i, c := range m.info.Commands {
		// The engine wraps long summaries for --help; one line here, cut to
		// fit after the 19 columns of indent, pointer and name.
		summary := []rune(strings.Join(strings.Fields(c.Summary), " "))
		if room := m.width - 19; m.width > 0 && len(summary) > room {
			summary = append(summary[:max(0, room-1)], '…')
		}
		pointer, color := "  ", text
		if i == m.cursor {
			pointer, color = paint("▸ ", mauve), mauve
		}
		b.WriteString("  " + pointer + paint(fmt.Sprintf("%-13s", c.Name), color) + paint(string(summary), subtext0) + "\n")
	}
	b.WriteString("\n  " + paint("↑/↓ move · enter run · q quit", overlay0))
	return b.String()
}
