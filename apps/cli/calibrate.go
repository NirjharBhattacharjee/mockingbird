package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"slices"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
)

// `mockingbird calibrate` in a terminal: the script, one sentence at a time.
// Enter starts a take and Enter again stops it. The engine's `calibrate
// stop` has the agent hear it, save it and score it; this shows the sentence
// with the words the model missed, what it heard instead, and at the end how
// many of the user's words it got right.
//
// Then, or straight away with `mockingbird calibrate names`, the names page:
// the user types a name or term of their own and says it. The engine's
// `calibrate term` adds it to the dictionary, with what the model heard when
// dictation still wouldn't write it from that (#108).

type diffWord struct {
	Word string `json:"word"`
	OK   bool   `json:"ok"`
}

type takeResult struct {
	Heard      string     `json:"heard"`
	Model      string     `json:"model"`
	Edits      int        `json:"edits"`
	Words      int        `json:"words"`
	Reference  []diffWord `json:"reference"`
	Hypothesis []diffWord `json:"hypothesis"`
}

type termResult struct {
	Term  string `json:"term"`
	Heard string `json:"heard"`
	Right bool   `json:"right"`
	Saved string `json:"saved"`
}

type calibState int

const (
	calibReading   calibState = iota // the sentence is up (or a name is being typed), waiting for Enter
	calibWaiting                     // a start or cancel is on its way to the agent
	calibRecording                   // a take is running
	calibHearing                     // the agent is transcribing it
	calibScored                      // what it heard is up
	calibDone                        // the score for the run
)

type (
	takeStartedMsg struct {
		out string
		ok  bool
	}
	takeHeardMsg struct {
		result takeResult
		out    string
		ok     bool
	}
	termHeardMsg struct {
		result termResult
		out    string
		ok     bool
	}
	takeCancelledMsg struct{}
)

type calibModel struct {
	engine  []string
	script  []string
	run     int64 // when this run started; a sentence read again replaces its take
	at      int
	state   calibState
	result  takeResult
	results map[int]takeResult // this run's takes, by sentence
	note    string             // what went wrong, in red
	names   bool               // on the names page
	input   string             // the name being typed
	term    termResult         // the name just read
	added   []termResult       // what the names page saved, a name said again once
	width   int
	closed  bool
	// quitting is a quit pressed while waiting: it happens once the agent
	// answers, so a take that did start is cancelled rather than left running.
	quitting bool
}

// loadScript asks the engine for the sentences. An engine without
// `calibrate script --json`, or one that takes over 5s, fails here, and the
// caller falls back to the engine's own `calibrate`.
func loadScript(engine []string) ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, engine[0], append(engine[1:], "calibrate", "script", "--json")...).Output()
	var script struct {
		Sentences []string `json:"sentences"`
	}
	if err == nil {
		err = json.Unmarshal(out, &script)
	}
	if err == nil && len(script.Sentences) == 0 {
		err = fmt.Errorf("the script is empty")
	}
	return script.Sentences, err
}

func newCalibrate(engine []string, script []string) calibModel {
	return calibModel{engine: engine, script: script, run: time.Now().UnixMilli(), results: map[int]takeResult{}}
}

func newNames(engine []string) calibModel {
	m := newCalibrate(engine, nil)
	m.names = true
	return m
}

func (m calibModel) Init() tea.Cmd { return nil }

