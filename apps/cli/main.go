// Command mockingbird is the command users type. The dictation engine is the
// TypeScript CLI in apps/daemon; this binary hands every command to it, and
// plays the launch animation while `mockingbird start` runs.
package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
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
	cwd, _ := os.Getwd()
	root := findRoot(os.Getenv("MOCKINGBIRD_ROOT"), filepath.Dir(exe), cwd)
	if root == "" {
		return fail(errors.New("can't find the engine; set MOCKINGBIRD_ROOT to the mockingbird checkout"))
	}
	bun, err := exec.LookPath("bun")
	if err != nil {
		return fail(errors.New("bun isn't on the PATH; install it with `brew install bun`"))
	}
	argv := append([]string{bun, filepath.Join(root, engineCLI)}, args...)
	if len(args) == 1 && args[0] == "start" && canAnimate() {
		return startWithSplash(argv)
	}
	// Replace this process, so the engine gets the terminal, signals and exit code.
	return fail(syscall.Exec(bun, argv, os.Environ()))
}

// version is what `go build` stamped in: the module version and, built from
// a git checkout, the commit.
func version() string {
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

// findRoot returns the first directory, from each start upwards, that holds
// the engine. A set MOCKINGBIRD_ROOT must be the root itself; its parents
// aren't searched.
func findRoot(env string, starts ...string) string {
	if env != "" {
		if isFile(filepath.Join(env, engineCLI)) {
			return env
		}
		return ""
	}
	for _, dir := range starts {
		for dir != "" {
			if isFile(filepath.Join(dir, engineCLI)) {
				return dir
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return ""
}

func isFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// canAnimate is false when output goes to a pipe or log, or the terminal is
// too small for the art; `start` then runs exactly as the engine prints it.
func canAnimate() bool {
	fd := os.Stdout.Fd()
	if !term.IsTerminal(fd) || !term.IsTerminal(os.Stdin.Fd()) || os.Getenv("TERM") == "dumb" {
		return false
	}
	cols, rows, err := term.GetSize(fd)
	return err == nil && cols >= minCols && rows >= minRows
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
	return cmd.ProcessState.ExitCode()
}
