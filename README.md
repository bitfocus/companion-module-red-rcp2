# RED RCP2 Camera Control for Bitfocus Companion

Control RED DSMC3 cameras (V-RAPTOR, V-RAPTOR XL, KOMODO, KOMODO-X) via the RCP2 protocol.

## Version 1.1.3 Changes

This version adds the following requested features:
- **Camera ID readout** - Display the camera's identifier
- **Clip Name** - Shows the name of the next clip to be recorded
- **Reel Number** - Display and set the current reel number  
- **Camera Position** - Display and set the camera position (A-Z)
- **Media Remaining Time** - Remaining recording time in minutes and HH:MM:SS format
- **Camera Shutdown** - Action to remotely power off the camera
- Additional camera info: Serial number, firmware version, camera type

## Configuration

Enter the IP address of your RED camera. The module will automatically connect via WebSocket on port 9998.

- Works with all DSMC3 cameras: V-RAPTOR, V-RAPTOR XL, KOMODO, KOMODO-X
- Tested primarily with RED V-RAPTOR 8K S35

## Available Actions

### Recording Control
- **Start Recording** - Begin recording
- **Stop Recording** - Stop recording
- **Toggle Recording** - Toggle between recording and idle states

### Camera Settings
- **Set ISO** - Choose from preset ISO values (200-6400)
- **Set White Balance** - Set color temperature (2000K-10000K in 100K steps)
- **Set Sensor Frame Rate** - Set recording frame rate (23.976 to 120 FPS)
- **Set Record Format** - Choose sensor crop/resolution (2K to 8K, various aspect ratios)

### Exposure
- **Set Exposure Adjust (Static)** - Set a specific exposure compensation value (-8 to +8)
- **Increase Exposure Adjust** - Increment exposure by specified amount
- **Decrease Exposure Adjust** - Decrement exposure by specified amount

### Camera Identification (NEW in v1.1.3)
- **Set Camera ID** - Set the camera's identifier string
- **Set Reel Number** - Set the current reel number (1-999)
- **Set Camera Position** - Set camera position letter (A-Z)

### LUT Control (NEW in v1.1.3)
- **Toggle LUT on SDI 1** - Toggle LUT on/off for SDI output 1
- **Toggle LUT on SDI 2** - Toggle LUT on/off for SDI output 2
- **Enable LUT on SDI 1** - Turn on LUT for SDI output 1
- **Disable LUT on SDI 1** - Turn off LUT for SDI output 1
- **Enable LUT on SDI 2** - Turn on LUT for SDI output 2
- **Disable LUT on SDI 2** - Turn off LUT for SDI output 2

### System Control (NEW in v1.1.3)
- **Shutdown Camera** - Power off the camera (requires confirmation checkbox)

### Advanced
- **Send Generic Command** - Send raw RCP2 JSON commands

## Available Variables

### Image Settings
| Variable | Description |
|----------|-------------|
| `$(NAME:iso)` | Current ISO value |
| `$(NAME:white_balance)` | White Balance (Kelvin) |
| `$(NAME:tint)` | Tint value |
| `$(NAME:shutter)` | Shutter speed/angle |
| `$(NAME:aperture)` | Iris aperture (T-stop) |
| `$(NAME:exposure_adjust)` | Exposure compensation value |

### Recording
| Variable | Description |
|----------|-------------|
| `$(NAME:recording)` | Recording state ("Recording" or "Idle") |
| `$(NAME:record_duration)` | Current clip duration (HH:MM:SS) |
| `$(NAME:record_format)` | Current format (e.g., "8K 16:9") |
| `$(NAME:record_codec)` | Recording codec ("R3D" or "ProRes") |
| `$(NAME:fps)` | Sensor frame rate |

