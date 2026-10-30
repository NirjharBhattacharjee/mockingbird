// Command mockingbird is the command users type. The dictation engine is the
// TypeScript CLI in apps/daemon; this binary hands every command to it, plays
// the launch animation while `mockingbird start` runs, and with no command
// opens a home screen listing them. `mockingbird setup` is a guided first run.
package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"strings"
	"syscall"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/term"
)

// engineCLI is the engine's command, relative to the repo root.
const engineCLI = "apps/daemon/src/cli.ts"

func main() { os.Exit(run(os.Args[1:])) }

func run(args []string) int {
	if len(args) == 1 && args[0] == "--version" {
		fmt.Println("mockingbird", version())
		return 0
	}
	exe, _ := os.Executable()
	exe, _ = filepath.EvalSymlinks(exe)
	root := findRoot(os.Getenv("MOCKINGBIRD_ROOT"), filepath.Dir(exe))
	if root == "" {
		return fail(errors.New("can't find the engine; set MOCKINGBIRD_ROOT to the mockingbird checkout"))
	}
	bun, err := exec.LookPath("bun")
	if err != nil {
		return fail(errors.New("bun isn't on the PATH; install it with `brew install bun`"))
	}
	argv := append([]string{bun, filepath.Join(root, engineCLI)}, args...)
	if len(args) == 0 && fits(homeCols, homeRows) {
		if info, err := loadHome(argv); err == nil {
			p, err := tea.NewProgram(newHome(info)).Run()
			if err != nil {
				return fail(err)
			}
			if chosen := p.(home).chosen; chosen != "" {
				// As if typed, so `start` still gets the animation.
				return run(strings.Fields(chosen))
			}
			return 0
		}
	}
	if len(args) == 1 && args[0] == "setup" && fits(setupCols, setupRows) {
		if _, err := tea.NewProgram(newSetup(argv[:2])).Run(); err != nil {
			return fail(err)
		}
		return 0
	}
	if len(args) == 1 && args[0] == "models" && fits(modelsCols, modelsRows) {
		if list, err := loadModels(argv[:2]); err == nil {
			if _, err := tea.NewProgram(newModels(argv[:2], list)).Run(); err != nil {
				return fail(err)
			}
			return 0
		}
	}
	if len(args) == 1 && args[0] == "dictionary" && fits(dictCols, dictRows) {
		if rows, err := loadDictionary(argv[:2]); err == nil {
			if _, err := tea.NewProgram(newDictionary(argv[:2], rows)).Run(); err != nil {
				return fail(err)
			}
			return 0
		}
	}
	if len(args) == 1 && args[0] == "calibrate" && fits(calibCols, calibRows) {
		if script, err := loadScript(argv[:2]); err == nil {
			if _, err := tea.NewProgram(newCalibrate(argv[:2], script)).Run(); err != nil {
				return fail(err)
			}
			return 0
		}
	}
	if len(args) == 2 && args[0] == "calibrate" && args[1] == "names" && fits(calibCols, calibRows) {
		if _, err := tea.NewProgram(newNames(argv[:2])).Run(); err != nil {
			return fail(err)
		}
		return 0
	}
	if len(args) == 1 && args[0] == "start" && canAnimate() {
		return startWithSplash(argv)
	}
	// Replace this process, so the engine gets the terminal, signals and exit code.
	return fail(syscall.Exec(bun, argv, os.Environ()))
}

// release is the tag, which release.yml builds in with
// -ldflags "-X main.release=v1.2.3".
var release string

// version is the release tag or, for any other build, what `go build`
// stamped in: the module version and the commit.
func version() string {
	if release != "" {
		return release
	}
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "unknown"
	}
	v := info.Main.Version
	for _, s := range info.Settings {
		if s.Key == "vcs.revision" && len(s.Value) >= 7 {
			v += " " + s.Value[:7]
		}
	}
	return v
}

func fail(err error) int {
	fmt.Fprintln(os.Stderr, "mockingbird:", err)
	return 1
}

