# Changelog

Fixes and changes collect under **Unreleased** as they land on `main`.
A release is cut once or twice a week (or on request): the Unreleased notes move under the new version heading, and those notes become the GitHub release text.

## Unreleased

### Fixed

### Changed

### Added

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
