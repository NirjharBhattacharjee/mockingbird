package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
)

// `mockingbird dictionary` in a terminal: the dictionary as a table, sorted by
// how often dictation uses each word, with a filter, add and remove (#102).
// The engine reads it (`dictionary list --json`, read-only) and does every
// change (`dictionary add`/`remove`, which ask the agent to write); this only
// draws and waits for keys, so the Go command never writes data.db.

type dictRow struct {
	Term      string  `json:"term"`
	Heard     *string `json:"heard"`
	Hint      *string `json:"hint"`
	Uses      int     `json:"uses"`
	Learned   bool    `json:"learned"`
	CreatedAt int64   `json:"createdAt"`
}

// The sort orders `s` cycles through, the first being the default.
var dictSorts = []string{"uses", "A–Z", "newest"}

type dictMode int

const (
	browsing  dictMode = iota
	filtering          // `/`: typing narrows the list
	adding             // `a`: typing an entry, as `dictionary add` takes it
	removing           // `d`: waiting for y/n
)

type (
	dictListMsg []dictRow
	dictDoneMsg struct {
		out string
		ok  bool
	}
)

type dictModel struct {
	engine  []string // bun and the engine's cli.ts
	rows    []dictRow
	sortBy  int
	filter  string
	input   string // what's being typed for `a`
	mode    dictMode
	cursor  int
	width   int
	height  int
	busy    string
	note    string
	noteBad bool
	closed  bool
}

// loadDictionary asks the engine for every row. An engine without `list
// --json` (an older clone), or one taking over 5s, fails here, and the caller
// falls back to the plain list.
func loadDictionary(engine []string) ([]dictRow, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, engine[0], append(engine[1:], "dictionary", "list", "--json")...).Output()
	var rows []dictRow
	if err == nil {
		err = json.Unmarshal(out, &rows)
	}
	return rows, err
}

func newDictionary(engine []string, rows []dictRow) dictModel {
	return dictModel{engine: engine, rows: rows}
}

// shown is the rows the filter lets through, in the current sort order.
func (m dictModel) shown() []dictRow {
	var out []dictRow
	q := strings.ToLower(m.filter)
	for _, r := range m.rows {
		if q == "" || strings.Contains(strings.ToLower(r.Term+" "+deref(r.Heard)+" "+deref(r.Hint)), q) {
			out = append(out, r)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		switch dictSorts[m.sortBy] {
		case "A–Z":
			return strings.ToLower(a.Term) < strings.ToLower(b.Term)
		case "newest":
			return a.CreatedAt > b.CreatedAt
		default:
			if a.Uses != b.Uses {
				return a.Uses > b.Uses
			}
			return strings.ToLower(a.Term) < strings.ToLower(b.Term)
		}
	})
	return out
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (m dictModel) Init() tea.Cmd { return nil }

func (m dictModel) reload() tea.Cmd {
	return callEngine(m.engine, func(out []byte, err error) tea.Msg {
		var rows []dictRow
		if err == nil && json.Unmarshal(out, &rows) == nil {
			return dictListMsg(rows)
		}
		return dictListMsg(m.rows)
	}, "dictionary", "list", "--json")
}

func (m dictModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
	case dictListMsg:
		m.rows, m.busy = msg, ""
		m.cursor = max(0, min(m.cursor, len(m.shown())-1))
	case dictDoneMsg:
		m.note, m.noteBad = msg.out, !msg.ok
		if !msg.ok {
			m.busy = ""
			return m, nil
		}
		return m, m.reload()
	case tea.KeyPressMsg:
		return m.key(msg)
	}
	return m, nil
}

func (m dictModel) key(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	k := msg.String()
	if k == "ctrl+c" {
		m.closed = true
		return m, tea.Quit
	}
	if m.busy != "" {
		return m, nil
	}
	switch m.mode {
	case filtering, adding:
		wasAdding := m.mode == adding
		field := &m.filter
		if wasAdding {
			field = &m.input
		}
		switch k {
		case "esc":
			*field = ""
			m.mode = browsing
		case "enter":
			m.mode = browsing
			if entry := strings.TrimSpace(m.input); wasAdding && entry != "" {
				m.input, m.busy, m.note = "", "adding "+entry+"…", ""
				return m, callEngine(m.engine, func(out []byte, err error) tea.Msg {
					return dictDoneMsg{firstLine(string(out)), err == nil}
				}, "dictionary", "add", entry)
			}
		case "backspace":
			if r := []rune(*field); len(r) > 0 {
				*field = string(r[:len(r)-1])
			}
		default:
			if msg.Text != "" {
				*field += msg.Text
			}
		}
		m.cursor = max(0, min(m.cursor, len(m.shown())-1))
		return m, nil
	case removing:
		rows := m.shown()
		if k == "y" && m.cursor < len(rows) {
			term := rows[m.cursor].Term
			m.mode, m.busy, m.note = browsing, "removing "+term+"…", ""
			return m, callEngine(m.engine, func(out []byte, err error) tea.Msg {
				return dictDoneMsg{firstLine(string(out)), err == nil}
			}, "dictionary", "remove", term)
		}
		m.mode = browsing
		return m, nil
	}

	rows := m.shown()
	switch k {
	case "q", "esc":
		m.closed = true
		return m, tea.Quit
	case "up", "k":
		m.cursor = max(0, m.cursor-1)
	case "down", "j":
		m.cursor = max(0, min(len(rows)-1, m.cursor+1))
	case "s":
		m.sortBy = (m.sortBy + 1) % len(dictSorts)
		m.cursor = 0
	case "/":
		m.mode, m.note = filtering, ""
	case "a":
		m.mode, m.note = adding, ""
	case "d":
		if len(rows) > 0 {
			m.mode, m.note = removing, ""
		}
	}
	return m, nil
}

