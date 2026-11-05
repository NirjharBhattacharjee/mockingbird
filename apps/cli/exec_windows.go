package main

import (
	"errors"
	"os"
	"os/exec"
	"os/signal"
)

// runEngine runs the engine as a child, since Windows can't replace a
// process, and exits with its code. Ctrl-C reaches the child through the
// console on its own, so this process only ignores it.
func runEngine(bun string, argv []string) int {
	signal.Ignore(os.Interrupt)
	cmd := exec.Command(bun, argv[1:]...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	err := cmd.Run()
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return exit.ExitCode()
	}
	if err != nil {
		return fail(err)
	}
	return 0
}
