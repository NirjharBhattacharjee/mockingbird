// Command mockingbird is the command users type. The engine is the
// TypeScript CLI in apps/daemon; this binary finds it and hands it every
// command.
package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
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
		return fail(errors.New("bun isn't on the PATH; run the install again, or install it from https://bun.sh"))
	}
	return runEngine(bun, append([]string{bun, filepath.Join(root, engineCLI)}, args...))
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
