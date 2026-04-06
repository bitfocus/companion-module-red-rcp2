# companion-module-red-rcp2

Control RED DSMC3 cameras (V-RAPTOR, V-RAPTOR XL, KOMODO, KOMODO-X) via the RCP2 WebSocket protocol from Bitfocus Companion.

Based on the RED RCP2 API Protocol documentation. Developed for use with Bitfocus Companion.

---

## Configuration

Enter the IP address of your RED camera. The module connects automatically via WebSocket on port **9998**. Works with all DSMC3 cameras.

---

## Available Actions

| Action | Description |
|---|---|
| Start / Stop / Toggle Recording | Control recording state |
| Set ISO | Set camera ISO (100–25600) |
| Set Record Format | Set sensor crop / record format |
| Set Sensor Frame Rate | Set recording frame rate |
| Set White Balance | Set color temperature (2000K–10000K) |
| Set Tint | Set tint value |
| Set Exposure Adjust (Static) | Set fixed exposure compensation |
| Increase / Decrease Exposure Adjust | Relative EV steps |
| Set Aperture | Set iris aperture (T-stop) |
| Set ND Filter | Set ND filter value |
| Set Record Mode | Normal, Timelapse, etc. |
| Set Camera ID | Set camera identifier string |
| Set Reel Number | Set current reel number |
| Set Camera Position | Set camera position letter (A–Z) |
| Toggle / Enable / Disable LUT SDI 1 | Control SDI 1 LUT enable state |
| Toggle / Enable / Disable LUT SDI 2 | Control SDI 2 LUT enable state |
| Set External Monitor Tally State | Off / Tally 1 / 2 / 3 |
| Enable / Disable / Toggle Tally LED | Camera body tally LED (all cameras) |
| Set Tally 1 / 2 / 3 Color | Set tally colors |
| Set Tally Opacity | 25% / 50% / 75% / 100% |
| Set Tally Style | Solid / Dashed / Bracket |
| Set Tally Thickness | Small / Medium / Large |
| Camera Shutdown | Remotely power off camera |
| Send Generic RCP2 Command | Send any raw RCP2 JSON command |

The Send Generic Command action accepts any valid RCP2 JSON object. Example:

```json
{"type":"rcp_set","id":"ISO","value":800}
```

---

## Camera Compatibility

The module uses dynamic parameter discovery — on connect it asks the camera what it supports and only subscribes to what it reports back. This means it works correctly across all DSMC3 models and firmware versions automatically.

**96 of the parameters in this module are supported on all cameras** (KOMODO, KOMODO-X, V-RAPTOR, V-RAPTOR XL).

The following are exceptions based on the RCP2 support matrix:

### V-RAPTOR / V-RAPTOR XL only

| Parameter | Reason |
|---|---|
| SDI 2 LUT, SDI 2 LUT enabled, SDI 2 format rect, SDI 2 monitor frequency | V-RAPTOR has dual SDI outputs; KOMODO and KOMODO-X have one |
| `TEMPERATURE_AUX` | Additional temperature sensor not present on KOMODO/KOMODO-X |
| Broadcast color space and EOTF (SDI 1/2) | Broadcast monitoring controls exclusive to V-RAPTOR |

### Not confirmed in support matrix

The following parameters are used in the module but do not appear in the RCP2 support matrix. They may work on all cameras — unverified:

- `EXTERNAL_TALLY_THICKNESS` — tally border thickness
- `CAMERA_POSITION` — camera position letter (A–Z)
- `CLIP_COUNT` — total clips on media
- `REEL_NUMBER` — current reel number
- `MONITOR_FREQUENCY_SDI_2` — SDI 2 monitor frequency

### No KOMODO-X exclusive parameters

There are no parameters in this module that are exclusive to KOMODO-X. Everything supported on KOMODO-X is either also on KOMODO, or is V-RAPTOR only.

---

## Available Variables

### Connection State
| Variable | Description |
|---|---|
| `$(NAME:connected)` | Connection state ("Connected", "Connecting", or "Disconnected") |

### Image Settings
| Variable | Description |
|---|---|
| `$(NAME:iso)` | ISO |
| `$(NAME:white_balance)` | White Balance (Kelvin) |
| `$(NAME:tint)` | Tint |
| `$(NAME:shutter)` | Shutter speed / angle |
| `$(NAME:aperture)` | Iris Aperture (T-stop) |
| `$(NAME:exposure_adjust)` | Exposure compensation |
| `$(NAME:nd)` | ND Filter |
| `$(NAME:fps)` | Sensor Frame Rate |

