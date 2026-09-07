# Browser regression tests

Static analysis kept telling me the load paths were fine. They were not: a build
loaded from a pin or from Save/Load was priced with the *previous* build's wildcard
card slots, overstating DPS by 60% on the test build. Nothing short of driving a
real browser found it, and three earlier "fixes" written from reading the source
turned out not to touch the reported bug at all.

So these are the tests that only a browser can run. They are deliberately NOT in
`npm test` or the deploy workflow — they need a running stack and a real Chrome, and
a browser download does not belong in the deploy path. Run them by hand when a load
path, the compare panel, or the editor's state handling changes.

## Running

Three terminals, or background the first two:

```sh
cd open-ps-calc-backend/backend && npm start          # :4000
cd open-ps-calc-frontend/frontend && npm run dev      # :5173
cd tools/e2e && npm install && node wildcard-carryover.mjs
```

Pass a URL to test somewhere else, production included:

```sh
node wildcard-carryover.mjs https://openpscalc.com/
```

`playwright-core` drives the Chrome already installed on the machine (`channel:
"chrome"`), so there is no browser to download.

## What each one covers

- **wildcard-carryover.mjs** — pins and saves a build with a slotted weapon and no
  wildcard mix, turns wildcard mix on, then loads the build back both ways. The
  loaded build must price at its own DPS, not the live build's. This is the
  regression that produced two separate player reports ("Load doesn't work",
  "loading pinned builds is not working"), because a wrong number looks like
  nothing happened.

- **pin-load-visible.mjs** — clicking Load on a pinned build must visibly take you to
  that build. State assertions all passed while this was broken: the build loaded, and
  then `onCalculate` pulled the results panel back into view, so the user was scrolled
  straight back to the compare table and saw nothing change. Asserts the outcome a
  person can see — the button acknowledges the click, the editor ends up on screen, and
  it shows the pinned build.

- **double-attack-visible.mjs** — Double Attack must be named on screen with its proc
  chance. It was modelled and folded into the DPS for as long as the engine has existed,
  and rendered nowhere, so a player reported it as unimplemented. Covers the dagger skill
  proc and Sidewinder Card's `bDoubleRate` on a Monk's knuckle.

## These go stale silently

Being outside `npm test` is what makes them cheap to keep, and also what let
`double-attack-visible.mjs` assert a number that had been wrong for hours: the Sidewinder
expectation still said 5% after the weapon restriction was lifted, and nothing re-ran it.
**Run ALL of them (every .mjs here) whenever you change what they cover**, not just the one you are working on:

```sh
for f in tools/e2e/*.mjs; do node "$f" || echo "FAILED: $f"; done
```

## A note on what these are for

Both of these exist because reading the source said everything was fine. Assert what a
person would see, not what the state says — the two reports that produced this directory
were both cases where the state was correct and the screen was not.
