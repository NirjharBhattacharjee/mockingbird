package main

import (
	"context"
	"encoding/json"
	"os/exec"
	"slices"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
)

// `mockingbird setup`: the first run, one step at a time, each checked
// before moving on (#54). Start the agent, switch on each permission it
// reports missing, offer to free Fn, then a test dictation. The engine does
// every step; this only draws them and waits for the user.

// The three permissions, in the order the agent reports them, with why
// mockingbird needs each.
var permissions = []struct{ name, why string }{
	{"Input Monitoring", "so it hears the Fn key"},
	{"Accessibility", "so it can type into other apps"},
	{"Microphone", "so it can hear you"},
}

type stage int

const (
	checking stage = iota
	starting
	granting // a permission: System Settings is open, waiting for Enter
	freeingFn
	dictating
	finished
)

type (
	statusMsg    status
	engineMsg    struct{ out string }
	dictationMsg struct{ Outcome, Detail string }
)

type setupModel struct {
	engine    []string // bun and the engine's cli.ts
	st        status
	stage     stage
	perm      string // the permission being granted
	fnAsked   bool   // asked once; the answer doesn't mean Fn is free
	fnWas     string // what tapping Fn opened, until `fn` freed it in this run
	busy      string // what's running, shown in place of the key hints
	note      string // the last thing worth saying, under the steps
	dictation string // how the test dictation went, once it has
}

func newSetup(engine []string) setupModel {
	return setupModel{engine: engine, busy: "checking mockingbird…"}
}

// call runs one engine command and hands its output to f as a message.
func (m setupModel) call(f func(out []byte, err error) tea.Msg, args ...string) tea.Cmd {
	return callEngine(m.engine, f, args...)
}

// callEngine runs one engine command (engine is bun and the engine's cli.ts)
// and hands its output to f as a message.
func callEngine(engine []string, f func(out []byte, err error) tea.Msg, args ...string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		out, err := exec.CommandContext(ctx, engine[0], append(engine[1:], args...)...).CombinedOutput()
		return f(out, err)
	}
}

func (m setupModel) checkStatus() tea.Cmd {
	return m.call(func(out []byte, err error) tea.Msg {
		var st status
		if err == nil {
			err = json.Unmarshal(out, &st)
		}
		if err != nil {
			st.Agent = "unknown"
		}
		return statusMsg(st)
	}, "status", "--json")
}

func (m setupModel) run(args ...string) tea.Cmd {
	return m.call(func(out []byte, _ error) tea.Msg { return engineMsg{strings.TrimSpace(string(out))} }, args...)
}

func (m setupModel) Init() tea.Cmd { return m.checkStatus() }

// next picks the first step that isn't done yet, from the latest status.
func (m setupModel) next() (setupModel, tea.Cmd) {
	m.busy = ""
	switch {
	case m.st.Agent != "running" && m.stage == starting:
		// Started once and still not running: say so rather than loop.
		m.note = "mockingbird didn't start (" + m.st.Agent + "). `mockingbird status` and " +
			"~/.mockingbird/logs/agent.log say why. Press Enter to try again."
		return m, nil
	case m.st.Agent != "running":
		m.stage, m.busy = starting, "starting mockingbird…"
		return m, tea.Sequence(m.run("start"), m.checkStatus())
	case m.st.Missing == nil:
		// Running, but its checks aren't in the log yet: it probes the
		// microphone for a moment first.
		m.busy = "waiting for mockingbird's checks…"
		return m, tea.Tick(time.Second, func(time.Time) tea.Msg { return m.checkStatus()() })
	case len(m.st.Missing) > 0:
		m.stage, m.perm = granting, m.st.Missing[0]
		return m, m.run("setup", "open", m.perm)
	case m.st.FnAction != nil && !m.fnAsked:
		m.stage = freeingFn
		return m, nil
	case m.dictation == "":
		m.stage, m.busy = dictating, "waiting for a dictation…"
		return m, m.call(func(out []byte, _ error) tea.Msg {
			var d dictationMsg
			if json.Unmarshal(out, &d) != nil {
				d.Outcome = "timeout"
			}
			return d
		}, "setup", "await-dictation")
	default:
		m.stage = finished
		return m, nil
	}
}

func (m setupModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case statusMsg:
		prev := m.perm
		m.st = status(msg)
		if m.stage == granting && slices.Contains(m.st.Missing, prev) {
			m.busy = ""
			m.note = prev + " still shows as off. Check the switch is on for \"mockingbird\" " +
				"(or \"bun\"), not another app, then press Enter again."
			if prev == "Microphone" {
				m.note += " If it's on already, the microphone may be silent: check " +
					"System Settings → Sound → Input."
			}
			return m, nil
		}
		if m.stage == freeingFn {
			// Keep what `fn` said (it applies after a log out), and say so if
			// the setting didn't change.
			if m.st.FnAction != nil {
				m.note = "Fn didn't change: " + m.note
				m.fnWas = ""
			} else {
				// The Fn step and the last line say to log out instead.
				m.note = ""
			}
			return m.next()
		}
		m.note = ""
		return m.next()
	case engineMsg:
		if m.stage == freeingFn {
			// All of it: the line that matters, log out of the Mac, isn't the last.
			m.note = strings.Join(strings.Fields(msg.out), " ")
		}
		return m, nil
	case dictationMsg:
		m.busy = ""
		switch msg.Outcome {
		case "typed":
			m.dictation = "typed " + msg.Detail
			return m.next()
		case "no-speech":
			m.note = "mockingbird heard nothing. Hold Fn the whole time you speak, and check " +
				"System Settings → Sound → Input picks the right microphone."
		case "not-typed":
			m.note = "mockingbird heard you but couldn't type it: " + msg.Detail + "."
		default:
			m.note = "No dictation in two minutes. If holding Fn makes no sound, see `mockingbird status`."
		}
		return m, nil
	case tea.KeyPressMsg:
		return m.key(msg.String())
	}
	return m, nil
}