func (m calibModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
	case takeStartedMsg:
		switch {
		case m.quitting && msg.ok:
			m.closed = true
			return m, tea.Sequence(m.cancel(), tea.Quit)
		case m.quitting:
			return m.quit()
		case msg.ok:
			m.state = calibRecording
		default:
			m.state, m.note = calibReading, firstLine(msg.out)
		}
	case takeCancelledMsg:
		if m.quitting {
			return m.quit()
		}
		m.state = calibReading
	case takeHeardMsg:
		if !msg.ok {
			m.state, m.note = calibReading, firstLine(msg.out)
			return m, nil
		}
		m.state, m.result = calibScored, msg.result
		m.results[m.at] = msg.result
	case termHeardMsg:
		if !msg.ok {
			m.state, m.note = calibReading, firstLine(msg.out)
			return m, nil
		}
		m.state, m.term = calibScored, msg.result
		m.added = slices.DeleteFunc(m.added, func(t termResult) bool { return strings.EqualFold(t.Term, msg.result.Term) })
		m.added = append(m.added, msg.result)
	case tea.KeyPressMsg:
		return m.key(msg.String(), msg.Text)
	}
	return m, nil
}

func (m calibModel) key(k, text string) (tea.Model, tea.Cmd) {
	quit := k == "q" || k == "esc" || k == "ctrl+c"
	switch m.state {
	case calibWaiting:
		if quit {
			m.quitting = true
		}
	case calibReading:
		if m.names {
			return m.typeName(k, text)
		}
		switch {
		case quit:
			return m.quit()
		case k == "enter":
			return m.start()
		case k == "s":
			return m.next()
		}
	case calibRecording:
		switch {
		case k == "enter" && m.names:
			m.state = calibHearing
			return m, callEngine(m.engine, func(out []byte, err error) tea.Msg {
				var r termResult
				if err == nil {
					err = json.Unmarshal(out, &r)
				}
				return termHeardMsg{r, string(out), err == nil}
			}, "calibrate", "term", strings.TrimSpace(m.input))
		case k == "enter":
			m.state = calibHearing
			return m, callEngine(m.engine, func(out []byte, err error) tea.Msg {
				var r takeResult
				if err == nil {
					err = json.Unmarshal(out, &r)
				}
				return takeHeardMsg{r, string(out), err == nil}
			}, "calibrate", "stop", fmt.Sprint(m.run), fmt.Sprint(m.at))
		case k == "esc":
			m.state = calibWaiting
			return m, m.cancel()
		case quit:
			m.closed = true
			return m, tea.Sequence(m.cancel(), tea.Quit)
		}
	case calibHearing:
		if k == "ctrl+c" {
			return m.quit()
		}
	case calibScored:
		switch {
		case m.names && (k == "esc" || k == "q"):
			m.state = calibDone
		case quit:
			return m.quit()
		case k == "enter" && m.names:
			m.input, m.state = "", calibReading
		case k == "enter":
			return m.next()
		case k == "r":
			return m.start()
		}
	case calibDone:
		if k == "n" && !m.names {
			m.names, m.state = true, calibReading
			return m, nil
		}
		if quit || k == "enter" {
			// The score stays in the scrollback.
			return m, tea.Quit
		}
	}
	return m, nil
}

// typeName edits the name being typed; enter has it said aloud, esc ends the page.
func (m calibModel) typeName(k, text string) (tea.Model, tea.Cmd) {
	switch k {
	case "ctrl+c":
		return m.quit()
	case "esc":
		m.state = calibDone
	case "enter":
		if strings.TrimSpace(m.input) != "" {
			return m.start()
		}
	case "backspace":
		if r := []rune(m.input); len(r) > 0 {
			m.input = string(r[:len(r)-1])
		}
	default:
		m.input += text
	}
	return m, nil
}

func (m calibModel) start() (tea.Model, tea.Cmd) {
	m.note, m.state = "", calibWaiting
	return m, callEngine(m.engine, func(out []byte, err error) tea.Msg {
		return takeStartedMsg{string(out), err == nil}
	}, "calibrate", "start")
}

func (m calibModel) cancel() tea.Cmd {
	return callEngine(m.engine, func([]byte, error) tea.Msg { return takeCancelledMsg{} }, "calibrate", "cancel")
}

func (m calibModel) next() (tea.Model, tea.Cmd) {
	m.note = ""
	m.at++
	m.state = calibReading
	if m.at >= len(m.script) {
		m.state = calibDone
	}
	return m, nil
}