// findRoot returns the directory holding the engine: MOCKINGBIRD_ROOT itself,
// or the nearest one above the binary. Never the working directory, so
// running from inside someone else's checkout can't run their code.
func findRoot(env, dir string) string {
	if env != "" {
		if isFile(filepath.Join(env, engineCLI)) {
			return env
		}
		return ""
	}
	for {
		if isFile(filepath.Join(dir, engineCLI)) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func isFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// canAnimate is false when output goes to a pipe or log, or the terminal is
// too small for the art; `start` then runs exactly as the engine prints it.
func canAnimate() bool { return fits(minCols, minRows) }

// The setup checklist's longest instruction line, and its steps, hints and
// notes. Smaller, the engine prints the same steps as text.
const (
	setupCols = 80
	setupRows = 20
)

// The home screen: a row per command (nine), up to seven for the status and
// its notes wrapped at 40 columns, four for gaps and key hints, and room for
// a name and some of its summary.
const (
	homeCols = 40
	homeRows = 20
)

// The model picker: the title, the tabs, a row per model (seven Whisper files
// at most so far), a note and the key hints. 52 columns fit a row's size and
// both marks with a 16-column name, and the key hints. Smaller, the engine
// prints the plain list.
const (
	modelsCols = 52
	modelsRows = 16
)

// The dictionary table: 64 columns fit the key hints and a short word, heard
// and note; 14 rows leave room for a few entries under the title and header.
// Smaller, the engine prints the plain list.
const (
	dictCols = 64
	dictRows = 14
)

// The calibration screen: the title, the line under it, the longest sentence
// and what was heard, each wrapped to two or three lines at 64 columns, the
// score and the key hints. Smaller, the engine prints its usage and past runs.
const (
	calibCols = 64
	calibRows = 16
)

// fits is whether stdin and stdout are a terminal of at least cols×rows.
// Otherwise output is piped or logged, and gets the engine's plain text.
func fits(cols, rows int) bool {
	fd := os.Stdout.Fd()
	if !term.IsTerminal(fd) || !term.IsTerminal(os.Stdin.Fd()) || os.Getenv("TERM") == "dumb" {
		return false
	}
	c, r, err := term.GetSize(fd)
	return err == nil && c >= cols && r >= rows
}

// startWithSplash runs the engine's `start` under the animation, showing its
// latest line as status, then prints its full output once the animation ends.
func startWithSplash(argv []string) int {
	r, w, err := os.Pipe()
	if err != nil {
		return fail(err)
	}
	cmd := exec.Command(argv[0], argv[1:]...)
	cmd.Stdout, cmd.Stderr = w, w
	if err := cmd.Start(); err != nil {
		return fail(err)
	}
	_ = w.Close() // the engine has its own copy; closing ours lets EOF arrive

	// Bubble Tea quits on SIGTERM as if the user skipped the animation, so
	// pass signals on and let the engine decide, as it would without us.
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	defer signal.Stop(sigs)
	go func() {
		for s := range sigs {
			_ = cmd.Process.Signal(s)
		}
	}()

	p := tea.NewProgram(newSplash(time.Now()))
	var lines []string // read only after done is closed
	done := make(chan struct{})
	go func() {
		defer close(done)
		sc := bufio.NewScanner(r)
		for sc.Scan() {
			lines = append(lines, sc.Text())
			p.Send(lineMsg(sc.Text()))
		}
		_ = cmd.Wait() // the exit code is read from ProcessState below
		p.Send(doneMsg{})
	}()
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "mockingbird: animation:", err)
	}
	// Quitting the animation early skips it; the engine still finishes.
	<-done
	for _, l := range lines {
		fmt.Fprintln(os.Stderr, l)
	}
	if ws, ok := cmd.ProcessState.Sys().(syscall.WaitStatus); ok && ws.Signaled() {
		return 128 + int(ws.Signal())
	}
	return cmd.ProcessState.ExitCode()
}
