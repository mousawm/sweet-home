# Changelog

Fixes and changes collect under **Unreleased** as they land on `main`.
A release is cut once or twice a week (or on request): the Unreleased notes move under the new version heading, and those notes become the GitHub release text.

## Unreleased

### Fixed
- Room panel: white in the light look (dark glass in the dark look), and on phones the 3D view behind the open panel is dimmed and blurred so the panel stands out (light and dark looks).

### Changed

### Added

## v0.6.49 — 2026-11-22

### Fixed
- Light look: the room panel over the 3D view is frosted light glass that shows the house blurred behind it (it was a heavy dark block), with readable temperatures.
- Arabic on phones: the room panel fills the width and is centred (it shrank to its content), and slider fills start on the right with their thumb.
- Arabic: the clock's "ص" / "م" (AM / PM) was cut off at the bottom. The gradient on the clock was painted only inside its tight line box, so the part of the letter below the line disappeared.

## v0.6.48 — 2026-11-22

### Fixed

- Arabic: swiping between tabs now goes the right way. The next tab is to the left, so swipe right to open it, and the tab slides in from the left.
- Arabic: numbers with units and English option names keep their order. "-75 dBm" and "-175 kWh" no longer show as "dBm 75-" and "kWh-", and option names such as "2 hours", "30 min" or "1 Week" show as the entity has them, number first, instead of "hours 2". Weekdays are translated.
- Arabic: more texts translated: the weather condition, Energy History's Day / Week / Month / Year, the solar forecast's "Tomorrow", "still to come today" and "peak at", the AC's swing chips, "Daily limit", the picker's title, and the lock tiles' state. The greeting uses the Arabic comma.
- Arabic: the pop-up sheets (option pickers, weather, lights…) and messages are laid out right to left too: title on the right, close button on the left, options aligned to the right.
- Arabic: times such as "15 min" and "15 min ago" (motion, Needs Attention, last changed) are now in Arabic ("15 دقيقة", "قبل 15 دقيقة"). They follow the card's language through the browser's own formatting.
- Arabic on phones: the people's pictures no longer cover the clock (they move to the left), and back / forward arrows point the right way.

## v0.6.47 — 2026-11-21

### Fixed

- Light look: the water tank's level ("80.0 %") was dark navy on the blue water. It is now white on the water and dark on the empty glass above it, whatever the level. "Quality" under it is translated too.

## v0.6.46 — 2026-11-21

### Fixed

- Energy flow: a bubble now glows only while power flows through it. Before, Solar and Home always glowed (Solar even at 0 W at night) while the Grid and the devices never did. Now Solar glows while producing, the Grid while importing (blue) or exporting (green), and Home and each device while using power.
- Light look (and Sweet Home 3D in a light theme): the Lights / Climate / Presence switch had a muddy grey track and its selected option barely stood out. It now has a soft light track with the selected option on a white pill, and darker labels. The media artwork placeholder is light too.
- Arabic: about 130 texts that were always shown in English are now translated. They include panel and section titles (Energy History, Media Server, Coming Up, Library, Storage…), buttons (Show all, Reboot, Reconnect…), status words (Downloading, Importing, Stopped…), alarm states, AC modes, Home Lab gauges and the option chips. A new test checks every tab for English text left untranslated.

### Changed

- Faster loading: the card file is about 20% smaller (1.40 MB → 1.14 MB; 420 KB → 344 KB compressed). It now takes only the parts of three.js the 3D view uses, and the card editor is its own file (`sweet-home-editor.js`), downloaded only when you edit the card. Manual installs need both files next to each other.

### Added

- Several servers of the same kind are all used. **Media Server:** two Sonarr, Radarr or qBittorrent servers (for example a 4K Radarr) add up their shows, movies, wanted, speeds and torrents, and combine their queues, calendars and storage; the editor's *Found from* list says *2 servers*. **Home Lab:** with several Proxmox nodes, one chip per node switches the gauges; `homelab.node` sets the one shown first.
- The full Sweet Home dashboard has a **light look**: `appearance: light`, or `auto` to follow your Home Assistant theme (light or dark). Set it in the card editor under Look → Appearance. Panels, tabs, header and pop-ups turn light, with darker accent colours so text stays readable; the 3D view stays dark. Dark stays the default and looks the same as before.

## v0.6.45 — 2026-11-21

### Fixed

- card-mod: styles added with `card_mod:` are no longer lost when the card is edited (they were removed each time the card redrew itself, until the page was reloaded).

### Added

- Sweet Home 3D follows the dashboard theme, light or dark, like the cards around it. It is drawn inside Home Assistant's card (`ha-card`), so it takes the theme's card background, corners, border and shadow, as well as card-mod theme rules and `card_mod` `ha-card` styles. Its title, buttons and room pop-up use the theme's text colours; the 3D picture stays dark, like a camera image.
- README: a *Styling* section with the card's colour variables, the parts to style with card-mod, and examples.
- Sweet Home 3D: **room zoom**. The new `room` option (card editor → Look → *Zoom on one room*) opens the card framed on one room, on its floor, with no floor buttons. Closing a room's pop-up, or tapping the 3D / floor plan buttons, comes back to it.

## v0.6.44 — 2026-11-20

### Fixed

- Energy History: *Show all* is the first button of the legend, so it sits on the top row instead of dropping onto a line of its own when it doesn't fit after *Other*.
- Media Server: Downloads, Coming Up and Wanted no longer show empty tiles when qBittorrent, the calendars or Sonarr aren't installed.

