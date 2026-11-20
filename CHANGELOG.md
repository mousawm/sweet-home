# Changelog

Fixes and changes collect under **Unreleased** as they land on `main`.
A release is cut once or twice a week (or on request): the Unreleased notes move under the new version heading, and those notes become the GitHub release text.

## Unreleased

### Fixed

### Changed

### Added

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
