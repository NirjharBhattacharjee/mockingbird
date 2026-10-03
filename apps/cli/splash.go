package main

import (
	"fmt"
	"math"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
)

// The launch animation from the website: a pixel bird and wordmark that pop
// in, twinkling background pixels, a letter that glitches now and then, a
// burst from the beak, and a voice-level skyline along the bottom. Pixels are
// half blocks, two to a terminal cell, so they come out roughly square.

const (
	fps     = 15
	popIn   = 0.7 // seconds for the art to pop in
	minShow = 1.6 // seconds the animation runs even if the engine is faster
	minCols = 60  // the wordmark is 58 pixels wide
	minRows = 12  // the wordmark, text and skyline; the bird needs fullRows
)

type rgb struct{ r, g, b uint8 }

// none is an empty pixel: the terminal's own background shows through.
var none rgb

func mix(a, b rgb, k float64) rgb {
	k = math.Max(0, math.Min(1, k))
	l := func(x, y uint8) uint8 { return uint8(float64(x) + (float64(y)-float64(x))*k + 0.5) }
	return rgb{l(a.r, b.r), l(a.g, b.g), l(a.b, b.b)}
}

// Catppuccin Mocha (docs/TUI.md §3), checked against catppuccin/palette.
var (
	mauve    = rgb{0xcb, 0xa6, 0xf7}
	yellow   = rgb{0xf9, 0xe2, 0xaf}
	green    = rgb{0xa6, 0xe3, 0xa1}
	teal     = rgb{0x94, 0xe2, 0xd5}
	sky      = rgb{0x89, 0xdc, 0xeb}
	blue     = rgb{0x89, 0xb4, 0xfa}
	lavender = rgb{0xb4, 0xbe, 0xfe}
	text     = rgb{0xcd, 0xd6, 0xf4}
	subtext0 = rgb{0xa6, 0xad, 0xc8}
	overlay0 = rgb{0x6c, 0x70, 0x86}
	surface2 = rgb{0x58, 0x5b, 0x70}
	surface1 = rgb{0x45, 0x47, 0x5a}
	surface0 = rgb{0x31, 0x32, 0x44}
	crust    = rgb{0x11, 0x11, 0x1b}
)

var birdColors = map[rune]rgb{'m': mauve, 't': teal, 's': sky, 'l': lavender, 'b': blue, 'w': text}

var bird = []string{
	"m...............................",
	".m..........m...................",
	".mm.........mm..................",
	"..mm.........mm.................",
	"t.mmt........mmt................",
	".tmmtt........mtt...............",
	"..ttttt.......mttt.......ss.....",
	"...ttttt.......tttt....sssss....",
	"....tttttt.....ttttt..ssssssss..",
	".....ttttttt...tttttsssswssssssss",
	"......tttttttttttttttssssss.....",
	"........ttttttttttttsssss.......",
	".........ttttttttttttss.........",
	"..........ttttttttttt...........",
	"..........llttttttt.t...........",
	".........lllltttt...tt..........",
	"........lllll...................",
	".......lllll....................",
	"......lllll.....................",
	".....bbbb.......................",
	"....bbbb........................",
	"...bbb..........................",
	"..bbb...........................",
	".bb.............................",
}

// beak is where the burst leaves the bird, relative to its top left.
var beak = [2]int{33, 9}

// Nine rows: two for ascenders, five x-height, two for g's descender.
var glyphs = map[rune][]string{
	'm': {".......", ".......", "######.", "#..#..#", "#..#..#", "#..#..#", "#..#..#", ".......", "......."},
	'o': {".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###.", ".....", "....."},
	'c': {".....", ".....", ".####", "#....", "#....", "#....", ".####", ".....", "....."},
	'k': {"#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#.", ".....", "....."},
	'i': {"#", ".", "#", "#", "#", "#", "#", ".", "."},
	'n': {".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#", ".....", "....."},
	'g': {".....", ".....", ".####", "#...#", "#...#", "#...#", ".####", "....#", "####."},
	'b': {"#....", "#....", "####.", "#...#", "#...#", "#...#", "####.", ".....", "....."},
	'r': {"....", "....", "#.##", "##..", "#...", "#...", "#...", "....", "...."},
	'd': {"....#", "....#", ".####", "#...#", "#...#", "#...#", ".####", ".....", "....."},
}

const wordH = 9

// word is the wordmark as rows of '#' and '.', with each letter's x and width.
var word, letters = wordmark("mockingbird")

func wordmark(s string) ([]string, [][2]int) {
	rows := make([]string, wordH)
	var boxes [][2]int
	x := 0
	for i, ch := range s {
		g := glyphs[ch]
		if i > 0 {
			for y := range rows {
				rows[y] += "."
			}
			x++
		}
		for y := range rows {
			rows[y] += g[y]
		}
		boxes = append(boxes, [2]int{x, len(g[0])})
		x += len(g[0])
	}
	return rows, boxes
}

