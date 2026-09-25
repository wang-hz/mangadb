# Reader Interaction Decisions

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
  recent reading pops back to that tab. Missing list history falls back to the
  manga library. The ordinary reader back button retains its existing behavior.
- Tabs are ordered `继续阅读`, `漫画`, `标签`, `设置`; startup still opens `漫画`.
  Recent reading lists unfinished, non-hidden local records for the current
  account and server. Downloads live under Settings, alongside account/server,
  reading preferences, and diagnostics; download preferences are a further
  subpage of Downloads.