func (m dictModel) View() tea.View {
	if m.closed {
		return tea.NewView("")
	}
	return tea.NewView(m.render())
}

// Fixed columns: the pointer and gaps, HEARD AS at most this wide, USES, ADDED.
const (
	dictHeardMax = 16
	dictUsesW    = 4
	dictAddedW   = 7 // "learned"
)

func (m dictModel) render() string {
	var b strings.Builder
	learned := 0
	for _, r := range m.rows {
		if r.Learned {
			learned++
		}
	}
	title := fmt.Sprintf("%d word%s · %d learned", len(m.rows), plural(len(m.rows)), learned)
	b.WriteString("\n  " + paint("dictionary", mauve) + paint(" — "+title, subtext0))
	if m.sortBy != 0 {
		b.WriteString(paint(" · sorted "+dictSorts[m.sortBy], subtext0))
	}
	b.WriteString("\n\n")

	rows := m.shown()
	if len(m.rows) == 0 {
		b.WriteString(paint(wrap("The dictionary is empty. Press a to add a word, or fix a misheard name in a dictation and it learns it.", m.width-4, "  "), yellow) + "\n")
	} else if len(rows) == 0 {
		b.WriteString(paint("  Nothing matches “"+m.filter+"”.", yellow) + "\n")
	} else {
		b.WriteString(m.table(rows))
	}

	switch {
	case m.mode == filtering:
		b.WriteString("\n  " + paint("/", mauve) + " " + m.filter + paint("▏", mauve))
	case m.mode == adding:
		b.WriteString("\n  " + paint("add: ", mauve) + m.input + paint("▏", mauve) +
			"\n  " + paint(`word · "heard => word" · "word (note)"`, overlay0))
	case m.mode == removing && m.cursor < len(rows):
		b.WriteString("\n  " + paint("remove "+rows[m.cursor].Term+"? y/n", yellow))
	case m.filter != "":
		b.WriteString("\n  " + paint("filter: "+m.filter, subtext0))
	}
	if m.note != "" {
		color := green
		if m.noteBad {
			color = red
		}
		b.WriteString("\n" + paint(wrap(m.note, m.width-4, "  "), color))
	}
	b.WriteString("\n\n  ")
	switch {
	case m.busy != "":
		b.WriteString(paint(m.busy, sky))
	case m.mode == filtering:
		b.WriteString(paint("type to filter · enter keep · esc clear", overlay0))
	case m.mode == adding:
		b.WriteString(paint("enter add · esc cancel", overlay0))
	case m.mode == removing:
		b.WriteString(paint("y remove · any other key keeps it", overlay0))
	default:
		b.WriteString(paint("↑/↓ move · / search · s sort · a add · d remove · q quit", overlay0))
	}
	return b.String() + "\n"
}

// table lays the rows out to the width: the word is never cut, HEARD AS
// shrinks to its longest entry (at most 16), and NOTE takes what's left.
func (m dictModel) table(rows []dictRow) string {
	wordW, heardW := len("WORD"), len("HEARD AS")
	for _, r := range rows {
		wordW = max(wordW, len([]rune(r.Term)))
		heardW = max(heardW, min(dictHeardMax, len([]rune(deref(r.Heard)))))
	}
	// Indent and pointer 4, gaps between five columns 8.
	noteW := m.width - 4 - wordW - heardW - dictUsesW - dictAddedW - 8
	if m.width <= 0 {
		noteW = 30
	}
	noteW = max(4, noteW)

	var b strings.Builder
	head := fmt.Sprintf("    %-*s  %-*s  %-*s  %*s  %s", wordW, "WORD", heardW, "HEARD AS", noteW, "NOTE", dictUsesW, "USES", "ADDED")
	b.WriteString(paint(head, overlay0) + "\n")

	// Keep the cursor's row on screen: the rest of the screen takes 9 lines.
	visible := len(rows)
	if m.height > 0 {
		visible = max(3, m.height-9)
	}
	top := max(0, m.cursor-visible+1)
	if top > 0 {
		b.WriteString(paint(fmt.Sprintf("    ↑ %d more", top), overlay0) + "\n")
	}
	for i := top; i < len(rows) && i < top+visible; i++ {
		r := rows[i]
		pointer, color := "  ", text
		if r.Learned {
			color = subtext0
		}
		if i == m.cursor {
			pointer, color = paint("▸ ", mauve), mauve
		}
		added := "by you"
		if r.Learned {
			added = "learned"
		}
		line := fmt.Sprintf("%-*s  %-*s  %-*s  %*d  %s",
			wordW, r.Term, heardW, cut(deref(r.Heard), heardW), noteW, cut(deref(r.Hint), noteW), dictUsesW, r.Uses, added)
		b.WriteString("  " + pointer + paint(line, color) + "\n")
	}
	if rest := len(rows) - top - visible; rest > 0 {
		b.WriteString(paint(fmt.Sprintf("    ↓ %d more", rest), overlay0) + "\n")
	}
	return b.String()
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
