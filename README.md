<img src="docs/brand/icon.png" alt="Sweet Home icon" width="112" align="right">

# Sweet Home

[![Open your Home Assistant instance and open Sweet Home in the Marketplace.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=mousawm&repository=sweet-home&category=plugin)

![Sweet Home: the Home tab with the 3D house, At a glance and Modes](docs/screenshots/home.webp)

Your home as an interactive **3D model** in Home Assistant. Tap a room to see and switch what is in it. Tabs cover
security, climate, energy, water, media and your home lab.

- **3D house**: walls, windows, doors that swing open with their contact sensors, furniture, glowing lights (ceiling
  lights, spots, LED strips, TV backlight), AC airflow, motion pulses and lock badges. Three views: Lights, Climate and Presence.
- **Works with no setup**: without any configuration it builds a simple house from your Home Assistant areas. Draw
  your real floor plan in the card editor, or load your own `.glb` model.
- **Panels**, each shown only when Home Assistant has something for it:
  - **Security**: alarm with a PIN keypad, locks, gates and garage doors, live cameras, and every door's last 24 hours:
    a timeline that opens into a list of when each door last opened (see [Doors](#doors-the-last-24-hours))
  - **Climate**: ACs, temperatures
  - **Energy**: live power flow and a chart of today, plus history by day, week, month and year from your Energy
    settings, an electric car and the Forecast.Solar forecast
  - **Water & Irrigation**: tank trend, pumps, valves, schedule
  - **Media**: TV and speakers, plus a media server card from Jellyfin (or Jellyfin + JellyHA), Sonarr, Radarr and
    qBittorrent: now watching, the library, coming up, downloads and storage. Tap a movie or episode to play it on your TV
  - **Home Lab**: Proxmox VE node and guests
  - **Needs Attention**: unavailable devices, low batteries, weak Wi-Fi, repairs, updates (with a live progress bar
    while one installs)
- **Sweet Home 3D card**: only the 3D view, to place among your other cards. Tap a room and its controls open as a
  pop-up. See [Only the 3D view](#only-the-3d-view-sweet-home-3d).
- **Shows what it found**: each panel's settings list the integrations it reads (Jellyfin, Sonarr, Radarr,
  qBittorrent, Forecast.Solar, Proxmox VE…), found or not found, with a switch to turn each part off.
- **Dark or light**: a dark look by default, a light one with `appearance: light`, or `auto` to follow your Home
  Assistant theme.
- **Live counters**: each tab shows what needs you (open doors, ACs running, alerts…) and follows changes within a
  second.
- **English and Arabic**, with a right-to-left layout for Arabic.
- **Made for phones**:
  - Swipe between tabs. Haptics. Long press opens more-info; double tap opens the second entity.
  - Popups don't scroll the page behind them. Skeleton loaders while data arrives.
  - The 3D view sleeps when nothing moves, to save battery.

## Screenshots

| Security | Climate |
|---|---|
| ![Security tab: alarm, locks, doors and live cameras](docs/screenshots/security.webp) | ![Climate tab: room temperatures and one card per AC](docs/screenshots/climate.webp) |
| **Energy** | **Water & Garden** |
| ![Energy tab: live power flow, today's chart and the car charger](docs/screenshots/energy.webp) | ![Water & Garden tab: tank trend, pumps and irrigation](docs/screenshots/water.webp) |
| **3D house** | **Furniture that reacts** |
| ![The demo house in 3D: rooms with live temperatures, locks, a pool and a parked car](docs/screenshots/overview-3d.webp) | ![A bathroom: toilet, vanity with a glowing mirror, towel warmer, steaming shower, washing machine and bathtub](docs/screenshots/bathroom-3d.webp) |
| **Media** | **System** |
| ![Media tab: the TV, and the media server with Now Watching, the library, Coming Up, downloads and storage](docs/screenshots/media.webp) | ![System tab: Needs Attention, the Home Lab server with its containers and VMs, and the phones' batteries](docs/screenshots/system.webp) |
| **Sweet Home 3D card on a dashboard** | **Tap a room: its pop-up** |
| ![The Sweet Home 3D card next to other cards on a dashboard](docs/screenshots/sweet-home-3d.webp) | ![The room pop-up of the Sweet Home 3D card: lights with brightness, the front door lock, blinds and the robot vacuum](docs/screenshots/sweet-home-3d-room.webp) |
| **Floor plan editor** | **On a phone** |
| ![The card editor: rooms, walls, doors, windows and furniture drawn on a plan](docs/screenshots/editor-plan.webp) | ![A room popup on a phone: lights with brightness, the front door lock and blinds](docs/screenshots/phone-room.webp) |
| **Doors: the last 24 hours** | **Show details** |
| ![The Doors timeline: open now, openings, busiest door and openings at night, then one 24-hour strip per door](docs/screenshots/doors-timeline.webp) | ![Show details: the same rows as cards under Open now and Last hour, each with how often it opened today and when it last opened](docs/screenshots/doors-list.webp) |

**Light look** (`appearance: light`)

![The Home tab in the light look: the 3D house, At a glance and Modes on light panels](docs/screenshots/light-look.webp)

### Doors: the last 24 hours

The Doors block on the Security tab shows each door's day at a glance. A strip per door marks every time it opened in
the last 24 hours (red while it is open now), with how long ago it last opened, and a summary on top: how many are open
now, how many openings, the busiest door, and openings at night (midnight to 5 am); tap one of these for the list of
those openings, newest first, with how long each stayed open. Each bar runs from the door's name to its time, oldest
on the left (or, with `doors_timeline: aligned`, every bar on one scale with -24 h / -12 h / now under them); tap it
to see the opening nearest your tap, when it was and how long it stayed open ("14:32 · 4 min"). **Show details**
opens each row a little further: how many times the door opened today and when it last opened (or since when it is
open), grouped under *Open now*, *Last hour* and *Earlier*. **Show less** folds it back. The doors come from your door sensors and from gates with an open / closed sensor.

<img src="docs/screenshots/doors-animation.webp" alt="Show details opens each door's row: a second line, the row cards and the group titles appear" width="380">

The times come from Home Assistant's history (read every 5 minutes); a door that opens or closes shows at once. Choose
what it shows with `doors_view` (card editor: Panels → Security → *Doors view*): `both` (default: the timeline, with
Show details), `timeline` or `list`; the bars with `doors_timeline` (*Timeline bars*): `fill` (default) or
`aligned`; and how far back the timeline goes with `doors_hours` (*Timeline span*): `6`, `12`, `18` or `24` (default)
hours. The counts and the list of openings follow the same span.

## Install

### Marketplace (recommended)

Home Assistant's **Marketplace** (formerly HACS):

[![Open your Home Assistant instance and open Sweet Home in the Marketplace.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=mousawm&repository=sweet-home&category=plugin)

1. Click the button above. It opens Sweet Home in your Marketplace and offers to add the repository. Or add it by hand: **Marketplace** → ⋮ → **Custom repositories**, this repository's URL, type **Dashboard**.
2. Search the Marketplace for **Sweet Home** and download it.
3. Reload the browser, then [add the dashboard](#from-add-dashboard-recommended).

The Marketplace adds the dashboard resource for you. If it doesn't, add `/local/community/sweet-home/sweet-home-card.js`
as a **JavaScript module** under Settings → Dashboards → ⋮ → Resources.

### Manual

Download `sweet-home-card.js` and `sweet-home-editor.js` from the latest release and put both in `/config/www/`.
Then add `/local/sweet-home-card.js` as a JavaScript module resource. The card loads the editor file by itself, and
only when you edit the card.

## Add it to Home Assistant

### From "Add dashboard" (recommended)

Once Sweet Home is installed, it is listed with the other community dashboards:

1. Go to **Settings → Dashboards → Add dashboard**.
2. Under **Community dashboards**, pick **Sweet Home**. Its description reads *"Your home as an interactive 3D model, with
   tabs for security, climate, energy, media and more. Built from your areas."*
3. Give the dashboard a name and an icon, then open it from the sidebar.

The dashboard builds itself from your Home Assistant **areas**. Each area becomes a room with its lights, sensors, doors
and climate devices. The tabs show what Home Assistant has for them: alarm, locks, cameras, energy, media and so on.
It shows the whole house full screen.

Not listed? Reload the browser after installing (on the phone app: ⋮ → Reload resources), and check that you have
version 0.1.1 or newer.

### Edit it

The dashboard is generated for you until you take control of it:

1. Open the dashboard and click the **pencil** (or **⋮ → Edit dashboard**) at the top right.
2. Choose **Take control**. The dashboard becomes a normal one with a single Sweet Home card.
3. Click **Edit** at the left end of the bar under the card. The ⋮ at its right end only has move, copy and delete.
4. The Sweet Home editor opens with three steps:
   1. **Rooms**: a floor plan with four modes. A setup guide walks you through them the first time.
      **Room by room** (in the setup guide, or **+ Room by room** above the plan) goes through your Home Assistant
      areas one at a time. For each, pick a shape (rectangle, L, T, U, cut corner, bay, curved, round), a size (a
      starting size comes from the room's name) and where it goes (right of / below / left of / above a room already
      on the map; a dashed preview shows the spot). **Add to the map** or **Skip**; **Add a room that isn't an area**
      for anything else; **Finish** whenever you like.
      - **Shape**: add rooms (or all your areas at once), link them to areas, and draw them by dragging on a grid. Drag
        a rectangle to move it and its corner dots to resize it. Draw more than one rectangle for an L-shaped room.
        Duplicate or delete rooms.
        - **Ready-made shapes**: rectangle, L, T, U, cut corner, bay window, curved wall and round. Tap one to give the
          room that shape in the space it takes now. **Turn** and **Mirror** change which way it faces.
        - **Edit corners** gives a room free corners. Drag a corner to move it, which slants the walls next to it. Drag
          the square in the middle of a wall to bend it into a curve, or tap the square to add a corner there.
        - **Draw walls**: tap each corner of the room in turn and its walls follow; tap the first corner again (or
          **Done**) to close it. **Straight walls** keeps every wall at a multiple of 45°; turn it off to draw at any angle.
          **Remove last corner** (or Backspace) steps back.
        - **Rotate**: **Turn** (a quarter), **15°** either way, or type any angle. A room drawn with rectangles gets free
          corners first. In the room-by-room guide, **Turn** turns the ready-made shape before it is added.
        - **Separate walls**: drag on the plan to draw a wall that stands on its own, in any direction. Use it for a
          partition, a kitchen half wall, a glass screen, a garden fence or a curved garden wall. Tap one to set its kind
          (wall, half wall, glass or fence), height and bend, or drag it to move it. Doors, gates and openings cut
          separate walls too.
      - **Entities**: what each room shows in its popup. Devices in the room's area are found on their own. Remove
        what you don't want, add other devices from the area, or add any entity. Edit a name to rename the entity on this
        dashboard (Home Assistant is not changed). Set how each light is drawn (ceiling
        light, spots, LED strip, TV backlight), with or without colours. For an LED strip, pick the walls it runs along and
        whether it stops where a wall is missing. A list shows devices that are in no room yet.
      - **Furniture**: pick a piece, then tap the plan to place it. Drag to move, use the corner dot to resize, and
        **Turn** to rotate. Link a piece to one or more entities, such as a lamp to its light or a bed to the bedside
        lights, so it can be tapped in the 3D view. **Suggest furniture** fills a room from its name.
        Two sofas (or two counters) placed at a right angle with their ends overlapping become one L-shaped corner sofa
        (or corner counter; worktops at the same height join too). Pieces made of several parts have a colour for each:
        a sofa's frame and back, seat cushions and pillows; a bed's duvet, frame, headboard and pillows; a table's top and
        legs; a chair's frame and seat. A piece moved or placed within 35 cm of a wall goes flat against it. Resizing
        changes only the side you drag; the other keeps its exact size.
      - **Doors & windows**: rooms are closed by walls until you add a way through. Drag along a wall to add a door
        (pick its contact sensor to make it swing open in 3D), a window, an open passage or a **gate** (a gate leaf
        with bars, about fence height: drag it along a fence or an outer wall; pick its sensor or cover to make it swing
        open). Tap to add a lock badge. Drag any of them to move it; tap one to type its exact **width** in metres (a door
        or gate keeps its hinge end, a window or passage keeps its middle). On a slanted wall the door follows the wall; on a curved wall a door or passage runs from point to point of the curve. They work on every wall: inner and outer walls, outdoor railings, and separate walls.

      **Floors**: tabs above the plan switch floors, and **Add floor** adds one. Other floors show as dashed outlines
      so you can line them up. Areas on a Home Assistant floor are added to that floor.

      **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z) cover every change. *Things to check* lists entities that weren't found,
      rooms without a shape and devices that are in another room's area.
   2. **Panels**: turn panels on or off and pick their entities. **Modes** adds one-tap buttons to the Home tab (guests, holiday, scenes, scripts).
   3. **Look**: title, weather, start tab, wall height, automatic furniture, **Hide the "tap a room" tip** (on: the tip and the "tap a room" under the 3D view's title are not shown), or a 3D file.
      **Names on this dashboard** lists every entity renamed here (in a room or on a panel). Change or clear a name,
      or rename any other entity.
5. Click **Save**, then **Done**.

Everything the editor doesn't cover can be added in YAML (**Show code editor**, or the dashboard's **⋮ → Raw
configuration editor**), and the editor keeps it. See [Configuration](#configuration) below.

### As a card on any dashboard

You can also add the card yourself: **Edit dashboard → Add card → Sweet Home**, or in YAML:

```yaml
type: custom:sweet-home-card
```

It is built to fill the screen, so put it in a view with the **Panel** layout (view settings → View type → Panel).

### Only the 3D view: Sweet Home 3D

To place the 3D house among your other cards, add **Sweet Home 3D** (**Add card → Sweet Home 3D**), or in YAML:

```yaml
type: custom:sweet-home-3d-card
house: { ... }   # the same house settings as the full card (copy them across)
height: 420      # optional, in pixels; in a Sections view the card's size is used instead
room: kitchen    # optional: zoom on one room (its area, id or name)
```

It shows the 3D view with its own controls (Lights / Climate / Presence, floor plan / 3D, auto-rotate, floors), and no
tabs or panels. Tapping a room opens its controls as a pop-up over the dashboard (lights, dimmers, climate, plugs);
tap beside it, swipe it down or press Escape to close it. In a Sections view it can be resized like any other card.
Its editor has the Rooms and Look steps of the full card. `default_view` and `default_floor` work the same way, so one
card per floor is possible.

**Room zoom.** With `room` (Look → *Zoom on one room*), the card opens framed on that room, on its floor, with no floor
buttons. That works in 3D and in the floor plan. Tapping another room still opens it; closing its pop-up, or tapping
the 3D / floor plan buttons, comes back to your room. One card per room, such as a *Kitchen* card on the kitchen tablet, is
possible.

Each 3D view uses the device's graphics. One or two on a dashboard is fine; it pauses while it is off screen.

## Configuration

| Option | Description |
|---|---|
| `title` | Name in the 3D view header (default `My Home`) |
| `weather` | Weather entity for the header chip and weather sheet (default: the first one) |
| `persons` | Person entities shown as avatars. Long press opens the phone panel when the person has a Companion app tracker. |
| `people` | Each person's phone panel (long press their picture): `{person.x: {name, tracker, battery, charging, location, ringer, wifi, entities, buttons}}`. With none of `tracker`, `battery`, `charging`, `location`, `ringer`, `wifi` given they are all found on the person's phone (Companion app); once you give one, only the ones you give show; `entities` adds rows, `buttons` adds buttons (ring the phone, scripts…): `entity_id` or `{entity, name, icon}`. Without a name, a button shows its own name without "button" and the phone's name; without an icon, one is picked from what it does (ring → bell, location → target, flashlight, lock…). While the dashboard is edited, the pencil on the phone panel renames its rows and buttons for this dashboard. Set it up in the card editor: Panels → People. |
| `room` | Sweet Home 3D only: zoom on one room, by its area, id or name (its floor buttons are hidden) |
| `height` | Sweet Home 3D only: the height of the 3D view in pixels (default `420`; in a Sections view the card's size is used) |
| `appearance` | The full card's look: `dark` (default), `light`, or `auto` (light or dark with your Home Assistant theme). The 3D view stays dark in both. Card editor: Look → Appearance. Sweet Home 3D always follows the theme. |
| `start_tab` | `home` / `security` / `climate` / `energy` / `water` / `media` / `system` |
| `default_view` | where the 3D view starts, per kind of device: `{phone: top, tablet: top, pc: 3d}` (`top` = floor plan from above, `3d` = angled view; not set: 3D on a computer, the floor plan on phones and tablets) |
| `default_floor` | the floor shown first, per kind of device: `{phone: 0, tablet: 1, pc: 0}` (the floor's level; not set: the ground floor) |
| `names` | Names for this dashboard only, for any entity: `{sensor.ev_power: Car charging}`. They replace the entity's name on every panel of the card (Home Assistant is not changed). Room names (`names` inside a room) work the same way. |
| `modes` | Mode buttons on the Home tab, under At a glance (`entity_id` or `{entity, name, icon}`): switches, helpers, lights and automations light up while on; scenes, scripts and buttons run with one tap. Pick them in the card editor: Panels → Modes. |
| `devices` | Phones and tablets with battery and charging state (default: every Companion app battery sensor) |
| `hint` | `false` hides the "tap a room" tip shown on first use |
| `room_backdrop` | Phones: the 3D view behind an open room is dimmed and blurred, and a tap outside the room closes it (default). `false`: no blur, and a tap on another room switches to it. Card editor: Look |
| `language` | Language of the card, such as `ar` (default: your Home Assistant language). Arabic is translated and laid out right to left; other languages fall back to English. |
| `house` | The 3D model, described below |
| `panels` | The panels, described below. `panels.<name>: false` hides one. |

One phone or tablet can start differently from the rest: long press a floor button, or the floor plan / 3D button, on
that device. It is kept by that browser only and wins over `default_view` / `default_floor`; long press it again to go back.

### `house`

| Option | Description |
|---|---|
| `rooms` | List of rooms, described below. Leave it out to build the house from your areas (one floor per Home Assistant floor). |
| `levels` | Floor names: `[{level: 0, name: Downstairs}, {level: 1, name: Upstairs}]` (default: the Home Assistant floor names) |
| `doorways` | `auto` puts a doorway in every wall between two rooms. By default walls stay closed until you add `doors` or `openings`. (The house built from your areas always gets doorways.) |
| `areas` | With automatic rooms: only these area ids |
| `auto_furniture` | Add furniture to every room based on its name |
| `wall_height` | In metres (default 1.35, a cut-away dollhouse height) |
| `walls` | Your own wall segments `[x1, z1, x2, z2, type]`, where type is `w` (wall), `win` (window) or `rail` (glass railing). By default, walls are drawn around the rooms. |
| `extra_walls` | Walls that stand on their own, on top of the room walls: `from: [x, z]`, `to: [x, z]`, `type` (`wall`, `half`, `glass` or `fence`; a fence is 1.2 m high unless `height` says otherwise), `height` (m), `bow` (bends the wall into an arc: how many metres its middle moves to one side, negative for the other side), `level`. A plain `[x1, z1, x2, z2]` works too. Doors and openings cut them. |
| `openings` | Gaps in the automatic walls `[x1, z1, x2, z2]`, plus the floor as a 5th item when it isn't the ground floor |
| `windows` | Window segments on the automatic outer walls (`[x1, z1, x2, z2, level]`) |
| `doors` | Doors: `from: [x, z]`, `to: [x, z]`, `entity` (contact sensor: the door swings open while it is open; without one the door stays shut), `side` (1 / −1: which way it swings), `main`, `level`, `gate: true` (a gate leaf instead of a door; `height`, default 1.25 m; `entity` can be a cover too). A door cuts its own gap in the wall; one placed up to 0.4 m off a wall is moved onto it. |
| `door_info` | Names and timeout sensors for doors in the room popup (`entity`, `name`, `timeout`) |
| `lock_badges` | Small 3D badges for locks: `lock`, `x`, `z`, `y`, `axis`, `level`, `name` (shown above the badge; default the lock's name), `label: false` (no name). Tap the name for the lock's details; while the dashboard is edited, its pencil renames the badge (this dashboard only). |
| `furniture` | Furniture anywhere in the house (the same pieces as in rooms) |
| `type: gltf`, `url`, `scale`, `rotation`, `offset`, `mesh_rooms` | Use your own 3D file instead of the drawn walls. See [examples/gltf.yaml](examples/gltf.yaml). |

Coordinates are in metres. **x** runs to the east (right) and **z** to the south (down the screen). The plan is
shifted so that it starts at 0.

### Rooms

```yaml
- area: bedroom               # devices in this area are found automatically
  name: Main Bedroom          # default: the area name
  rects: [[0, 5, 5, 9]]       # one or more [x1, z1, x2, z2] (two that touch make an L, with no wall between them)
  # or an outline, for slanted and curved walls: the corners in order. A third number bends the wall that starts
  # at that corner into an arc (metres its middle bows out of the room; negative: into the room).
  # points: [[0, 5], [5, 5], [5, 9], [1.2, 9], [0, 7.8, 0.7]]   # a cut corner and a curved wall
  # points: [[0, 7, 2], [4, 7, 2]]                              # two bent corners make a round room
  icon: mdi:bed
  floor: carpet               # wood, tile, marble, carpet, stone, grass, asphalt (parking)
  outdoor: false
  level: 1                    # the floor (default 0, the ground floor)
  stairs: true                # a flight of stairs, set by the floors: up from the lowest floor, down from the top
                              # one, both ways in between (one up, one down into a stairwell). Or: both, up, down;
                              # false: none. Rooms named "Stairs" get them on their own. With one floor (a flat in a
                              # building) they go both ways. The flight going down shows only through its hole in the
                              # floor, so nothing hangs below the house.
  furniture: [...]            # or `false` for none
  # overrides for what was discovered:
  lights: [light.bedroom]
  temperature: sensor.bedroom_temperature
  humidity: sensor.bedroom_humidity
  motion: [binary_sensor.bedroom_motion]
  climate: climate.bedroom_ac
  media: media_player.bedroom_tv
  plugs: [switch.bedside_plug]
  entities: [cover.bedroom_blinds, script.good_night]   # anything else, under "Other"
                                         # (default: blinds, plain switches, valves… found in the area)
  light_fx: {light.bedroom_led: strip}   # center, spots, strip or tv (tv: glows around the room's TV piece)
  light_names: {light.bedroom_led: LED Strip}
  names: {script.good_night: Bedtime}    # names for this card only: they replace the entity's name everywhere on
                                         # the dashboard (renaming in the card editor or the popup writes these)
  color_lights: [light.bedroom_led]      # show colour swatches
  simple_lights: [light.tv_backlight]    # on/off only
  strip_sides: nes                       # walls that have the LED strip (an outline room: all of its walls)
  strip_mode: walls                      # stop the strip where a wall is missing (doors, openings); default: full side
  ac: {x: 0.2, z: 6, dx: 1, dz: 0}       # where the AC unit hangs and which way it blows
  anchor: [2.5, 7]                       # label position
```

### Furniture

Each piece has a `type` plus a position. `x`, `z` give the centre; `from` and `to` give the corners. Colours are `#hex`.

Any piece can be linked to entities with `entity` (or `entities` for several), plus an optional `name`. A linked
piece can be tapped in the 3D view: its room opens with the piece and its entities at the top. It also gets a small
badge, which shows the entity's icon while it is on or while its room is open. `badge: false` hides the badge.

```yaml
furniture:
  - { type: bed, x: 3, z: 7.8, head: s, entities: [light.bedside_left, light.bedside_right] }
  - { type: lamp, x: 1.6, z: 8.5, entity: light.reading_lamp }
  - { type: fan, x: 3, z: 6.8, entity: fan.bedroom }
  - { type: marker, name: Window sensor, x: 0.3, z: 6, entity: binary_sensor.bedroom_window }
  - { type: box, name: Coffee corner, x: 9.4, z: 1.4, w: 0.8, d: 0.6, h: 0.9, entity: switch.coffee_machine }
```

| type | Options |
|---|---|
| `box` | `x z w d h y color roughness metalness opacity emissive` |
| `block` | `from to h y color` |
| `rug` | `x z w d color` |
| `table` | `x z w d h top leg` |
| `chair` | `x z face (n/s/e/w) color seat` |
| `sofa` | `from to back (n/s/e/w) color cushion pillow arms (both/start/end/none)` |
| `bed` | `x z width length head (n/s/e/w) frame duvet headboard pillow house_headboard` |
| `nightstand` | `x z w d h facing (n/s/e/w: where the drawers look) drawers (1-4) lamp (false hides it) color top handle shade entity plug power charging_w`: a bedside table with a table lamp that glows with its light. With `plug` (a phone charger's smart plug), a phone lies on top while it charges: while the plug draws more than `charging_w` (1.5 W) on `power`. `power` is found from the plug's own device when left out; with no power sensor, plug on means charging. Automatic bedrooms get one each side of the bed. |
| `plant` | `x z size` |
| `cylinder`, `ball` | `x z radius h y color` |
| `tv` | `x z w h y facing entity`: the screen flickers while the player plays |
| `charger` | `x z y plug power charging_w color phone_color`: a charging pad; the phone on it shows (and glows) only while it charges, as for `nightstand` |
| `stairs` | `from to axis (x/z) mode (up/down/split) steps motion` |
| `lamp` | `x z h size color shade entity`: the shade glows in the light's colour and brightness |
| `fan` | `x z y radius color blade entity`: a ceiling fan whose blades turn at the fan's speed |
| `marker` | `x z y color entity`: a device with no furniture (a sensor, a plug): a dot that lights up while it is on |
| `blinds` | `from to y h color shade entity`: a blind along a window that rolls down with the cover's position |
| `vacuum` | `x z color entity`: a dock and a robot that drives around the room while it cleans and goes back after |
| `car` | `x z facing (n/e/s/w: where its front points) color length width entity parked_state`: a car in a painted bay. With a sensor it is there only while it is parked, and drives in / off when that changes: a binary sensor that is on, a tracker or person at `home`, or a state like `parked` (`parked_state` sets the exact state). |
| `ac` | `x z style (wall/cassette/floor) facing (n/e/s/w: where it blows) color y entity`: an AC unit that glows and blows air in its mode's colour while its climate entity runs. With no entity it uses its room's. A room with an `ac` piece has no automatic unit; in the editor a wall unit turns to blow away from the wall it is put against. |
| `toilet` | `x z w d facing color seat` |
| `sink` | `x z w d h facing color top entity`: a vanity with a basin, tap and mirror; the mirror glows while its light is on |
| `shower` | `x z w d facing entity`: a tray with glass; steam rises while a switch / water heater is on, or a humidity sensor is above 70 % |
| `bathtub` | `x z w d facing water (false: empty)` |
| `washer` | `x z w d h facing entity`: a front-loader whose drum turns while it runs (a power sensor above 5 W, or a running / on state) |
| `towel` | `x z w y facing color entity`: a towel warmer whose rails glow warm while it is on |
| `tree` | `x z size color trunk` |
| `hedge` | `from to h color` |
| `pool` | `from to color` |
| `sprinkler` | `x z radius entity`: sprays water in 3D while its valve or switch is on |
| all types | `entity` / `entities`, `name`, `badge` |

**Icons.** Switches, fans, plugs, modes, scripts and phone buttons get an icon that suits their name (a fan, a water heater,
a guest mode…), in English or Arabic; a fan's icon turns while it is on. `smart_icons: false` (Look → *Automatic icons*
off) uses the icons set in Home Assistant instead. An icon you set in the card always wins.

`facing` is the side a piece's front looks to; `w` and `d` are its size along x and z. In the editor, a toilet, sink, washer…
placed near a wall sits flat against it and turns to face into the room. Automatic bathrooms get a toilet, a sink and a
bathtub (or a shower when the room is small); laundries get a washing machine.

**Move furniture in 3D**: while the dashboard is in edit mode, admins get a **move** button on the 3D view. Turn it on and drag pieces across the floor.
While the card editor is open, each move goes through it (with undo). Otherwise it is saved straight into the
dashboard. Pieces from the automatic set can be moved once their room has its own furniture (card editor → Furniture).

### Parking and garden

- **Parking**: a room named Garage, Parking, Carport or Driveway gets an asphalt floor (or pick *Parking (asphalt)*
  as its floor). Add a **Car** in the card editor (Furniture), pick its colour, and link the sensor that says the car
  is home: an occupancy or presence binary sensor from a camera, a `device_tracker` of the car, or a template sensor.
- **Garden**: draw a room for it, tick *Outdoor* and pick the *Grass* floor (rooms named Garden or Yard do this on
  their own). Add trees, hedges, a pool, plants and **sprinklers** in the card editor. Link each sprinkler to its
  irrigation valve or switch: it sprays water in 3D while the valve is open. The valves, their schedule and the water
  tank are on the **Water & Garden** tab (Panels → Irrigation and Water in the card editor).

### `panels`

Panels with several fields (Security, Media, Irrigation, Energy's live power, and each person's phone panel) follow one rule: leave every field empty and they are found on their own; pick one and only what you pick shows, the empty fields stay empty.

See [examples/panels.yaml](examples/panels.yaml) for every panel.

**Found from.** In the card editor, Energy, Media Server and Home Lab start with a list of the integrations they read,
each marked *found* (with how many entities) or *not found* (with what to install). A found one has a switch that
hides its part of the card; it is stored only when off, as `<integration>: false` under that panel (the keys are
listed below).

- **security**: `alarm`, `locks`, `entrances`, `doors`, `doors_view`, `doors_timeline`, `cameras` (`entity`, `person`, `car`, `motion`, `face`, `plate`), `gate` (`relay`, `sensor`; an older way to add one entrance), `face` (a sensor with the last face recognised, shown as a badge on the Cameras card: the name, or *No face*. Without it, the cameras' own face sensors are used; Frigate's `sensor.<camera>_last_recognized_face` is found by itself)
  - `locks`: `entity_id` or `{entity, name, kind, icon}`. A lock shows a padlock (green locked, red unlocked, amber locking or jammed). To show what it locks instead, with a small padlock for the state, set `kind`: `door`, `sliding`, `gate`, `garage`, `window`, `safe`, `car`, `locker`, or an `icon`.
  - `doors`: door sensors (`binary_sensor` with the door or garage door class; not given: all of them). `doors_view`: `both` (default), `timeline` or `list`; `doors_timeline`: `fill` (default) or `aligned`; `doors_hours`: `6`, `12`, `18` or `24` (default); see [Doors](#doors-the-last-24-hours).
  - `entrances`: gates, garage doors, barriers and shutters next to the locks (pick them in the card editor under Panels → Security). A `cover` opens, closes, or stops while moving; a relay (`switch`, `button`, `script`) is pulsed, with an optional `sensor` that says whether it is open (without one it shows as closed). The sensor can be a door / contact sensor (on = open), a cover or lock, or a text sensor such as a camera's Frigate state classification (`open`, `closed`, `opening`…; words of your own with `open_states` / `closed_states`). `sensor_2` (or a list) is a backup used when the first gives no clear reading. In the card editor, Panels → Security shows two sensor pickers per gate, with suggestions: `{entity: switch.gate_relay, sensor: binary_sensor.gate, name: Main Gate, kind: gate}` (`kind`: `gate`, `garage`, `barrier`, `shutter`, `door`, for the icon). Every tap needs a second tap to confirm. Not given: every garage door and gate cover is shown.
- **climate**: `entities`
- **energy**: live power and history come from **Settings → Dashboards → Energy**. Options:
  - `grid_power`, `solar_power`: your own power sensors
  - `current`: a current sensor (A) shown next to Home on the energy flow (*Home · 2.2 A*); tapping Home opens it. Without it Home shows no extra value, and Home / Solar / Grid with no sensor do nothing when tapped
  - `energy_dashboard_totals` (on by default): Today, Month and Year come from Home Assistant's Energy data (the same
    statistics as Energy History). Set it to `false` (card editor: Panels → Energy, switch off) to use your own
    `month_sensor` and `year_sensor` instead; their fields show in the editor only then
  - `month_sensor`, `year_sensor`: your own total sensors (with `energy_dashboard_totals: false`); `stored_sensor`: energy stored, shown as **Stored** next to Today / Month / Year (pick it in the card editor under Panels → Energy; not set: no Stored box)
  - `solar_forecast: false`: hides the **Solar Forecast** box (today, tomorrow, still to come, peak time). It is found
    from the Forecast.Solar integration, with nothing to set
  - `extra`: more rows for the energy card
  - `exclude`: meters to leave out
  - `devices`: names and colours for the history chart
- **water**: `tank`, `quality`, `temperature`, `pumps` (entity IDs, or `entity`, `name`, `power`, `timer`, `show`,
  `presses`; the power sensor is found on the pump's device when not given), `entities` (anything else on the Water
  card: valves, flow, pressure…). While a pump runs its tile shows `show: power` (default), `time` (a live timer of how
  long it has been on) or `both`. `presses: 1` turns it on with one tap; the default is two (tap again to confirm).
  Turning it off is always one tap. Both are set per pump in the card editor under Panels → Water.
  `trend_hours`: how much tank history the trend pill (rate and “empty in / full in”) uses: 2, 6 (default), 12 or 24.
- **irrigation**: `zones` (the valves: `valve`, `switch` or `input_boolean` entities, or `{entity, name, duration}`; pick them in the card editor under Panels → Irrigation; not given: every `valve` entity), `interval`, `weekday`, `tomorrow`, `next`, `notification`, `time`. A zone starts and stops with a second tap (a valve opens / closes, a switch turns on / off).
- **car** (electric car on the Energy tab; card editor → Panels → Electric car): `name`, `color` (the car drawing's
  colour, `#hex`), `charging`, `power`, `battery` (state of charge, %), `range`, `status`, `time`,
  `energy_per_charge`, `cost_per_charge`, `energy_month`, `cost_month`, `energy_year`, `cost_year`
- **media**:
  - `player`, `speakers`
  - optional screen-time limits: `watch_timer` (watched today) and `watch_limit` (the daily limit), both as H:MM:SS, `limit_select` (a select to change the limit), `block_switch`, `unblock_switch` (Force Unblock). Pick them in the card editor under Panels → Media
- **media_server**: found from the Jellyfin, Sonarr, Radarr and qBittorrent integrations. Tap a movie or an episode
  in the Shows / Movies browser and it plays on your TV, with no setup: the card finds a TV whose source list has
  Jellyfin (Android TV, Google TV and Fire TV over the Android TV integration first, then Android TV Remote, webOS,
  Tizen, Roku …), opens the Jellyfin app there (over ADB it restarts the app, which avoids a crash of the Jellyfin
  Android TV app), waits for the app's session and sends it the video. If the TV asks who's watching, pick a user
  there and it starts. If Home Assistant doesn't see the app after 15 s, the sheet says so and offers **Reconnect**
  (reloads the Jellyfin integration; admins only).
  Optional, in the card editor under Panels → Media Server, stored as `jellyfin_tv`: `app_player` (the TV to open
  Jellyfin on), `session` (the name of the TV's Jellyfin app, when several TVs run Jellyfin), `name` (shown as
  "play on …"), `source` / `package` (when the app has another name or package), `quick_connect` (the TV's Jellyfin
  signs in with Quick Connect: after opening Jellyfin on the TV, the sheet asks you to sign in there and sends the video
  when you tap **I've signed in · Play**).
  `integration`: `jellyfin` (the official Jellyfin integration for everything) or `hybrid` (**Jellyfin + JellyHA**:
  Now Watching, the client count and the Shows / Movies library come from
  [JellyHA](https://github.com/zupancicmarko/JellyHA), and a tapped movie or episode is played on the TV through the
  official Jellyfin integration, so both have to be installed). Not set: `jellyfin` when the official integration is
  installed, else `hybrid`. Pick it in the card editor under Panels → Media Server.
  Several Sonarr, Radarr or qBittorrent servers (one Home Assistant integration entry each) are all used: their counts and speeds add up, their queues and calendars are combined.
  `jellyfin: false`, `sonarr: false`, `radarr: false`, `qbittorrent: false` (the **Found from** switches): leave that
  integration out. Jellyfin off hides Now Watching (Shows and Movies then show only their counts); Sonarr off hides
  Shows, Wanted and its Coming Up items; Radarr off hides Movies and its Coming Up items; qBittorrent off hides Downloads.
  A section also hides by itself when its integration isn't installed.
  `clients_sensor`: the sensor for the "N clients" count next to Now Watching. Not set: `sensor.jellyfin_active_clients`
  with Jellyfin, `sensor.jellyha_active_sessions` with Jellyfin + JellyHA. Pick it in the card editor under Panels → Media Server.
- **homelab**: found from the Proxmox VE custom integration. With several Proxmox nodes, the card shows one chip per node to switch its gauges; `node` sets the one shown first (default: the first). Options (all in the card editor under Panels → Home Lab):
  - `cpu`, `memory`, `disk`, `swap`, `temperature`, `containers`, `vms`, `updates`: your own sensors in place of the
    node's (empty: found from the Proxmox node). With no Proxmox node, picking them still gives a Home Lab card
  - `auto_guests` (on by default): every container and VM is listed (the `pinned` ones first, the rest behind
    **Show more**). Off: only the `pinned` servers are listed
  - `update_script`: a `script`, `button` or `input_button` that installs the node's updates. Proxmox's API can only
    refresh the package list, not install it, so the work is done by your own script (for example `shell_command` / SSH
    running `apt-get update && apt-get -y dist-upgrade` on the node). Double tap **Updates**, then tap once more within
    3 s to run it; a script gets the node's name as `node`. Admins only; without it, a double tap opens the update details
  - `pinned`: servers (Proxmox guest keys, e.g. `lxc_jellyfin_102`, or `{key, name, icon}`), `order`
  To arrange the servers, edit the dashboard and drag a server by its grip (it replaces the icon while editing); the
  order is saved as `order` (Proxmox ids). **Reset the order** under the list goes back to the automatic order.
- **tv_light**: `light` (the TV backlight) and `selects` (its mode / effect selectors: `select` or `input_select`, as IDs or `{entity, name, icon}`). Pick them in the card editor under Panels → TV light; switching the panel off hides its card
- **devices** (System tab): `entities`: battery level sensors to show, as `entity_id` or `{battery, name, icon, charging, charging_state, tracker}`. Pick them in the card editor: Panels → Devices. For each one the device's name, a matching icon (phone, tablet, watch, laptop, lock…), its charging sensor and where it is (Home / Away / zone) are found on the same device. Not set: every phone, tablet and watch with the Home Assistant Companion app.
- **attention**:
  - `battery_threshold`, `wifi_threshold`, `tunnels`
  - `unavailable_domains`, `unavailable_integrations`
  - `exclude_devices` (device IDs or names), `exclude_entities`, `battery_exclude_devices` (only left out of low
    batteries), `battery_exclude`
  - While the dashboard is edited, admins can hide a device straight from its row (the eye button, tap twice). It is added to these
    lists; the card editor (Panels → Needs Attention) shows them and puts a device back.
  - An update being installed shows its progress ("Updating to 2026.12.0", a bar and its percentage, or a moving bar
    when Home Assistant reports no percentage).

## Styling: themes and card-mod

**Sweet Home 3D follows your theme**, light or dark, like any other card. It is drawn inside Home Assistant's own
card (`ha-card`), so it takes the theme's card background, corners, border and shadow (`--ha-card-background` /
`--card-background-color`, `--ha-card-border-radius`, `--ha-card-border-width`, `--ha-card-border-color`,
`--ha-card-box-shadow`). Theme rules for cards also apply, such as a card-mod theme's `card-mod-card: ha-card {...}`.
Its title, buttons and the room pop-up use the theme's text and divider colours (`--primary-text-color`,
`--secondary-text-color`, `--divider-color`). The 3D picture itself stays dark, like a camera image, with the labels
on it keeping their own colours. The full Sweet Home dashboard has its own dark look, or a light one with `appearance: light` (or `auto`, to follow your theme's light or dark mode).

**card-mod** works with both cards: add `card_mod:` to the card, as with any other card. On Sweet Home 3D, `ha-card {…}`
styles the card itself; on both cards you can also style `:host` (the colours) or one of the parts below. The styles
stay when you edit the card.

| Colour variable (on `:host`) | Used for |
|---|---|
| `--teal` | The accent: selected buttons, icons and highlights (the 3D room outline keeps its own colour) |
| `--amber`, `--rose`, `--violet`, `--blue`, `--green` | Lights, alerts, media, cold and good states |
| `--panel`, `--panel2`, `--line` | Panel background, inner rows, borders |
| `--tx`, `--mu` | Text and muted text |
| `--bg` | The full dashboard's background |

| Part | What it is |
|---|---|
| `.app` | The whole card |
| `.top`, `.tabs`, `.foot` | The full card's header (greeting, clock, chips), tab bar and footer |
| `.stage`, `.stage-top`, `.viewport` | The 3D view's frame, its title and buttons row, and the 3D picture |
| `.card` | Each panel (Security, Energy…) |
| `.drawer` | A room's controls (on Sweet Home 3D: the room pop-up) |

```yaml
# a different accent colour
card_mod:
  style: |
    :host { --teal: #f59e0b; }
```

```yaml
# Sweet Home 3D with no frame: only the 3D picture and its buttons
type: custom:sweet-home-3d-card
card_mod:
  style: |
    .stage { background: none; border: none; box-shadow: none; padding: 0; }
```

```yaml
# the full card without the clock header and the footer
card_mod:
  style: |
    .top, .foot { display: none; }
```

## Gestures

| Gesture | Action |
|---|---|
| Tap | The button's action: toggle, open, select |
| Double tap | More-info of the second entity, for example the power sensor of a switch |
| Long press | More-info of the button's own entity |
| Swipe sideways | Next or previous tab |
| 3D view | Drag to rotate, two fingers or right-drag to pan, pinch or wheel to zoom, tap a room to open it |
| 3D furniture | Tap a linked piece (or its badge) to open its room with the piece at the top |
| Floors | The floor buttons on the 3D view switch floors; opening a room on another floor switches to it |
| Rename | While the dashboard is in edit mode (admins): the pencil in a room's popup renames its devices, and the pencil next to each panel's title (At a glance, Security, Climate, Energy, Water, Media, System…) renames what that panel shows. Names apply on this dashboard only (Done saves; Home Assistant is not changed) |

Locks, gate relays and other risky switches need a second tap to confirm.

## Development

```bash
npm install
npm run build      # → dist/sweet-home-card.js (three.js is bundled) and dist/sweet-home-editor.js (the card editor)
npm run check      # build + module evaluation test
npm test           # check + model tests + browser tests (npx playwright install chromium once)
python3 -m http.server 8799   # then open http://127.0.0.1:8799/test/?config=demo
```

The test page uses a made-up home and records service calls instead of sending them. Add `&editor=1` to open the
card editor next to the card, with a simple stand-in for Home Assistant's form fields.

## License

MIT