### Recording
| Variable | Description |
|---|---|
| `$(NAME:recording)` | Recording state ("Recording" or "Idle") |
| `$(NAME:record_duration)` | Clip duration (HH:MM:SS) |
| `$(NAME:record_format)` | Record format string |
| `$(NAME:record_codec)` | Codec ("R3D" or "ProRes") |
| `$(NAME:record_mode)` | Record mode |

### LUT
| Variable | Description |
|---|---|
| `$(NAME:lut_project)` | Project / Camera LUT |
| `$(NAME:lut_sdi1)` | LUT on SDI 1 output |
| `$(NAME:lut_sdi2)` | LUT on SDI 2 output |
| `$(NAME:lut_top_lcd)` | Top LCD LUT |
| `$(NAME:lut_sdi1_enabled)` | SDI 1 LUT on/off |
| `$(NAME:lut_sdi2_enabled)` | SDI 2 LUT on/off |

### Output
| Variable | Description |
|---|---|
| `$(NAME:sdi_freq)` | SDI output frequency |

### Camera Identification
| Variable | Description |
|---|---|
| `$(NAME:camera_id)` | Camera ID string |
| `$(NAME:camera_pin)` | Camera PIN |
| `$(NAME:camera_position)` | Camera position letter (A–Z) |
| `$(NAME:camera_name)` | Camera name |
| `$(NAME:camera_type)` | Camera model type |
| `$(NAME:serial_number)` | Serial number |
| `$(NAME:firmware_version)` | Firmware version |
| `$(NAME:camera_runtime)` | Camera runtime (hours) |
| `$(NAME:reel_number)` | Current reel number |
| `$(NAME:clip_name)` | Next clip name |
| `$(NAME:total_clips)` | Total clips on media |

### Media
| Variable | Description |
|---|---|
| `$(NAME:media_remaining_min)` | Remaining recording time (minutes) |
| `$(NAME:media_remaining_time)` | Remaining recording time (HH:MM:SS) |
| `$(NAME:media_capacity_min)` | Total media capacity (minutes) |
| `$(NAME:media_free_space)` | Free space on media |
| `$(NAME:media_used_space)` | Used space on media |

### Power / Battery
| Variable | Description |
|---|---|
| `$(NAME:power_voltage)` | Input voltage |
| `$(NAME:power_current)` | Input current |
| `$(NAME:power_percent)` | Battery percentage |
| `$(NAME:power_runtime)` | Estimated battery runtime |
| `$(NAME:power_state)` | Power state |
| `$(NAME:power_present)` | Power present |
| `$(NAME:power_valid)` | Power valid |
| `$(NAME:power_type)` | Power input type |

### Timecode
| Variable | Description |
|---|---|
| `$(NAME:timecode)` | Current timecode |
| `$(NAME:timecode_display_mode)` | Timecode display mode |

### Tally (External USB-C Monitor — all cameras)
| Variable | Description |
|---|---|
| `$(NAME:tally_state)` | External monitor tally state |
| `$(NAME:tally_1_color)` | Tally 1 color |
| `$(NAME:tally_2_color)` | Tally 2 color |
| `$(NAME:tally_3_color)` | Tally 3 color |
| `$(NAME:tally_opacity)` | Tally opacity |
| `$(NAME:tally_style)` | Tally style |
| `$(NAME:tally_thickness)` | Tally Thickness (Small/Medium/Large) |
| `$(NAME:tally_led_enable)` | Camera body tally LED (all cameras) |

### CDL Color Grading
| Variable | Description |
|---|---|
| `$(NAME:cdl_slope_r/g/b)` | CDL Slope per channel |
| `$(NAME:cdl_offset_r/g/b)` | CDL Offset per channel |
| `$(NAME:cdl_power_r/g/b)` | CDL Power per channel |
| `$(NAME:cdl_saturation)` | CDL Saturation |

### Color
| Variable | Description |
|---|---|
| `$(NAME:color_space)` | Color space |
| `$(NAME:roll_off)` | Roll off |

### Display Tools
| Variable | Description |
|---|---|
| `$(NAME:log_view)` | Log View enabled |
| `$(NAME:false_color)` | False Color enabled |
| `$(NAME:peaking)` | Peaking enabled |

### Calibration
| Variable | Description |
|---|---|
| `$(NAME:cal_status_temp)` | Calibration status temperature |
| `$(NAME:cal_current_temp)` | Current calibration temperature |

### Autofocus
| Variable | Description |
|---|---|
| `$(NAME:af_state)` | Autofocus state |

> Additional variables are registered automatically based on what parameters your specific camera supports. They appear in Companion's variable picker after the first connection.

