# SaltWatch Card

Visualize your water-softener salt level as a detailed tablet-filled tank, or
switch to a compact view of the current level, refill forecast, and health
status. SaltWatch Card follows your active Home Assistant light, dark, or custom
theme and adapts to desktop and mobile dashboards.

![SaltWatch Card complete view showing salt level, refill forecast, status, and low marker](https://raw.githubusercontent.com/thomasgregg/saltwatch-card/main/images/saltwatch-card-complete.png)

## Choose the view that fits your dashboard

### Tank only

A focused visual gauge with the percentage scale and configurable low marker.

### Details only

Current salt level, estimated days until low salt, and device health in one
compact card. While the forecast is still learning or temporarily blocked, the
card shows a concise reason or progress such as `4 of 7 days collected`.

## Configure visually

<p align="center">
  <img src="https://raw.githubusercontent.com/thomasgregg/saltwatch-card/main/images/saltwatch-card-editor.png" alt="SaltWatch Card graphical editor with automatic entity detection, organized settings, and live preview" width="58%">
</p>

SaltWatch Card lists complete SaltWatch devices and resolves their entities
through Home Assistant's device registry. Renaming entities or installing a
second SaltWatch does not create ambiguous pairings. Layout, value, and
visibility choices stay easy to find, while tap, hold, and double-tap behavior
has its own **Actions** section.

The latest official SaltWatch firmware is required. Missing, duplicate, or
disabled card entities are reported explicitly rather than guessed from entity
names.

## Responsive dashboard sizing

The card uses automatic height by default. In a Sections dashboard, the Layout
editor keeps each view at a readable minimum:

| Selected content | Minimum grid size |
| --- | --- |
| Complete card (tank and details) | 6 columns × 4 rows |
| Tank only | 3 columns × 3 rows |
| Details with one value | 3 columns × 2 rows |
| Details with level and forecast | 6 columns × 2 rows |

Changing the selected content or displayed values updates these resizing
limits automatically, preventing clipped or overlapping layouts.

See the repository README for installation, configuration, and all available
display options.
