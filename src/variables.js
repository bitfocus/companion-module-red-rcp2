export function getVariableDefinitions() {
	return [
		// Connection state
		{ variableId: 'connected',             name: 'Connection State' },
		// Exposure
		{ variableId: 'iso',                  name: 'ISO' },
		{ variableId: 'white_balance',         name: 'White Balance' },
		{ variableId: 'fps',                  name: 'Sensor Frame Rate' },
		{ variableId: 'shutter',               name: 'Shutter' },
		{ variableId: 'aperture',              name: 'Iris Aperture' },
		{ variableId: 'exposure_adjust',       name: 'Exposure Adjust' },
		{ variableId: 'nd',                   name: 'ND Filter' },
		// Recording
		{ variableId: 'recording',             name: 'Recording State' },
		{ variableId: 'record_format',         name: 'Record Format' },
		{ variableId: 'record_codec',          name: 'Recording Codec' },
		{ variableId: 'record_duration',       name: 'Recording Duration' },
		{ variableId: 'record_mode',           name: 'Record Mode' },
		// Color
		{ variableId: 'tint',                 name: 'Tint' },
		{ variableId: 'color_space',           name: 'Color Space' },
		{ variableId: 'roll_off',             name: 'Roll Off' },
		// CDL
		{ variableId: 'cdl_slope_r',           name: 'CDL Slope Red' },
		{ variableId: 'cdl_slope_g',           name: 'CDL Slope Green' },
		{ variableId: 'cdl_slope_b',           name: 'CDL Slope Blue' },
		{ variableId: 'cdl_offset_r',          name: 'CDL Offset Red' },
		{ variableId: 'cdl_offset_g',          name: 'CDL Offset Green' },
		{ variableId: 'cdl_offset_b',          name: 'CDL Offset Blue' },
		{ variableId: 'cdl_power_r',           name: 'CDL Power Red' },
		{ variableId: 'cdl_power_g',           name: 'CDL Power Green' },
		{ variableId: 'cdl_power_b',           name: 'CDL Power Blue' },
		{ variableId: 'cdl_saturation',        name: 'CDL Saturation' },
		// Output
		{ variableId: 'sdi_freq',             name: 'SDI Output Frequency' },
		// LUT
		{ variableId: 'lut_project',           name: 'Current Project/Camera LUT' },
		{ variableId: 'lut_top_lcd',           name: 'Top LCD LUT' },
		{ variableId: 'lut_sdi1',             name: 'Current LUT on SDI 1 Output' },
		{ variableId: 'lut_sdi2',             name: 'Current LUT on SDI 2 Output' },
		{ variableId: 'lut_sdi1_enabled',      name: 'SDI 1 LUT Enabled (On/Off)' },
		{ variableId: 'lut_sdi2_enabled',      name: 'SDI 2 LUT Enabled (On/Off)' },
		// Camera identity
		{ variableId: 'camera_id',            name: 'Camera ID' },
		{ variableId: 'camera_pin',            name: 'Camera PIN' },
		{ variableId: 'camera_position',       name: 'Camera Position (A-Z)' },
		{ variableId: 'camera_name',           name: 'Camera Name' },
		{ variableId: 'camera_type',           name: 'Camera Type' },
		{ variableId: 'firmware_version',      name: 'Firmware Version' },
		{ variableId: 'serial_number',         name: 'Serial Number' },
		{ variableId: 'camera_runtime',        name: 'Camera Runtime (hours)' },
		// Clip/media
		{ variableId: 'clip_name',             name: 'Next Clip Name' },
		{ variableId: 'reel_number',           name: 'Reel Number' },
		{ variableId: 'total_clips',           name: 'Total Clips on Media' },
		{ variableId: 'media_remaining_min',   name: 'Media Remaining (Minutes)' },
		{ variableId: 'media_remaining_time',  name: 'Media Remaining (HH:MM:SS)' },
		{ variableId: 'media_capacity_min',    name: 'Media Total Capacity (Minutes)' },
		{ variableId: 'media_free_space',      name: 'Media Free Space' },
		{ variableId: 'media_used_space',      name: 'Media Used Space' },
		// Power (ACTIVE_POWER_IN — all cameras)
		{ variableId: 'power_voltage',         name: 'Power Input Voltage' },
		{ variableId: 'power_current',         name: 'Power Input Current' },
		{ variableId: 'power_percent',         name: 'Power Battery Percent' },
		{ variableId: 'power_runtime',         name: 'Power Battery Runtime' },
		{ variableId: 'power_state',           name: 'Power State' },
		{ variableId: 'power_present',         name: 'Power Present' },
		{ variableId: 'power_valid',           name: 'Power Valid' },
		// Autofocus
		{ variableId: 'af_state',             name: 'Autofocus State' },
		// Tally — USB-C external monitor (all cameras)
		{ variableId: 'tally_state',           name: 'External Monitor Tally State (USB-C Display)' },
		{ variableId: 'tally_1_color',         name: 'External Monitor Tally 1 Color' },
		{ variableId: 'tally_2_color',         name: 'External Monitor Tally 2 Color' },
		{ variableId: 'tally_3_color',         name: 'External Monitor Tally 3 Color' },
		{ variableId: 'tally_opacity',         name: 'External Monitor Tally Opacity' },
		{ variableId: 'tally_style',           name: 'External Monitor Tally Style' },
		{ variableId: 'tally_thickness',       name: 'External Monitor Tally Thickness' },
		// Tally LED — all cameras
		{ variableId: 'tally_led_enable',      name: 'Camera Body Tally LED Enable' },
		// Timecode
		{ variableId: 'timecode',              name: 'Current Timecode' },
		{ variableId: 'timecode_display_mode', name: 'Timecode Display Mode' },
		// Recording extras
		{ variableId: 'exposure_integration_time', name: 'Exposure Integration Time' },
		{ variableId: 'timelapse_interval',        name: 'Timelapse Interval' },
		{ variableId: 'pre_record_start',          name: 'Pre-Record Start on Record' },
		{ variableId: 'record_format_rect_sdi1',   name: 'Record Format Rect SDI 1' },
		{ variableId: 'record_format_rect_sdi2',   name: 'Record Format Rect SDI 2' },
		{ variableId: 'format_arg_camera_id',      name: 'Format Arg Camera ID' },
		// Calibration
		{ variableId: 'cal_status_temp',           name: 'Calibration Status Temperature' },
		{ variableId: 'cal_current_temp',          name: 'Current Calibration Temperature' },
		// Display tools extras
		{ variableId: 'magnify_dsi1',              name: 'Magnify Enable DSI 1' },
		{ variableId: 'sdi2_freq',                 name: 'SDI 2 Output Frequency' },
		{ variableId: 'frame_guide_color',         name: 'Frame Guide 1 Color' },
		{ variableId: 'power_type',                name: 'Power Input Type' },
		// Display tools
		{ variableId: 'log_view',             name: 'Log View Enabled' },
		{ variableId: 'false_color',           name: 'False Color Enabled' },
		{ variableId: 'peaking',               name: 'Peaking Enabled' },
	]
}
