# SaltWatch Card

**A purpose-built Home Assistant card for seeing your estimated water-softener
salt level as a physical, granular tank.**

SaltWatch Card turns a percentage sensor into a granular brine-tank
visualization. The salt surface moves with the measured level, stays uneven so
it reads as salt rather than liquid, and includes a precise scale and visible
low-salt threshold.

The card intentionally focuses on the visualization Home Assistant does not
already provide. Use native Tile and Statistics Graph cards for controls,
forecast, distance, and history.

The card is designed for [SaltWatch](https://github.com/thomasgregg/saltwatch)
but works with any numeric percentage sensor.

![SaltWatch Card showing a detailed granular tank at 62 percent](images/saltwatch-card.png)

> [!IMPORTANT]
> The card visualizes the value supplied by the selected entity. SaltWatch's
> value is an **estimated percentage of the calibrated vertical range**, not a
> direct measurement of salt mass or volume.

## Current status

SaltWatch Card is under active initial development. The focused tank card,
graphical editor, responsive layout, and explicit unavailable states are
implemented. The first tagged HACS release will follow device testing in Home
Assistant.

## Features

- Bright, realistically scaled compressed salt tablets with an uneven top surface
- Detailed molded tank, lid, window, base, and material shading
- Major, medium, and minor percentage scale ticks
- Exact 0–100% vertical positioning from the selected entity
- Dynamic low-salt threshold marker
- `Good`, `Low Salt`, `Calibration Required`, and `Sensor Fault` states
- Explicit `No current reading` presentation instead of a frozen old level
- Responsive desktop, tablet, and narrow dashboard layouts
- Home Assistant card-picker registration and graphical configuration form
- Keyboard-accessible more-info action
- No recorder calls or duplicate chart/control implementations

## Development preview

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/demo/`. The preview controls simulate level, low
salt, sensor fault, and calibration states.

## Build and test

```bash
npm run check
```

The production file is written to `dist/saltwatch-card.js`, matching the
filename required for this HACS dashboard repository.

## Installation during development

Until the first release, build the card and copy `dist/saltwatch-card.js` to
Home Assistant's `/config/www/saltwatch-card/` directory. Add it under
**Settings → Dashboards → Resources**:

```text
/local/saltwatch-card/saltwatch-card.js
```

Select **JavaScript module**, reload the browser, then choose **SaltWatch Card**
from the dashboard card picker.

## Configuration

```yaml
type: custom:saltwatch-card
entity: sensor.saltwatch_salt_level
status_entity: sensor.saltwatch_salt_status
threshold_entity: number.saltwatch_low_salt_threshold
```

Only `entity` is required.

| Option | Description | Default |
| --- | --- | --- |
| `entity` | Percentage sensor controlling the salt surface | Required |
| `name` | Card heading | `SaltWatch` |
| `show_header` | Show the card title; status remains visible | `true` |
| `status_entity` | Text status such as `Good` or `Sensor Fault` | Derived from level |
| `threshold_entity` | Number entity controlling the low marker | None |
| `low_threshold` | Marker used when no threshold entity is supplied | `20` |

Hide the card title while keeping the status indicator with:

```yaml
show_header: false
```

## Recommended native dashboard composition

Keep SaltWatch Card focused on the tank and let Home Assistant render the
controls, supporting sensor values, and history. This preserves native theming,
editing, actions, accessibility, and recorder behavior.

```yaml
type: vertical-stack
cards:
  - type: custom:saltwatch-card
    entity: sensor.saltwatch_salt_level
    status_entity: sensor.saltwatch_salt_status
    threshold_entity: number.saltwatch_low_salt_threshold

  - type: grid
    columns: 3
    square: false
    cards:
      - type: tile
        entity: number.saltwatch_low_salt_threshold
        name: Low salt threshold
        features:
          - type: numeric-input
            style: slider

      - type: tile
        entity: sensor.saltwatch_estimated_days_until_low_salt
        name: Until low salt

      - type: tile
        entity: sensor.saltwatch_distance_to_salt
        name: Distance to salt

  - type: statistics-graph
    entities:
      - entity: sensor.saltwatch_salt_level
        name: Salt level
        color: "#f2ae32"
    days_to_show: 14
    period: hour
    chart_type: line
    stat_types:
      - mean
    min_y_axis: 0
    max_y_axis: 100
    hide_legend: true
```

SaltWatch's percentage sensor has `state_class: measurement`, so Home
Assistant can retain and graph its long-term statistics. For exact recorder
states instead of hourly statistics, use a native `history-graph` card with
`hours_to_show: 336`.

## Failure behavior

An unavailable, unknown, or non-numeric main entity removes the salt fill and
shows a hatched tank. The card never keeps rendering an old percentage as if it
were current. A configured Salt Status entity distinguishes sensor failure from
required calibration.

## License

[MIT](LICENSE)