// wordColor is the website's gradient: pale at the top, sky through the
// middle, a darker band at the baseline and below.
func wordColor(y int) rgb {
	k := float64(y) / (wordH - 1)
	if k < 0.6 {
		return mix(mix(sky, text, 0.6), sky, k/0.6)
	}
	return mix(sky, mix(sky, crust, 0.55), (k-0.6)/0.4)
}

// Layout, in pixels (two per terminal row).
const (
	birdGap  = 2
	skylineH = 4
	textRows = 4 // tagline, subtitle, a blank, status
)

// fullRows is the terminal height that fits the bird too, plus a spare row.
var fullRows = (len(bird)+birdGap+wordH+1+skylineH)/2 + textRows + 1

// hash gives stable per-pixel randomness, so nothing needs storing per frame.
func hash(vals ...int) uint32 {
	h := uint32(2166136261)
	for _, v := range vals {
		h ^= uint32(v)
		h *= 16777619
	}
	h ^= h >> 16
	h *= 0x7feb352d
	h ^= h >> 15
	return h
}

func frac(h uint32) float64 { return float64(h%1000) / 1000 }

type canvas struct {
	w, h int
	px   []rgb
}

func newCanvas(w, h int) *canvas { return &canvas{w, h, make([]rgb, w*h)} }

func (c *canvas) set(x, y int, col rgb) {
	if x >= 0 && y >= 0 && x < c.w && y < c.h {
		c.px[y*c.w+x] = col
	}
}

func (c *canvas) at(x, y int) rgb {
	if y >= c.h {
		return none
	}
	return c.px[y*c.w+x]
}

// fg and bg are 24-bit color escapes; Bubble Tea's renderer downsamples them
// for terminals with fewer colors, and drops them under NO_COLOR.
func fg(c rgb) string { return fmt.Sprintf("\x1b[38;2;%d;%d;%dm", c.r, c.g, c.b) }
func bg(c rgb) string { return fmt.Sprintf("\x1b[48;2;%d;%d;%dm", c.r, c.g, c.b) }

const reset = "\x1b[0m"

func paint(s string, c rgb) string { return fg(c) + s + reset }

// render packs two pixel rows into each line of half blocks.
func (c *canvas) render() string {
	var b strings.Builder
	for y := 0; y < c.h; y += 2 {
		if y > 0 {
			b.WriteByte('\n')
		}
		for x := 0; x < c.w; x++ {
			top, bot := c.at(x, y), c.at(x, y+1)
			switch {
			case top == none && bot == none:
				b.WriteByte(' ')
			case bot == none:
				b.WriteString(paint("▀", top))
			case top == none:
				b.WriteString(paint("▄", bot))
			default:
				b.WriteString(fg(top) + bg(bot) + "▀" + reset)
			}
		}
	}
	return b.String()
}

// stars twinkles a sparse scatter of dim pixels.
func (c *canvas) stars(t float64, salt int) {
	for y := 0; y < c.h; y++ {
		for x := 0; x < c.w; x++ {
			if h := hash(x, y, salt); h%70 == 0 {
				glow := 0.5 + 0.5*math.Sin(t*1.8+frac(h>>8)*2*math.Pi)
				c.set(x, y, mix(surface0, overlay0, glow))
			}
		}
	}
}

// sprite draws rows at (ox, oy), popping each pixel in at its own moment
// with a bright flash.
func (c *canvas) sprite(rows []string, ox, oy int, t float64, color func(x, y int, r rune) rgb) {
	for y, row := range rows {
		for x, r := range row {
			if r == '.' {
				continue
			}
			delay := frac(hash(x, y, ox)) * popIn
			switch {
			case t < delay:
			case t-delay < 0.12:
				c.set(ox+x, oy+y, text)
			default:
				c.set(ox+x, oy+y, color(x, y, r))
			}
		}
	}
}

type (
	lineMsg string
	doneMsg struct{}
	tickMsg time.Time
)

type splash struct {
	start, now time.Time
	cols, rows int
	status     string
	engineDone bool
	finished   bool
}

func newSplash(now time.Time) splash {
	return splash{start: now, now: now, status: "starting mockingbird…"}
}

func tick() tea.Cmd {
	return tea.Tick(time.Second/fps, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func (m splash) Init() tea.Cmd { return tick() }

func (m splash) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyPressMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc", "enter":
			m.finished = true
			return m, tea.Quit
		}
	case tea.WindowSizeMsg:
		m.cols, m.rows = msg.Width, msg.Height
	case lineMsg:
		if s := strings.TrimSpace(string(msg)); s != "" {
			m.status = s
		}
	case doneMsg:
		m.engineDone = true
	case tickMsg:
		m.now = time.Time(msg)
		if m.engineDone && m.elapsed() >= minShow {
			m.finished = true
			return m, tea.Quit
		}
		return m, tick()
	}
	return m, nil
}

