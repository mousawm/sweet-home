# Changelog

Fixes and changes collect under **Unreleased** as they land on `main`.
A release is cut once or twice a week (or on request): the Unreleased notes move under the new version heading, and those notes become the GitHub release text.

## Unreleased

### Fixed

- Room badges: a plug that is on (a fan, a heater, a kettle…) shows its own icon instead of a charging battery; the battery now shows only for a charger that is charging. The icon is drawn plain, like the badge's other icons (it was shown inside a tile).
- 3D doors: a door now opens to the side its arc shows on the floor plan. Doors drawn right-to-left or top-to-bottom used to open the opposite way.
- Energy card: tapping Home, Solar or Grid with no sensor of its own does nothing, instead of opening an empty "null" dialog; no tile opens a details dialog for a missing entity any more.
- Media Server: tapping a movie or an episode to play it on the TV no longer starts it on a phone that has Jellyfin open. A phone or tablet app is never picked when there is a TV to open Jellyfin on, and with JellyHA the video goes to the TV's own device player, not to the user player (which JellyHA sends to the user's last-used app).
- Media Server with JellyHA: a movie tapped to play on the TV now starts there. The card used to wait forever ("Home Assistant can't see it yet") because JellyHA's TV player looks the same before and after the app reopens; it is now used once the app has had a few seconds to open, and the video is sent again for about 10 s while the app is still loading.
- Media Server with JellyHA: when Jellyfin is already open and signed in on the TV, the video is sent straight to it instead of restarting the app first (a restart could bring back Jellyfin's sign-in screen and ask for a Quick Connect code). The app is restarted only if the video hasn't started within 8 s.

### Changed

### Added

- Media Server: a *Quick Connect* switch (Panels → Media Server) for a TV whose Jellyfin app signs in with Quick Connect. After the card opens Jellyfin on the TV, the sheet asks you to sign in there and sends the video when you tap *I've signed in · Play*.
- Media Server: choose the Jellyfin integration in the card editor (Panels → Media Server): Automatic, Jellyfin (official) or JellyHA. With JellyHA the card uses its players, its client count and its Movies / TV Series folders from the media browser. Automatic keeps the official one when both are installed.
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
