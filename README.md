# Skyline Courier

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/arnoldswingtaiger/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/arnoldswingtaiger/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A 2D chase-view flight game that plays offline in a desktop browser —
entered in the make.fun bounty
[best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057).

You are the courier pilot of a little mail plane, SK-7, based at a
valley runway. Take off, thread the glowing rings of your route, mind
your fuel, and bring her home for a gentle landing on the centreline.
Three routes to fly: Harbour Run down the valley, Mountain Pass
through the eastern ridge, and the low, fast River Low Run. Rings
flown dead centre pay a bonus, a hard or banked touchdown ends the
flight, and a clean landing with time to spare pays a time bonus.

## How to play

- **↑ / ↓ or W / S** — pitch up and down
- **← / → or A / D** — bank and turn
- **Shift / Ctrl (or + / −)** — throttle up and down
- **Mouse** — steer by moving the pointer; the wheel trims the throttle
- **1 / 2 / 3** — choose a mission on the title screen
- **Enter / Space / click** — start, and restart after a flight ends
- **P / Esc** — pause
- **R** — restart the flight
- **M** — mute

The loop: full throttle down the runway, ease back to climb, bank
into each glowing ring (the pointer under the top bar shows the way),
watch the fuel gauge — and come home. Land under 62 m/s, wings
level, on the runway, with all rings flown, to complete the mission.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. No build step, no network requests.
Sounds are synthesized live with WebAudio — there are no audio files.

## Screenshots

The four screenshots in `screenshots/` are frames the game stages
itself: `?shot=start`, `?shot=play`, `?shot=rings` and `?shot=end`
(see `shots.json`).