func (m splash) elapsed() float64 { return m.now.Sub(m.start).Seconds() }

func (m splash) View() tea.View { return tea.NewView(m.render()) }

func (m splash) render() string {
	// Nothing until the size is known, or while it's resized too small.
	if m.cols < minCols || m.rows < minRows {
		return ""
	}
	t := m.elapsed()
	if m.finished {
		// What stays in the scrollback: the still wordmark and the tagline.
		art := newCanvas(m.cols, wordH+1)
		art.sprite(word, (m.cols-len(word[0]))/2, 0, math.Inf(1), func(_, y int, _ rune) rgb { return wordColor(y) })
		return art.render() + "\n" + m.center("Local voice dictation for macOS", yellow) + "\n"
	}

	showBird := m.rows >= fullRows
	top := 0
	if showBird {
		top = len(bird) + birdGap
	}
	art := newCanvas(m.cols, top+wordH+1)
	art.stars(t, 1)
	if showBird {
		bx := (m.cols - len(bird[9])) / 2
		art.sprite(bird, bx, 0, t, func(_, _ int, r rune) rgb { return birdColors[r] })
		art.burst(bx+beak[0], beak[1], t)
	}
	wx := (m.cols - len(word[0])) / 2
	art.sprite(word, wx, top, t, func(_, y int, _ rune) rgb { return wordColor(y) })
	art.glitch(wx, top, t)

	ground := newCanvas(m.cols, skylineH)
	ground.stars(t, 2)
	ground.skyline(t)

	return strings.Join([]string{
		art.render(),
		m.center("Local voice dictation for macOS", yellow),
		m.center("Hold Fn, speak, let go. Clean text lands at your cursor.", subtext0),
		"",
		m.statusLine(t),
		ground.render(),
	}, "\n")
}

// glitch scrambles one letter of the wordmark at (ox, oy) for a quarter
// second, every couple of seconds.
func (c *canvas) glitch(ox, oy int, t float64) {
	const period = 1.9
	if t < popIn+0.3 || math.Mod(t-popIn, period) > 0.25 {
		return
	}
	box := letters[hash(int((t-popIn)/period), 3)%uint32(len(letters))]
	frame := int(t * fps)
	for y := 0; y < wordH; y++ {
		for x := box[0]; x < box[0]+box[1]; x++ {
			col := none
			if hash(x, y, frame)%3 == 0 {
				col = wordColor(y)
			}
			c.set(ox+x, oy+y, col)
		}
	}
}

// burst sprays a short-lived plume of bright pixels from the beak.
func (c *canvas) burst(x0, y0 int, t float64) {
	const period, life = 2.6, 1.0
	if t < popIn {
		return
	}
	n := int((t - popIn) / period)
	age := math.Mod(t-popIn, period)
	if age > life {
		return
	}
	for i := 0; i < 16; i++ {
		h := hash(i, n, 9)
		angle := -0.9 + frac(h)*1.0
		speed := 12 + frac(h>>10)*16
		col := mix(text, sky, age/0.5)
		if age > 0.5 {
			col = mix(sky, surface1, (age-0.5)/0.5)
		}
		c.set(x0+int(math.Cos(angle)*speed*age), y0+int(math.Sin(angle)*speed*age), col)
	}
}

// skyline is a voice-level meter: rolling bars with the odd bright tip.
func (c *canvas) skyline(t float64) {
	frame := int(t * fps)
	for x := 0; x < c.w; x++ {
		fx := float64(x)
		level := (0.5 + 0.5*math.Sin(fx*0.45+t*4)) * (0.55 + 0.45*math.Sin(fx*0.11-t*1.7))
		h := int(level * (float64(c.h) + 0.99))
		for i := 0; i < h; i++ {
			col := surface1
			if i == h-1 {
				col = surface2
				if hash(x, frame/3, 5)%29 == 0 {
					col = text
				}
			}
			c.set(x, c.h-1-i, col)
		}
	}
}

func (m splash) center(s string, col rgb) string {
	pad := (m.cols - len([]rune(s))) / 2
	return strings.Repeat(" ", max(pad, 0)) + paint(s, col)
}

func (m splash) statusLine(t float64) string {
	mark, col := string([]rune("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")[int(t*fps)%10]), sky
	if m.engineDone {
		mark, col = "✓", green
	}
	s := []rune(m.status)
	if limit := m.cols - 4; len(s) > limit {
		s = append(s[:limit-1], '…')
	}
	pad := max((m.cols-len(s)-2)/2, 0)
	return strings.Repeat(" ", pad) +
		paint(mark, col) + " " + paint(string(s), subtext0)
}