func (m setupModel) key(k string) (tea.Model, tea.Cmd) {
	if k == "q" || k == "ctrl+c" || (k == "enter" && m.stage == finished) {
		return m, tea.Quit
	}
	if m.busy != "" {
		return m, nil
	}
	switch {
	case m.stage == starting && k == "enter":
		m.stage, m.note = checking, ""
		return m.next()
	case m.stage == granting && k == "enter":
		// macOS reads permissions when a program starts, so restart to check.
		m.busy = "restarting mockingbird to check…"
		return m, tea.Sequence(m.run("restart"), m.checkStatus())
	case m.stage == freeingFn && (k == "y" || k == "enter" || k == "n"):
		m.fnAsked = true
		if k == "n" {
			return m.next()
		}
		// The setting reads as free at once, but macOS keeps the old action
		// until a log out, so remember it to say so.
		m.fnWas = *m.st.FnAction
		m.busy = "freeing Fn…"
		return m, tea.Sequence(m.run("fn"), m.checkStatus())
	case m.stage == dictating && k == "enter":
		m.note = ""
		return m.next()
	case m.stage == dictating && k == "s":
		m.dictation = "skipped"
		return m.next()
	}
	return m, nil
}

func (m setupModel) View() tea.View { return tea.NewView(m.render()) }

// step draws one checklist line: ✓ done, ▸ current, – skipped, · still to
// come. The symbol carries the state, so it reads without color
// (docs/TUI.md §8). A long label wraps, indented under its text.
func step(state, text string) string {
	symbol, color := "·", overlay0
	switch state {
	case "done":
		symbol, color = "✓", green
	case "now":
		symbol, color = "▸", mauve
	case "skipped":
		symbol, color = "–", yellow
	}
	return "  " + paint(strings.TrimPrefix(wrap(symbol+" "+text, setupCols-4, "    "), "    "), color) + "\n"
}

func (m setupModel) render() string {
	var b strings.Builder
	b.WriteString("\n  " + paint("mockingbird setup", mauve) + "\n\n")
	state := func(done, now bool) string {
		if done {
			return "done"
		}
		if now {
			return "now"
		}
		return ""
	}
	running := m.st.Agent == "running"
	b.WriteString(step(state(running, m.stage <= starting), "mockingbird is running in the background"))
	for _, p := range permissions {
		granted := running && m.st.Missing != nil && !slices.Contains(m.st.Missing, p.name)
		now := m.stage == granting && m.perm == p.name
		b.WriteString(step(state(granted, now), p.name+", "+p.why))
		if now {
			b.WriteString(paint("      System Settings is open at Privacy & Security → "+p.name+".\n", text))
			b.WriteString(paint("      Switch on \"mockingbird\" (or \"bun\"), then press Enter.\n", text))
		}
	}
	// Done only once the status says Fn is free, never just for answering.
	fnState, fnLabel := state(running && m.st.Missing != nil && m.st.FnAction == nil, m.stage == freeingFn), "the Fn key is free for dictation"
	if m.fnWas != "" {
		fnLabel = "the Fn key is free for dictation once you log out"
	}
	if m.fnAsked && m.st.FnAction != nil {
		fnState, fnLabel = "skipped", "the Fn key: tapping still opens "+*m.st.FnAction+" (holding works)"
	}
	b.WriteString(step(fnState, fnLabel))
	if m.stage == freeingFn && m.st.FnAction != nil {
		b.WriteString(paint(wrap("Tapping Fn opens "+*m.st.FnAction+". Bind it to dictation only? Y/n",
			setupCols-6, "      ")+"\n", text))
		b.WriteString(paint("      (mockingbird fn --undo puts it back)\n", subtext0))
	}
	dictLabel := "a test dictation"
	if m.dictation != "" {
		dictLabel += ": " + m.dictation
	}
	b.WriteString(step(state(m.dictation != "", m.stage == dictating), dictLabel))
	if m.stage == dictating {
		b.WriteString(paint("      Click into any text box, hold Fn, say \"hello mockingbird\", and let go.\n", text))
	}
	if m.note != "" {
		b.WriteString("\n" + paint(wrap("! "+m.note, setupCols-4, "  "), yellow) + "\n")
	}
	b.WriteString("\n  ")
	switch {
	case m.stage == finished && m.fnWas != "":
		// Last, so it can't be scrolled past: until the log out, a tap or a
		// double tap still opens the old action (#31).
		msg := "One more step: log out of your Mac and back in. Until then, tapping Fn " +
			"still opens " + m.fnWas + "; holding Fn to dictate works now."
		b.WriteString(paint(strings.TrimPrefix(wrap(msg, setupCols-4, "  "), "  "), yellow) +
			"\n  " + paint("enter or q to close", overlay0))
	case m.stage == finished:
		done := "All set. Hold Fn anywhere to dictate, or double-tap it for hands-free."
		if m.st.FnAction != nil {
			done = "All set. Hold Fn anywhere to dictate."
		}
		b.WriteString(paint(done, green) +
			"\n  " + paint("enter or q to close", overlay0))
	case m.busy != "":
		b.WriteString(paint(m.busy, sky))
	case m.stage == freeingFn:
		b.WriteString(paint("enter yes · n no · q quit", overlay0))
	case m.stage == dictating:
		b.WriteString(paint("enter try again · s skip · q quit", overlay0))
	default:
		b.WriteString(paint("enter check again · q quit", overlay0))
	}
	return b.String() + "\n"
}
