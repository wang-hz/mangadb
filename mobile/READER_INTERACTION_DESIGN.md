# Reader Interaction Decisions

## Floating reading controls

- Both modes share a dark floating header and bottom panel inside the safe area.
  The bottom panel holds progress, numeric page jump, thumbnails, and mode selection.
  Paged mode also exposes previous/next buttons; controls have 44-point touch targets.
- The panel scrolls vertically when space is limited, including at the last page.
  Reader settings and page jump use the same dark palette. Settings show the current
  reading mode; selecting a mode there also updates the saved device default, with
  rollback to the prior active mode if saving fails.
- Thumbnails are collapsed on entry. Opening them centers the current page in a
  virtualized horizontal list. Selecting a thumbnail jumps through the reader's
  existing navigation path, resets zoom, and leaves the list open.
- Paged RTL reverses thumbnails and the progress track while retaining logical
  page indices for storage and accessibility. Scrolling uses increasing page order.
- Online thumbnails use the authenticated `thumb=1` endpoint and existing cache
  identity. Downloads use local files, never a network fallback. Failed or missing
  thumbnails retain a selectable page-number placeholder.
- Expanding thumbnails or interacting with progress pauses auto-hide. Closing the
  list restarts the configured timeout. Settings, mode changes, viewport epochs,
  and backgrounding dismiss thumbnails. The expanded state is not persisted.

## Image gestures

- The reader uses the Expo SDK 55-compatible Gesture Handler, Reanimated, and
  Worklets versions.
- Pinch zoom is bounded from 1× to 4×. One-finger image panning is enabled only
  after zooming.
- While an image is zoomed, the parent horizontal or vertical list is disabled.
  Resetting to fit re-enables normal page navigation.
- Double tap can be disabled or configured to toggle between fit and 2×/3×. A
  visible 44×44 reset control and accessibility increment/decrement actions
  provide non-gesture alternatives.
- Zoom animation duration becomes zero when the operating system requests
  reduced motion.
- Custom touch gestures are disabled while a screen reader is active. Labeled
  image actions and the reader's existing navigation controls remain available.

## Reading brightness

The app offers an opt-in, reader-only dimmer with system, soft, and night
levels. It overlays only manga pages, keeps controls legible, and does not
request brightness permission or change the device's system brightness. This
avoids leaving the device at an unexpected brightness after a crash or forced
termination.

## Android volume-key paging

Volume-key paging is deferred. Expo and React Native do not expose a supported
JavaScript volume-key event for this SDK. Implementing it would require custom
native interception and decisions about whether the app may consume or restore
system volume changes. It can also conflict with TalkBack and users who expect
the physical keys to control media or accessibility volume.

Reconsider this only behind a default-off preference after a maintained native
implementation is selected and physical Android testing covers:

- short and long presses without changing system volume;
- background/foreground listener cleanup;
- TalkBack and media playback behavior;
- key-repeat paging bounds and zoom-state conflicts.

## Completion and navigation

- In both reading modes, iOS back navigation uses the native left-edge gesture.
  Full-screen back gestures are explicitly disabled for the reader, including
  on iOS 26, to avoid accidental exits while reading or scrolling.
- Reaching the last active page automatically saves completion in both reading
  modes. Rendering a virtualized footer alone does not complete a manga.
- Completion waits for earlier position writes. Rereading waits for an ongoing
  completion write, then saves page zero with `reading` state before remounting
  the page list. A one-page reread stays in progress for that reading visit.
- The completion panel offers, in order, `从头重读`, `返回漫画`, and `返回列表`.
  Failed saves remain visible and return actions retry before navigating.
- `返回漫画` pops to the adjacent current-manga detail, or replaces a directly
  opened reader with that detail. `返回列表` pops both the reader and adjacent
  detail to preserve the original list's state. A reader opened directly from
  reading history pops back to that tab. Missing list history falls back to the
  manga library. The ordinary reader back button retains its existing behavior.
- Tabs are ordered `漫画`, `标签`, `历史记录`, `设置`, with `漫画` opening at startup.
  Reading history lists up to 100 visible reading and completed records for the
  current account and server, newest first. Downloads live under Settings,
  alongside account/server, reading preferences, and diagnostics; download
  preferences are a further subpage of Downloads.
