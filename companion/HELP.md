## Red RCP2 Camera Control

### Configuration

Type in the IP address of the RED camera. Works with all DSMC3 cameras (V-RAPTOR, V-RAPTOR XL, KOMODO, KOMODO-X). Tested primarily with RED V-RAPTOR 8K S35.

---

### v1.4.6 — What's New

This release expands parameter coverage, improves reliability, and significantly reduces CPU usage.

**Dynamic parameter discovery:** On connect the module calls `rcp_get_parameters` to get the full list of parameters the camera supports, then categorizes each as Subscribe, Poll-Only, or Skip. This handles camera-to-camera differences automatically.

**Expanded subscriptions:** Subscribed parameter set expanded from 36 to 75+ parameters, covering CDL color grading, power/battery monitoring, calibration temperatures, autofocus, GPS metadata, livestream, frame guides, project settings, pre-record, display tools (log view, false color, peaking), exposure angle/integration time, color space, roll off, media percentage/time remaining, and timecode. Previous versions required a manual generic command to get timecode — it is now subscribed automatically.

**Camera-specific parameter handling:** The module uses dynamic parameter discovery — on connect it asks the camera what it supports and subscribes accordingly. This means it works correctly across all DSMC3 models and firmware versions without hardcoded per-camera lists.

The following variables will only populate on specific cameras. All other variables in this module are supported on **all cameras** (KOMODO, KOMODO-X, V-RAPTOR, V-RAPTOR XL).

*V-RAPTOR / V-RAPTOR XL only:*
- `$(NAME:record_format_rect_sdi2)` — SDI 2 format rect (V-RAPTOR has dual SDI outputs)
- `$(NAME:lut_sdi2_enabled)` — SDI 2 LUT enabled state
- `$(NAME:lut_sdi2)` — SDI 2 applied LUT
- `$(NAME:sdi2_freq)` — SDI 2 monitor frequency
- `$(NAME:cal_status_temp)` / `$(NAME:cal_current_temp)` — AUX temperature sensor
- Broadcast color space and EOTF variables (broadcast monitoring controls)

*Not confirmed in support matrix (may work on all cameras — unverified):*
- `$(NAME:tally_thickness)` — tally border thickness
- `$(NAME:camera_position)` — camera position letter

**Reliability fixes:**
- Fixed `SENSOR_FRAME_RATE` showing wrong values for drop-frame rates — RED reports rates in milliHz internally (e.g. `24000` = 23.976 fps). The module now uses the camera's own display string instead of converting the raw integer
- Fixed `rcp_cur_parameters` response being silently dropped
- Removed phantom media parameters that don't exist in the RCP2 database (`MEDIA_FREE`, `MEDIA_USED`, `MEDIA_MINUTES_REMAINING`) — replaced with confirmed equivalents

**CPU optimizations:**

These changes keep CPU load flat and avoid large spikes during connect or heartbeat cycles:

- *Proxy-based variable batching:* `this.variables` is now a JavaScript Proxy that intercepts every write, skips unchanged values, and flushes all dirty variables in a single `setVariableValues()` call per event loop tick. Previously `setVariableValues` was called on every incoming WebSocket message regardless of whether anything changed
- *Implicit subscription fix:* `rcp_get` silently creates a persistent push subscription on the camera. Poll-only parameters now immediately send `rcp_subscribe on_off:false` to cancel the implicit subscription — without this, hundreds of phantom subscriptions accumulated per session
- *Staggered connect burst:* ~900 poll-only parameters are fetched in batches of 5 every 500ms, spreading the initial fetch over ~90 seconds instead of blasting all at once. Subscribed parameters (record state, ISO, tally, timecode, etc.) are live immediately
- *Staggered heartbeat:* The 30-second heartbeat sends 3 parameters every 500ms (~5.5 seconds spread) instead of all 33 at once
- *`setVariableDefinitions` caching:* Only called when genuinely new dynamic variables are discovered, not on every reconnect
- *Process naming:* The module now shows as `RED RCP2` in task managers and `ps` instead of `node`

---

### Available Actions

#### Recording Control
- Start Recording
- Stop Recording
- Toggle Recording

