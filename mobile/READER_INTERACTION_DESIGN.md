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
