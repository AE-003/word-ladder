# Word Ladder

A browser-based word ladder puzzle game. Change one letter at a time to turn the start word into the target word, submitting a real 4-letter word at every step.

## How to play

- Turn the **start** word into the **target** word, one step at a time.
- Each step must change **exactly one letter** and result in a real word.
- Letters that already match the target's letter in that position glow green.
- Stuck? Use a **Hint** — it costs a point off your final score but reveals the next best word.

## Modes

- **Daily** — everyone gets the same puzzle each day.
- **Random** — a fresh puzzle from the curated puzzle list.
- **Custom** — pick your own start/target words (must be real, connected 4-letter words).

## Running locally

This is a static, dependency-free site. Open `index.html` directly in a browser, or serve the folder with any static file server, e.g.:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Project structure

- `index.html` — page markup
- `style.css` — styling
- `words.js` — the valid word list
- `puzzles.js` — curated start/target/par puzzles for Daily and Random modes
- `game.js` — game logic (graph building, path finding, UI wiring, stats)