### LUT Information
| Variable | Description |
|----------|-------------|
| `$(NAME:lut_project)` | Current Project/Camera LUT |
| `$(NAME:lut_sdi1)` | LUT on SDI 1 output |
| `$(NAME:lut_sdi2)` | LUT on SDI 2 output |
| `$(NAME:lut_top_lcd)` | Top LCD display LUT |
| `$(NAME:lut_sdi1_enabled)` | SDI 1 LUT enabled (On/Off) |
| `$(NAME:lut_sdi2_enabled)` | SDI 2 LUT enabled (On/Off) |

### Output
| Variable | Description |
|----------|-------------|
| `$(NAME:sdi_freq)` | SDI output frequency |

### Camera Identification (NEW in v1.1.3)
| Variable | Description |
|----------|-------------|
| `$(NAME:camera_id)` | Camera ID string |
| `$(NAME:camera_pin)` | Camera PIN |
| `$(NAME:camera_position)` | Camera position letter (A-Z) |
| `$(NAME:reel_number)` | Current reel number |
| `$(NAME:clip_name)` | Next clip name to be recorded |
| `$(NAME:total_clips)` | Total clips on media |

### Media Information (NEW in v1.1.3)
| Variable | Description |
|----------|-------------|
| `$(NAME:media_remaining_min)` | Remaining recording time (minutes) |
| `$(NAME:media_remaining_time)` | Remaining recording time (HH:MM:SS) |
| `$(NAME:media_capacity_min)` | Total media capacity (minutes) |
| `$(NAME:media_free_space)` | Free space on media |
| `$(NAME:media_used_space)` | Used space on media |

### Camera Information (NEW in v1.1.3)
| Variable | Description |
|----------|-------------|
| `$(NAME:camera_name)` | Camera name |
| `$(NAME:camera_type)` | Camera model type |
| `$(NAME:serial_number)` | Camera serial number |
| `$(NAME:firmware_version)` | Firmware version |

### Timecode (NEW in v1.1.3)
| Variable | Description |
|----------|-------------|
| `$(NAME:timecode)` | Current timecode |
| `$(NAME:timecode_display_mode)` | Timecode display mode |

## Technical Notes

### RCP2 Protocol
This module communicates with RED cameras via the RCP2 (RED Command Protocol 2) JSON/WebSocket API on port 9998. The protocol is documented in RED's official API documentation.

### Parameter ID Reference
The module uses abbreviated parameter IDs (e.g., "ISO" instead of "RCP_PARAM_ISO"). Both forms are accepted by the camera.

### Value Scaling
- **ISO**: Raw integer values (e.g., 800)
- **Color Temperature**: Kelvin as integer (e.g., 5600)
- **Exposure Adjust**: Fixed-point with 1000x multiplier (internal), displayed as float (-8.000 to +8.000)
- **Frame Rate**: Integer in milliframes (e.g., 24000 = 24.000 fps, 23976 = 23.976 fps)

### Known Limitations
- Some parameter names may vary between camera models
- Not all parameters are available on all cameras
- The camera must be powered on and network-accessible

## Changelog

### v1.1.3
- Added Camera ID, Clip Name, Reel Number readouts
- Added Media Remaining Time in both minutes and HH:MM:SS formats
- Added Camera Shutdown action with confirmation
- Added actions to set Camera ID, Reel Number, and Camera Position
- Added Camera Info variables (serial, firmware, type)
- Added Timecode variables
- Added LUT toggle actions for SDI 1 and SDI 2 outputs
- Added LUT enable/disable actions for SDI 1 and SDI 2
- Added LUT enabled state variables (On/Off)
- Expanded ISO range (200-6400)
- Expanded white balance range (2000K-10000K)
- Added Toggle Recording action
- Improved frame rate options (23.976 to 120 FPS)
- Added all record format options with descriptive labels

### v1.0.0
- Initial release with basic camera control
- ISO, White Balance, Shutter, Aperture, Frame Rate variables
- Recording start/stop
- LUT information
- Exposure adjustment controls

## License

MIT License

## Credits

Based on the RED RCP2 API Protocol documentation.
Developed for use with Bitfocus Companion.
