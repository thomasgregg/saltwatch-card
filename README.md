# SaltWatch Card

**A purpose-built Home Assistant card for seeing your estimated water-softener
salt level, health, and refill forecast at a glance.**

SaltWatch Card turns a percentage sensor into a granular brine-tank
visualization. The salt surface moves with the measured level, stays subtly
uneven so it reads as salt rather than liquid, and includes a visible low-salt
threshold. Optional SaltWatch entities add status, distance, forecast, and real
Home Assistant history.

The card is designed for [SaltWatch](https://github.com/thomasgregg/saltwatch)
but works with any numeric percentage sensor.

![SaltWatch Card showing a granular tank at 62 percent with forecast and history](images/saltwatch-card.png)

> [!IMPORTANT]
> The card visualizes the value supplied by the selected entity. SaltWatch's
> value is an **estimated percentage of the calibrated vertical range**, not a
> direct measurement of salt mass or volume.

## Current status

SaltWatch Card is under active initial development. The card, graphical editor,
responsive layout, real history sparkline, and explicit unavailable states are
implemented. The first tagged HACS release will follow device testing in Home
Assistant.

## Features

- Granular salt fill with a gently uneven top surface
- Exact 0–100% vertical positioning from the selected entity
- Dynamic low-salt threshold marker
- `Good`, `Low Salt`, `Calibration Required`, and `Sensor Fault` states
- Explicit `No current reading` presentation instead of a frozen old level
- Optional days-until-low forecast and distance measurement
- Real recorder history with refill jumps; no fabricated chart data
- Responsive desktop, tablet, and narrow dashboard layouts
- Home Assistant card-picker registration and graphical configuration form
- Keyboard-accessible more-info action

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
forecast_entity: sensor.saltwatch_estimated_days_until_low_salt
distance_entity: sensor.saltwatch_distance_to_salt
show_history: true
history_hours: 336
```

Only `entity` is required.

| Option | Description | Default |
| --- | --- | --- |
| `entity` | Percentage sensor controlling the salt surface | Required |
| `name` | Card heading | `SaltWatch` |
| `status_entity` | Text status such as `Good` or `Sensor Fault` | Derived from level |
| `threshold_entity` | Number entity controlling the low marker | None |
| `forecast_entity` | Numeric estimated days until low salt | None |
| `distance_entity` | Numeric lid-to-salt distance sensor | None |
| `low_threshold` | Marker used when no threshold entity is supplied | `20` |
| `show_history` | Load and show actual Home Assistant recorder history | `true` |
| `history_hours` | Recorder history window, 24–720 hours | `336` |

## Failure behavior

An unavailable, unknown, or non-numeric main entity removes the salt fill and
shows a hatched tank. The card never keeps rendering an old percentage as if it
were current. A configured Salt Status entity distinguishes sensor failure from
required calibration.

## License

[MIT](LICENSE)