// quit erases the screen: takes are saved as they're scored, so nothing is lost.
func (m calibModel) quit() (tea.Model, tea.Cmd) {
	m.closed = true
	return m, tea.Quit
}

func (m calibModel) View() tea.View {
	if m.closed {
		return tea.NewView("")
	}
	return tea.NewView(m.render())
}

func (m calibModel) render() string {
	var b strings.Builder
	b.WriteString("\n  " + paint("mockingbird calibrate", mauve))
	if m.names && m.state != calibDone {
		b.WriteString(paint("   your names", overlay0))
	} else if m.state != calibDone {
		b.WriteString(paint(fmt.Sprintf("   sentence %d of %d", m.at+1, len(m.script)), overlay0))
	}
	b.WriteString("\n\n")
	width := m.width - 4
	if m.state == calibDone && m.names {
		return b.String() + m.namesAdded(width)
	}
	if m.state == calibDone {
		return b.String() + m.score(width)
	}
	if m.names {
		return b.String() + m.namePage(width)
	}

	if m.state == calibScored {
		b.WriteString("  " + paint("you read", overlay0) + "\n" + words(m.result.Reference, width, text) + "\n\n")
		b.WriteString("  " + paint("mockingbird heard", overlay0) + "\n")
		heard := m.result.Hypothesis
		if len(heard) == 0 {
			b.WriteString("  " + paint("(heard nothing)", red) + "\n")
		} else {
			b.WriteString(words(heard, width, subtext0) + "\n")
		}
		right := m.result.Words - m.result.Edits
		color := green
		if m.result.Edits > 0 {
			color = yellow
		}
		b.WriteString("\n  " + paint(fmt.Sprintf("%d of %d words right", max(0, right), m.result.Words), color) + "\n")
	} else {
		b.WriteString(paint(wrap("Read each sentence aloud, the way you'd normally talk.", width, "  "), subtext0) + "\n\n")
		b.WriteString(paint(wrap(m.script[m.at], width, "  "), text) + "\n")
	}

	if m.note != "" {
		b.WriteString("\n" + paint(wrap(m.note, width, "  "), red) + "\n")
	}
	b.WriteString("\n  ")
	switch m.state {
	case calibReading:
		b.WriteString(paint("enter start reading · s skip · q quit", overlay0))
	case calibRecording:
		b.WriteString(paint("● recording", red) + paint(" · enter when you're done · esc cancel", overlay0))
	case calibWaiting:
		b.WriteString(paint("waiting for mockingbird…", sky))
	case calibHearing:
		b.WriteString(paint("listening back…", sky))
	case calibScored:
		b.WriteString(paint("enter next · r read it again · q quit", overlay0))
	}
	return b.String() + "\n"
}

// score is the run's result: how many words the model got right.
func (m calibModel) score(width int) string {
	edits, total, model := 0, 0, ""
	for _, r := range m.results {
		edits += r.Edits
		total += r.Words
		model = r.Model
	}
	if total == 0 {
		return paint(wrap("No sentences read, so there's nothing to score.", width, "  "), yellow) + "\n\n  " +
			paint("enter or q to close", overlay0) + "\n"
	}
	// Rounded down, so one missed word never shows as 100%.
	pct := max(0, 100*(total-edits)/total)
	var b strings.Builder
	b.WriteString(paint(wrap(fmt.Sprintf("%s got %d%% of your words right.", model, pct), width, "  "), green) + "\n")
	b.WriteString(paint(wrap(fmt.Sprintf("%d words in %d sentence%s.", total, len(m.results), plural(len(m.results))), width, "  "), subtext0) + "\n\n")
	b.WriteString(paint(wrap("Your readings are kept in ~/.mockingbird/calibration. `mockingbird calibrate tune` compares your models on them and tunes speech detection to your voice; `mockingbird calibrate --forget` deletes them.", width, "  "), subtext0) + "\n\n  ")
	b.WriteString(paint("n add your names · enter or q to close", overlay0) + "\n")
	return b.String()
}