---

## Changelog

### v1.4.8

Maintenance release addressing Bitfocus code review feedback.

**Upgrade script:** Existing buttons using old action IDs (`start_record`, `stop_record`, `toggle_record`) are automatically migrated to the current names on load.

**Bug fixes:**
- WebSocket errors now correctly report `ConnectionFailure` status
- Stagger timers properly cleaned up on destroy/disconnect
- `Set ISO` and `Set Sensor Frame Rate` now ignore invalid (NaN) input
- LUT subscribe parameter IDs corrected — `lut_sdi1_enabled` / `lut_sdi2_enabled` variables now populate correctly

**Code structure:** Split into `src/` modules per Bitfocus standards (`actions.js`, `feedbacks.js`, `variables.js`, `upgrades.js`).

---

### v1.4.6

**Connection state variable**
`$(NAME:connected)` — reflects the WebSocket state in real time: `Connecting` when initiating, `Connected` on open, `Disconnected` on close. Driven directly by WebSocket events with zero polling overhead. Use this on buttons to show camera online/offline status at a glance.

**Dynamic parameter discovery**
The module calls `rcp_get_parameters` on connect to get the full supported parameter list from the camera. Each parameter is automatically categorized as Subscribe, Poll-Only, or Skip, handling camera-to-camera differences without a hardcoded list.

**Expanded subscriptions (36 → 75+ parameters)**
New subscribed categories: CDL color grading (10 params), power/battery monitoring (10 params), calibration temperatures, autofocus state, GPS metadata, livestream rect, frame guide color, project frame rate, camera preset list, pre-record frames/start, record mode, timelapse interval, R3D quality, display tools (log view, false color, peaking, magnify), exposure angle/integration time, color space, roll off, media percentage/time remaining, timecode (now subscribed automatically — previously required a manual generic command), timecode state/source/auto-jam/display-mode.

**V-RAPTOR auto-detection**
V-RAPTOR-specific parameters (`APPLIED_CAMERA_LUT_SDI_2`, `RECORD_FORMAT_RECT_SDI_2`) are only subscribed when a V-RAPTOR or V-RAPTOR XL is detected.

**CPU optimizations**
- Proxy-based variable batching: writes to `this.variables` are intercepted, change-checked, and flushed in a single `setVariableValues()` call per event loop tick via `setImmediate`
- Implicit subscription fix: `rcp_get` silently creates a push subscription on the camera — poll-only params now immediately cancel it with `rcp_subscribe on_off:false`
- Staggered connect burst: ~900 poll-only params fetched in batches of 5 every 500ms (~90 seconds), preventing the CPU spike on connect
- Staggered heartbeat: 30-second heartbeat sends 3 params every 500ms (~5.5 seconds spread)
- `setVariableDefinitions` caching: only called when new dynamic variables are discovered
- `process.title = 'RED RCP2'`: process shows as `RED RCP2` in task managers instead of `node`

**Bug fixes**
- Fixed `SENSOR_FRAME_RATE` showing wrong values for drop-frame rates — now uses the camera's own display string instead of converting the raw milliHz integer
- Fixed `rcp_cur_parameters` response being silently dropped in the WebSocket message router
- Removed phantom media parameters that don't exist in the RCP2 database (`MEDIA_FREE`, `MEDIA_USED`, `MEDIA_MINUTES_REMAINING`) — replaced with confirmed equivalents (`MEDIA_PERCENTAGE_REMAINING`, `MEDIA_TIME_REMAINING`, `MEDIA_CLIP_COUNT`)

**Heartbeat polling (33 params, 30-second interval)**
Parameters that change continuously (battery voltage, board temperatures, media remaining, etc.) are intentionally not subscribed — push subscriptions on these would flood the connection with constant updates. Instead they are sampled every 30 seconds: battery/power readings, board temperatures (7 sensors), media remaining, WiFi/wired/USB-C network status, USB-C media name/status, sync source/state, calibration temperatures, camera runtime.

---

## Protocol Reference

Communicates via RCP2 (RED Command Protocol 2) JSON/WebSocket on port **9998**.

| RCP2 Message | Purpose |
|---|---|
| `rcp_config` | Session initialization |
| `rcp_get_parameters` | Retrieve full supported parameter list |
| `rcp_subscribe` | Register for push updates on a parameter |
| `rcp_get` | Request current value (also implicitly subscribes) |
| `rcp_set` | Set a parameter value |
| `rcp_session` | Keep-alive echo (must be echoed back or camera disconnects) |

Maximum 8 simultaneous WebSocket connections per camera. 1 per application is recommended.