### Added

- **Sweet Home 3D**, a new card (`custom:sweet-home-3d-card`) with only the 3D view, to place among your other cards. Tapping a room opens its controls as a pop-up over the dashboard. It resizes in Sections views, and `height` sets its size elsewhere. Its editor has the Rooms and Look steps, using the same `house` settings as the full card.
- Card editor → Panels: a **Found from** list on Energy, Media Server and Home Lab shows each integration the panel reads (Forecast.Solar, Jellyfin, JellyHA, Sonarr, Radarr, qBittorrent, Proxmox VE). Each one is marked found (with how many entities) or not found (with a hint). Found ones get an on/off switch that hides their part of the card, for example qBittorrent off hides Downloads.

## v0.6.43 — 2026-11-20

### Fixed

- 3D view: a light set as the *TV backlight* (room → lights) now glows around the room's TV. It needed a hand-written `tv_glow` position before, so picking it in the editor showed nothing. The glow follows the TV's place, size and facing; a `tv_glow` written by hand is kept.

### Added

- 3D view: the TV's screen shows a picture while the TV is on: the cover art of what's playing (from Home Assistant), else a lit screen. It fades out when the TV is off.

## v0.6.42 — 2026-11-20

### Fixed

- Security: entity names and states are always shown as text. A few places put them into the page as HTML (a pump's name on the Water card, a device's name in the Energy card's list, the TV's name in the Jellyfin sheets and every sheet's title, and a few Sonarr / qBittorrent counts), so a name containing markup could be rendered as HTML.

### Changed

- Media Server: with *Jellyfin + JellyHA*, the clients count next to Now Watching comes from JellyHA's active sessions (`sensor.jellyha_active_sessions`) instead of every connected client; with *Jellyfin* it stays `sensor.jellyfin_active_clients`. Panels → Media Server has a *Clients count* picker to choose another sensor.

### Added

- Home Lab: Panels → Home Lab has pickers for CPU, Memory, Disk, Swap, Temperature, Containers, VMs and Updates (empty: found from the Proxmox node as before), a *Show every container and VM automatically* switch (on by default) and a *Servers* list: pinned at the top while the switch is on, the only servers shown when it is off.
- Card editor: Panels → Media has pickers for the screen-time limits (watched today, daily limit, limit picker, Block and Force Unblock switches), and a new *TV light* panel picks the TV backlight and its mode / effect selectors (switching it off hides its card). Both used to need YAML.
- Card editor: Panels → Energy has an *Energy stored* picker; the chosen sensor shows as *Stored* next to Today / Month / Year on the Energy card. Not set (or the sensor is gone): no Stored box.

## v0.6.41 — 2026-11-19

### Fixed

- Room lights: a dimmable light's brightness % shows once, on its row; the extra % next to the slider is gone, and the row's % follows the slider while you drag it.

### Changed

- Energy card: Month and Year now come from Home Assistant's Energy data (like Energy History) by default, with a switch in Panels → Energy. The Month / Year sensor fields show only when the switch is off, and only then are those sensors used.

## v0.6.40 — 2026-11-19

### Fixed

- Room badges: a plug that is on (a fan, a heater, a kettle…) shows its own icon instead of a charging battery; the battery now shows only for a charger that is charging. The icon is drawn plain, like the badge's other icons (it was shown inside a tile).
- 3D doors: a door now opens to the side its arc shows on the floor plan. Doors drawn right-to-left or top-to-bottom used to open the opposite way.
- Energy card: tapping Home, Solar or Grid with no sensor of its own does nothing, instead of opening an empty "null" dialog; no tile opens a details dialog for a missing entity any more.
- Media Server: tapping a movie or an episode to play it on the TV no longer starts it on a phone that has Jellyfin open: a phone or tablet app is never picked when there is a TV to open Jellyfin on.

### Added

- Media Server: *Jellyfin integration* (Panels → Media Server): *Jellyfin* or *Jellyfin + JellyHA*. With *Jellyfin + JellyHA*, Now Watching, the client count and the Shows / Movies library come from JellyHA, and a tapped movie or episode is played on the TV through the official Jellyfin integration. Not set: Jellyfin when it is installed, else Jellyfin + JellyHA.
- Media Server: a *Quick Connect* switch (Panels → Media Server) for a TV whose Jellyfin app signs in with Quick Connect. After the card opens Jellyfin on the TV, the sheet asks you to sign in there and sends the video when you tap *I've signed in · Play*.
- Card editor: Panels → Energy has a *Current* picker; the chosen sensor is shown next to Home on the energy flow (e.g. *Home · 2.2 A*). Not set: Home shows just its power, as before.

## v0.6.39 — 2026-11-19

- Water: pump tiles show running time, power or both; turning a pump on takes 1 or 2 presses.
- Cameras: the face badge shows the recognised name or "No face", and no empty badge in the header.
- Editor: pick the face recognition sensor in the Security panel.
- Edit mode: no pencil on panels and rooms with nothing to rename.
- Rename · Devices lists every device and renames what the panel shows.
- Needs Attention: "Tap again to hide it" sits on the eye button.
- Home Lab: drag the servers to arrange them; the temperature field is labelled CPU temperature.
- Jellyfin: play on the TV with no setup, and say why when it can't.
- TV source: "Android TV Launcher" presses Home on ADB players.
