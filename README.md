# The 25th Quarter Quell

A funny, dark Hunger Games simulator you present as a slideshow. 24 tributes (your own names and photos), randomized events,
alliances and betrayals, sponsor gifts, Gamemaker disasters and mutts, a Cornucopia feast, and a nightly cannon announcement
until one tribute is left. It runs entirely in the browser: no install, no server, no build step.

## Run it

Double-click `index.html` (or drag it into Chrome, Edge, Firefox or Safari).

Optional local server:

```sh
cd HungerGamesSimulator
python3 -m http.server 8000   # then open http://localhost:8000
```

## Using it

### 1. Setup (the Reaping screen)
- Click a tribute's square to upload a picture, then type their name. Two tributes per district, 12 districts.
- **Bulk add photos** selects many pictures at once. They fill empty slots in order and the file name becomes the name.
- **Fill sample names** fills blank names with the book's tributes (handy for testing).
- The red x on a portrait removes its picture. **Clear all** wipes everything.
- Names and photos are saved in your browser (localStorage). Use the same browser for the presentation.
- **Begin the Games** unlocks once all 24 have names. Pictures are optional (the tribute's initial is shown instead).

### 2. The slideshow
The game plays as slides, one idea per page. Advance with **Next**, Space or the Right Arrow. Go back with **Back** or the Left Arrow.

- **Title slides** fade in for each phase: The Reaping, The Bloodbath, Day N, Night N, each Gamemaker event, and each night's cannon announcement.
- **One event per slide**: large portraits (with name and district), then the description fades in. If someone dies, their portrait drains to gray and is slashed out, and the cause of death appears.
- A district tag (D7) appears next to every tribute's name in the text.
- Title slides are kept bare (just the title). The only descriptions are the arena description on The Reaping and the cannon count in the night sky.
- Each day has roughly 5 to 7 events (3 to 4 by day, 2 to 3 by night). Not everyone takes part, and some events involve up to five tributes.
- **Sponsor gifts** appear as one slide after most Day and Night rounds.
- **Gamemaker events** (feast, disasters, mutts) get their own title slide, then an aftermath slide listing everyone affected.
- **Cannon announcement** (end of each day): a title slide, one slide per fallen tribute with the cause of death, then a slide of everyone still standing with kill counts and alliances.
- The winner gets a title slide, a winner slide, and a results table with kills and cause of death for every tribute.
- **Cannon sound**: a boom plays on the night-sky slides, one for the cannon count and one per fallen tribute. **Cannon sound** mutes that, and **Fire cannon** (or the `C` key) fires one on demand, even when muted.
- **Music**: a dark ambient score plays in the background (starts on your first click). **Music** toggles it and the slider sets the volume.
- **Your own cannon**: put a recording in `audio/` (the name must contain "cannon") and run `node tools/embed-audio.js`. It embeds the file into `audio/cannon.js`, which is what the page plays, boosted about 3.5x through a limiter so it is loud without distorting. (The embedding step is needed because browsers block loading audio data from loose local files.) Change the loudness with `SFX_GAIN` in `js/app.js`.
- **Your own music**: drop `audio/music.mp3` (loops) into the project, or use **Load music**. **Load music** also lets you pick a track live. Anything you don't provide falls back to the built-in sound.
- **Auto-play** advances every 6.5 seconds. **Skip to winner** jumps to the end. **Play again** reuses the same tributes.

### 3. Presenting
- Click **Presentation mode** (or press `F`) for fullscreen with larger text. Press it again or Esc to exit.
- Suggested flow: set up live on the Reaping screen, click **Begin the Games**, then advance with Space.
- Do a trial run first. "Edit tributes" takes you back to setup and keeps your data.

## What's in the arena

- An abandoned, overgrown butterfly pavilion with a Cornucopia in the middle. The butterflies are killers, many plants are poisonous, still water holds brain-eating amoeba, and radioactive barrels and rocks are scattered around.
- Items: white liquor, brown liquor, a brick, a feline familiar, a really good shoe, gas masks, radon, and lots of ibuprofen.
- Alliances: tributes team up under a name like "The Rad Pack", get grouped together, avoid killing each other, can betray each other, and mourn fallen allies.
- Disasters: wildfire, flash flood, toxic pollen storm, moonshine monsoon, earthquake, radiation leak, stagnant surge.
- Mutts: razorwing butterflies, giant caterpillars, feline familiars, tracker jackers, strangler vines.
- The game lasts about 12 to 15 days and ends when one tribute remains.

## Customizing the jokes

All content is in [`js/events.js`](js/events.js). Each event is one line:

```js
K(2, `{0} bonks {1} with a gigantic stuffed monarch.`, [0], [1], `Bonked to death by a giant plush monarch ({0})`)
//  ^people ^text                                       ^killers ^dead   ^cause of death
```

- `N(n, text)` is a harmless event, `D(text, cause)` a solo death, `K(...)` a kill.
- Alliance events: `F(...)` forms an alliance, `A(...)` is an event between allies, `B(...)` is a betrayal, `AD(...)` is an ally dying to save another. Use `{a}` for the alliance name. Names are in `allianceNames`.
- `{0}`, `{1}`, `{2}` become tribute names. Keep text pronoun-free so it fits anyone.
- Event pools: `bloodbath`, `day`, `night`, `classic` (fatal events shared by every phase), `hazards`, `alliances`, `feast`, `gifts`, `disasters`, `mutts`, `memos`. Rename the 12 districts in `zones`.
- Events per round are set in `eventsRound` in `js/engine.js` (look for `const count`).

## Files

- `index.html`: page layout
- `css/style.css`: theme (colors are variables at the top)
- `fonts/`: the Hunger Games font (main title and slide titles only) and Cinzel (other headings), both bundled so it works offline
- `js/events.js`: all jokes, disasters and mutts
- `js/engine.js`: simulation logic and pacing (no DOM)
- `js/app.js`: setup screen, slideshow, controls, falling-fire background