// namePage is a name being typed, said, or what was heard of it.
func (m calibModel) namePage(width int) string {
	var b strings.Builder
	switch m.state {
	case calibReading:
		b.WriteString(paint(wrap("Type a name or term you'll dictate (yours, a colleague's, a product), press enter, then say it.", width, "  "), subtext0) + "\n\n")
		b.WriteString("  " + paint("name: ", mauve) + m.input + paint("▏", mauve) + "\n")
	case calibScored:
		b.WriteString("  " + paint("you said", overlay0) + "\n  " + paint(m.term.Term, text) + "\n\n")
		b.WriteString("  " + paint("mockingbird heard", overlay0) + "\n  ")
		if m.term.Heard == "" {
			b.WriteString(paint("(heard nothing)", red))
		} else {
			b.WriteString(paint(m.term.Heard, subtext0))
		}
		b.WriteString("\n\n")
		switch {
		case m.term.Right:
			b.WriteString(paint(wrap("Dictation writes this right. Added to your dictionary: "+m.term.Saved, width, "  "), green))
		case strings.Contains(m.term.Saved, "=>"):
			b.WriteString(paint(wrap("Added with what the model heard, so dictation writes it right from now on: "+m.term.Saved, width, "  "), green))
		default:
			b.WriteString(paint(wrap("Added "+m.term.Saved+". What the model heard wasn't kept as its mishearing, so dictation may still misspell it. Press r to say it again.", width, "  "), yellow))
		}
		b.WriteString("\n")
	default:
		b.WriteString(paint(wrap("Say it the way you would in a sentence.", width, "  "), subtext0) + "\n\n")
		b.WriteString(paint(wrap(strings.TrimSpace(m.input), width, "  "), text) + "\n")
	}
	if m.note != "" {
		b.WriteString("\n" + paint(wrap(m.note, width, "  "), red) + "\n")
	}
	b.WriteString("\n  ")
	switch m.state {
	case calibReading:
		b.WriteString(paint("enter say it · esc done", overlay0))
	case calibRecording:
		b.WriteString(paint("● recording", red) + paint(" · enter when you're done · esc cancel", overlay0))
	case calibWaiting:
		b.WriteString(paint("waiting for mockingbird…", sky))
	case calibHearing:
		b.WriteString(paint("listening back…", sky))
	case calibScored:
		b.WriteString(paint("enter next name · r say it again · esc done", overlay0))
	}
	return b.String() + "\n"
}

// namesAdded is what the names page put in the dictionary.
func (m calibModel) namesAdded(width int) string {
	var b strings.Builder
	if len(m.added) == 0 {
		b.WriteString(paint(wrap("No names added.", width, "  "), subtext0) + "\n")
	} else {
		b.WriteString(paint(wrap(fmt.Sprintf("Added %d to your dictionary:", len(m.added)), width, "  "), green) + "\n")
		for _, t := range m.added {
			b.WriteString(paint(wrap(t.Saved, width, "    "), text) + "\n")
		}
		b.WriteString("\n" + paint(wrap("`mockingbird dictionary` lists and edits them.", width, "  "), subtext0) + "\n")
	}
	return b.String() + "\n  " + paint("enter or q to close", overlay0) + "\n"
}

// words wraps a diff's words to width, in color, with the ones that didn't
// match in red.
func words(ws []diffWord, width int, color rgb) string {
	var lines []string
	line, n := "", 0
	for _, w := range ws {
		size := len([]rune(w.Word))
		if width > 0 && n > 0 && n+1+size > width {
			lines = append(lines, "  "+line)
			line, n = "", 0
		}
		if n > 0 {
			line += " "
			n++
		}
		c := color
		if !w.OK {
			c = red
		}
		line += paint(w.Word, c)
		n += size
	}
	return strings.Join(append(lines, "  "+line), "\n")
}
