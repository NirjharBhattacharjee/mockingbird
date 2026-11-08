//go:build !windows

package main

import (
	"os"
	"syscall"
)

// runEngine replaces this process with the engine, so it gets the terminal,
// signals and exit code.
func runEngine(bun string, argv []string) int {
	return fail(syscall.Exec(bun, argv, os.Environ()))
}