#### Camera Settings
- Set ISO (100–25600, full 1/3-stop range)
- Set Record Format (Sensor Crop)
- Set Sensor Frame Rate
- Set White Balance (2000K–10000K)
- Set Tint
- Set Exposure Adjust (Static)
- Increase Exposure Adjust
- Decrease Exposure Adjust
- Set Aperture (T-stop)
- Set ND Filter
- Set Record Mode (Normal, Timelapse, etc.)

#### Camera Identification
- Set Camera ID
- Set Reel Number
- Set Camera Position (A-Z)

#### LUT Control
- Toggle LUT on SDI 1 / SDI 2
- Enable LUT on SDI 1 / SDI 2
- Disable LUT on SDI 1 / SDI 2

#### Tally Control
- Set External Monitor Tally State (Off / Tally 1 / 2 / 3)
- Enable / Disable / Toggle Camera Body Tally LED
- Set Tally 1 / 2 / 3 Color
- Set Tally Opacity (25% / 50% / 75% / 100%)
- Set Tally Style (Solid / Dashed / Bracket)
- Set Tally Thickness (Small / Medium / Large)

#### System
- Shutdown Camera (requires confirmation checkbox)
- Send Generic Command (raw RCP2 JSON)

The Send Generic Command action accepts any valid RCP2 JSON object. Example:

```json
{"type":"rcp_set","id":"ISO","value":800}
```

---

### Available Variables

#### Connection State
| Variable | Description |
|---|---|
| `$(NAME:connected)` | Connection state ("Connected", "Connecting", or "Disconnected") |

#### Image Settings
| Variable | Description |
|---|---|
| `$(NAME:iso)` | ISO |
| `$(NAME:white_balance)` | White Balance (Kelvin) |
| `$(NAME:tint)` | Tint |
| `$(NAME:shutter)` | Shutter speed / angle |
| `$(NAME:aperture)` | Iris Aperture (T-stop) |
| `$(NAME:exposure_adjust)` | Exposure Adjust |
| `$(NAME:nd)` | ND Filter |
| `$(NAME:fps)` | Sensor Frame Rate |

#### Recording
| Variable | Description |
|---|---|
| `$(NAME:recording)` | Recording State (Recording / Idle) |
| `$(NAME:record_duration)` | Current Clip Duration (HH:MM:SS) |
| `$(NAME:record_format)` | Record Format |
| `$(NAME:record_codec)` | Recording Codec (R3D / ProRes) |
| `$(NAME:record_mode)` | Record Mode |

#### LUT
| Variable | Description |
|---|---|
| `$(NAME:lut_project)` | Project/Camera LUT |
| `$(NAME:lut_sdi1)` | LUT on SDI 1 Output |
| `$(NAME:lut_sdi2)` | LUT on SDI 2 Output |
| `$(NAME:lut_top_lcd)` | Top LCD LUT |
| `$(NAME:lut_sdi1_enabled)` | SDI 1 LUT Enabled (On/Off) |
| `$(NAME:lut_sdi2_enabled)` | SDI 2 LUT Enabled (On/Off) |

#### Output
| Variable | Description |
|---|---|
| `$(NAME:sdi_freq)` | SDI Output Frequency |

#### Camera Identification
| Variable | Description |
|---|---|
| `$(NAME:camera_id)` | Camera ID string |
| `$(NAME:camera_pin)` | Camera PIN |
| `$(NAME:camera_position)` | Camera Position (A-Z) |
| `$(NAME:reel_number)` | Current Reel Number |
| `$(NAME:clip_name)` | Next Clip Name |
| `$(NAME:total_clips)` | Total Clips on Media |

#### Media
| Variable | Description |
|---|---|
| `$(NAME:media_remaining_min)` | Remaining Time (minutes) |
| `$(NAME:media_remaining_time)` | Remaining Time (HH:MM:SS) |
| `$(NAME:media_capacity_min)` | Total Capacity (minutes) |
| `$(NAME:media_free_space)` | Free Space |
| `$(NAME:media_used_space)` | Used Space |

#### Camera Info
| Variable | Description |
|---|---|
| `$(NAME:camera_name)` | Camera Name |
| `$(NAME:camera_type)` | Camera Model |
| `$(NAME:serial_number)` | Serial Number |
| `$(NAME:firmware_version)` | Firmware Version |
| `$(NAME:camera_runtime)` | Camera Runtime (hours) |

#### Power / Battery
| Variable | Description |
|---|---|
| `$(NAME:power_voltage)` | Input Voltage |
| `$(NAME:power_current)` | Input Current |
| `$(NAME:power_percent)` | Battery Percentage |
| `$(NAME:power_runtime)` | Estimated Runtime |
| `$(NAME:power_state)` | Power State |
| `$(NAME:power_present)` | Power Present |
| `$(NAME:power_valid)` | Power Valid |
| `$(NAME:power_type)` | Power Input Type |

#### Timecode
| Variable | Description |
|---|---|
| `$(NAME:timecode)` | Current Timecode |
| `$(NAME:timecode_display_mode)` | Timecode Display Mode |

#### Tally (External USB-C Monitor — all cameras)
| Variable | Description |
|---|---|
| `$(NAME:tally_state)` | External Monitor Tally State |
| `$(NAME:tally_1_color)` | Tally 1 Color |
| `$(NAME:tally_2_color)` | Tally 2 Color |
| `$(NAME:tally_3_color)` | Tally 3 Color |
| `$(NAME:tally_opacity)` | Tally Opacity |
| `$(NAME:tally_style)` | Tally Style |
| `$(NAME:tally_thickness)` | Tally Thickness (Small/Medium/Large) |
| `$(NAME:tally_led_enable)` | Camera Body Tally LED (all cameras) |

#### CDL Color Grading
| Variable | Description |
|---|---|
| `$(NAME:cdl_slope_r)` | CDL Slope Red |
| `$(NAME:cdl_slope_g)` | CDL Slope Green |
| `$(NAME:cdl_slope_b)` | CDL Slope Blue |
| `$(NAME:cdl_offset_r)` | CDL Offset Red |
| `$(NAME:cdl_offset_g)` | CDL Offset Green |
| `$(NAME:cdl_offset_b)` | CDL Offset Blue |
| `$(NAME:cdl_power_r)` | CDL Power Red |
| `$(NAME:cdl_power_g)` | CDL Power Green |
| `$(NAME:cdl_power_b)` | CDL Power Blue |
| `$(NAME:cdl_saturation)` | CDL Saturation |

#### Color
| Variable | Description |
|---|---|
| `$(NAME:color_space)` | Color Space |
| `$(NAME:roll_off)` | Roll Off |

#### Display Tools
| Variable | Description |
|---|---|
| `$(NAME:log_view)` | Log View Enabled |
| `$(NAME:false_color)` | False Color Enabled |
| `$(NAME:peaking)` | Peaking Enabled |

#### Calibration
| Variable | Description |
|---|---|
| `$(NAME:cal_status_temp)` | Calibration Status Temperature |
| `$(NAME:cal_current_temp)` | Current Calibration Temperature |

#### Autofocus
| Variable | Description |
|---|---|
| `$(NAME:af_state)` | Autofocus State |

> Additional variables are registered automatically based on what your specific camera supports. They appear in Companion's variable picker after the first connection and populate gradually over approximately 90 seconds.

---

### Heartbeat Polling (30-second interval)

The following parameters change continuously during a shoot (voltage fluctuating, temperatures drifting, etc.) and are intentionally not subscribed — push subscriptions on these would flood the connection with constant updates. Instead they are polled every 30 seconds as a reasonable sample rate for monitoring purposes.

- **Power/Battery:** Voltage, current, percent, runtime, state, present, valid, type, low-power warning, info string
- **Temperatures:** AUX, IOB, Level, PCM, PL, PS, SB board sensors
- **Media:** Percentage remaining, time remaining, clip count, capacity
- **Network:** WiFi status, WiFi signal strength, WiFi IP, wired network status, USB-C status
- **USB-C Media:** Media name, media status
- **Sync:** Sync source, sync state
- **Calibration:** Status temperature, current calibration temperature
- **Camera Runtime:** Total operating hours

---

### Protocol Notes

- Communicates via RCP2 (RED Command Protocol 2) JSON/WebSocket on port **9998**
- Maximum 8 simultaneous WebSocket connections per camera; 1 per application recommended
- `rcp_get` implicitly creates a push subscription on the camera — the module always follows poll-only requests with `rcp_subscribe on_off:false` to prevent phantom subscription buildup
- `TIMECODE_HIGH_FREQUENCY` is intentionally skipped — it fires at frame rate (24–120fps) and would flood the connection
- `AUDIO_VU_DATA` and `HISTOGRAM` are intentionally skipped — continuous streaming data with no useful state to track
