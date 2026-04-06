import WebSocket from 'ws'

const ISO_CHOICES = [
	{ id: '100', label: '100' },     { id: '125', label: '125' },
	{ id: '160', label: '160' },     { id: '200', label: '200' },
	{ id: '250', label: '250' },     { id: '320', label: '320' },
	{ id: '400', label: '400' },     { id: '500', label: '500' },
	{ id: '640', label: '640' },     { id: '800', label: '800' },
	{ id: '1000', label: '1000' },   { id: '1280', label: '1280' },
	{ id: '1600', label: '1600' },   { id: '2000', label: '2000' },
	{ id: '2560', label: '2560' },   { id: '3200', label: '3200' },
	{ id: '4000', label: '4000' },   { id: '5120', label: '5120' },
	{ id: '6400', label: '6400' },   { id: '8000', label: '8000' },
	{ id: '10240', label: '10240' }, { id: '12800', label: '12800' },
	{ id: '16000', label: '16000' }, { id: '20480', label: '20480' },
	{ id: '25600', label: '25600' },
]

const TALLY_COLOR_CHOICES = [
	{ id: '0',        label: 'Black' },   { id: '12517376', label: 'Red' },
	{ id: '191',      label: 'Blue' },    { id: '48896',    label: 'Green' },
	{ id: '16776960', label: 'Yellow' },  { id: '12517567', label: 'Magenta' },
	{ id: '49087',    label: 'Cyan' },    { id: '12566463', label: 'Gray' },
	{ id: '4210752',  label: 'Dark Gray' },{ id: '16777215', label: 'White' },
]

export function getActionDefinitions(self) {
	return {

		// Recording — set_record_state enum values from rcp_cur_types:
		// STOP=0, START=1, TOGGLE=2, PRE_RECORD_STOP=3
		start_recording: {
			name: 'Start Recording',
			options: [],
			callback: () => self.send({ type: 'rcp_set', id: 'RECORD_STATE', value: 1 }),
		},
		stop_recording: {
			name: 'Stop Recording',
			options: [],
			callback: () => self.send({ type: 'rcp_set', id: 'RECORD_STATE', value: 0 }),
		},
		toggle_recording: {
			name: 'Toggle Recording',
			options: [],
			callback: () => self.send({ type: 'rcp_set', id: 'RECORD_STATE', value: 2 }),
		},

		// Exposure Adjust
		increase_exposure_adjust: {
			name: 'Increase Exposure Adjust',
			options: [{
				type: 'dropdown', label: 'Step Size', id: 'step', default: '1000',
				choices: [
					{ id: '33',   label: '1/30 stop (0.033)' },
					{ id: '100',  label: '1/10 stop (0.100)' },
					{ id: '500',  label: '1/2 stop (0.500)' },
					{ id: '1000', label: '1 stop (1.000)' },
				],
			}],
			callback: async (action, context) => {
				const step = parseInt(await context.parseVariablesInString(action.options.step), 10)
				if (isNaN(step)) return
				const newVal = Math.min(8000, (self.currentExposureAdjust || 0) + step)
				self.send({ type: 'rcp_set', id: 'EXPOSURE_ADJUST', value: newVal })
			},
		},
		decrease_exposure_adjust: {
			name: 'Decrease Exposure Adjust',
			options: [{
				type: 'dropdown', label: 'Step Size', id: 'step', default: '1000',
				choices: [
					{ id: '33',   label: '1/30 stop (0.033)' },
					{ id: '100',  label: '1/10 stop (0.100)' },
					{ id: '500',  label: '1/2 stop (0.500)' },
					{ id: '1000', label: '1 stop (1.000)' },
				],
			}],
			callback: async (action, context) => {
				const step = parseInt(await context.parseVariablesInString(action.options.step), 10)
				if (isNaN(step)) return
				const newVal = Math.max(-8000, (self.currentExposureAdjust || 0) - step)
				self.send({ type: 'rcp_set', id: 'EXPOSURE_ADJUST', value: newVal })
			},
		},
		set_exposure_adjust: {
			name: 'Set Exposure Adjust (Static)',
			options: [{ type: 'number', label: 'Target Value', id: 'value', default: 0.0, min: -8.0, max: 8.0, step: 0.001 }],
			callback: async (action, context) => {
				const v = parseFloat(await context.parseVariablesInString(action.options.value))
				if (!isNaN(v)) self.send({ type: 'rcp_set', id: 'EXPOSURE_ADJUST', value: Math.round(Math.min(8, Math.max(-8, v)) * 1000) })
			},
		},

		// White Balance
		set_white_balance: {
			name: 'Set White Balance',
			options: [{
				type: 'dropdown', label: 'White Balance (Kelvin)', id: 'white_balance', default: '5600',
				choices: Array.from({ length: (10000 - 2000) / 100 + 1 }, (_, i) => {
					const k = 2000 + i * 100
					return { id: k.toString(), label: k + 'K' }
				}),
			}],
			callback: async (action, context) => {
				const value = parseInt(await context.parseVariablesInString(action.options.white_balance), 10)
				if (!isNaN(value)) self.send({ type: 'rcp_set', id: 'COLOR_TEMPERATURE', value })
			},
		},

		// ISO
		set_iso: {
			name: 'Set ISO',
			options: [{ type: 'dropdown', label: 'ISO', id: 'iso', default: '800', choices: ISO_CHOICES }],
			callback: async (action, context) => {
				const iso = parseInt(await context.parseVariablesInString(action.options.iso), 10)
				if (isNaN(iso)) return
				self.send({ type: 'rcp_set', id: 'ISO', value: iso })
			},
		},

		// Sensor FPS
		set_sensor_fps: {
			name: 'Set Sensor Frame Rate',
			options: [{
				type: 'dropdown', label: 'Sensor Frame Rate', id: 'fps', default: '24000',
				choices: [
					{ id: '23976',  label: '23.976 FPS' }, { id: '24000',  label: '24 FPS' },
					{ id: '25000',  label: '25 FPS' },     { id: '29970',  label: '29.97 FPS' },
					{ id: '30000',  label: '30 FPS' },     { id: '48000',  label: '48 FPS' },
					{ id: '50000',  label: '50 FPS' },     { id: '59940',  label: '59.94 FPS' },
					{ id: '60000',  label: '60 FPS' },     { id: '120000', label: '120 FPS' },
				],
			}],
			callback: async (action, context) => {
				const fps = parseInt(await context.parseVariablesInString(action.options.fps), 10)
				if (isNaN(fps)) return
				self.send({ type: 'rcp_set', id: 'SENSOR_FRAME_RATE', value: fps })
			},
		},

		// Record Format
		set_record_format: {
			name: 'Set Record Format',
			options: [{
				type: 'dropdown', label: 'Record Format', id: 'record_format', default: '6',
				choices: [
					{ id: '6',  label: '8K 16:9 (Full Frame)' }, { id: '7',  label: '8K 16:9 (HD)' },
					{ id: '8',  label: '8K 21:9' },               { id: '9',  label: '8K 2.39:1' },
					{ id: '10', label: '7K 16:9 (Full Frame)' },  { id: '11', label: '7K 16:9 (HD)' },
					{ id: '12', label: '7K 21:9' },               { id: '13', label: '7K 2.39:1' },
					{ id: '0',  label: '6K 16:9 (Full Frame)' },  { id: '3',  label: '6K 16:9 (HD)' },
					{ id: '5',  label: '6K 2.39:1' },             { id: '14', label: '6K 21:9' },
					{ id: '1',  label: '5K 16:9' },               { id: '2',  label: '4K 16:9' },
					{ id: '4',  label: '2K 16:9' },
				],
			}],
			callback: async (action, context) => {
				self.send({ type: 'rcp_set', id: 'RECORD_FORMAT', value: parseInt(await context.parseVariablesInString(action.options.record_format), 10) })
			},
		},

		// Camera identity
		set_camera_id: {
			name: 'Set Camera ID',
			options: [{ type: 'textinput', label: 'Camera ID (max 63 chars)', id: 'camera_id', default: '', useVariables: true }],
			callback: async (action, context) => {
				const id = await context.parseVariablesInString(action.options.camera_id)
				if (id) self.send({ type: 'rcp_set', id: 'CAMERA_ID', value: id })
			},
		},
		set_reel_number: {
			name: 'Set Reel Number',
			options: [{ type: 'number', label: 'Reel Number (1-999)', id: 'reel', default: 1, min: 1, max: 999 }],
			callback: async (action, context) => {
				const reel = parseInt(await context.parseVariablesInString(action.options.reel), 10)
				if (!isNaN(reel) && reel >= 1 && reel <= 999) self.send({ type: 'rcp_set', id: 'REEL_NUMBER', value: reel })
			},
		},
		set_camera_position: {
			name: 'Set Camera Position',
			options: [{
				type: 'dropdown', label: 'Camera Position (Letter)', id: 'position', default: '0',
				choices: Array.from({ length: 26 }, (_, i) => ({ id: i.toString(), label: String.fromCharCode(65 + i) })),
			}],
			callback: async (action, context) => {
				const pos = parseInt(await context.parseVariablesInString(action.options.position), 10)
				if (!isNaN(pos) && pos >= 0 && pos <= 25) self.send({ type: 'rcp_set', id: 'CAMERA_POSITION', value: pos })
			},
		},

		// LUT
		toggle_lut_sdi1:  { name: 'Toggle LUT on SDI 1',  options: [], callback: () => self.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_1', value: self.lutSdi1Enabled ? 0 : 1 }) },
		toggle_lut_sdi2:  { name: 'Toggle LUT on SDI 2',  options: [], callback: () => self.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_2', value: self.lutSdi2Enabled ? 0 : 1 }) },
		enable_lut_sdi1:  { name: 'Enable LUT on SDI 1',  options: [], callback: () => self.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_1', value: 1 }) },
		disable_lut_sdi1: { name: 'Disable LUT on SDI 1', options: [], callback: () => self.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_1', value: 0 }) },
		enable_lut_sdi2:  { name: 'Enable LUT on SDI 2',  options: [], callback: () => self.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_2', value: 1 }) },
		disable_lut_sdi2: { name: 'Disable LUT on SDI 2', options: [], callback: () => self.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_2', value: 0 }) },

		// Tally — USB-C external monitor (all cameras)
		set_tally_state: {
			name: 'Set External Monitor Tally State',
			options: [{
				type: 'dropdown', label: 'Tally State (USB-C Monitor)', id: 'state', default: '0',
				choices: [
					{ id: '0', label: 'Off' },     { id: '1', label: 'Tally 1' },
					{ id: '2', label: 'Tally 2' }, { id: '3', label: 'Tally 3' },
				],
			}],
			callback: async (action, context) => {
				self.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_STATE', value: parseInt(await context.parseVariablesInString(action.options.state), 10) })
			},
		},
		set_tally_1_color: {
			name: 'Set External Monitor Tally 1 Color',
			options: [{ type: 'dropdown', label: 'Color', id: 'color', default: '12517376', choices: TALLY_COLOR_CHOICES }],
			callback: async (action, context) => {
				self.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_1_COLOR', value: parseInt(await context.parseVariablesInString(action.options.color), 10) })
			},
		},
		set_tally_2_color: {
			name: 'Set External Monitor Tally 2 Color',
			options: [{ type: 'dropdown', label: 'Color', id: 'color', default: '48896', choices: TALLY_COLOR_CHOICES }],
			callback: async (action, context) => {
				self.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_2_COLOR', value: parseInt(await context.parseVariablesInString(action.options.color), 10) })
			},
		},
		set_tally_3_color: {
			name: 'Set External Monitor Tally 3 Color',
			options: [{ type: 'dropdown', label: 'Color', id: 'color', default: '16776960', choices: TALLY_COLOR_CHOICES }],
			callback: async (action, context) => {
				self.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_3_COLOR', value: parseInt(await context.parseVariablesInString(action.options.color), 10) })
			},
		},
		set_tally_opacity: {
			name: 'Set External Monitor Tally Opacity',
			options: [{
				type: 'dropdown', label: 'Opacity', id: 'opacity', default: '3',
				choices: [{ id: '0', label: '25%' }, { id: '1', label: '50%' }, { id: '2', label: '75%' }, { id: '3', label: '100%' }],
			}],
			callback: async (action, context) => {
				self.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_OPACITY', value: parseInt(await context.parseVariablesInString(action.options.opacity), 10) })
			},
		},
		set_tally_style: {
			name: 'Set External Monitor Tally Style',
			options: [{
				type: 'dropdown', label: 'Style', id: 'style', default: '0',
				choices: [{ id: '0', label: 'Solid' }, { id: '1', label: 'Dashed' }, { id: '2', label: 'Bracket' }],
			}],
			callback: async (action, context) => {
				self.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_STYLE', value: parseInt(await context.parseVariablesInString(action.options.style), 10) })
			},
		},
		set_tally_thickness: {
			name: 'Set External Monitor Tally Thickness',
			options: [{
				type: 'dropdown', label: 'Thickness', id: 'thickness', default: '1',
				choices: [{ id: '0', label: 'Small' }, { id: '1', label: 'Medium' }, { id: '2', label: 'Large' }],
			}],
			callback: async (action, context) => {
				self.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_THICKNESS', value: parseInt(await context.parseVariablesInString(action.options.thickness), 10) })
			},
		},

		// Tally LED — all cameras
		enable_tally_led: {
			name: 'Enable Camera Body Tally LED',
			options: [],
			callback: () => self.send({ type: 'rcp_set', id: 'TALLY_LED_ENABLE', value: 1 }),
		},
		disable_tally_led: {
			name: 'Disable Camera Body Tally LED',
			options: [],
			callback: () => self.send({ type: 'rcp_set', id: 'TALLY_LED_ENABLE', value: 0 }),
		},
		toggle_tally_led: {
			name: 'Toggle Camera Body Tally LED',
			options: [],
			callback: () => self.send({ type: 'rcp_set', id: 'TALLY_LED_ENABLE', value: self.variables.tally_led_enable === 'Enabled' ? 0 : 1 }),
		},

		// System
		shutdown_camera: {
			name: 'Shutdown Camera',
			options: [{ type: 'checkbox', label: 'Confirm Shutdown (must be checked to proceed)', id: 'confirm', default: false }],
			callback: async (action) => {
				if (action.options.confirm) {
					self.send({ type: 'rcp_set', id: 'SHUTDOWN', value: 1 })
					self.log('info', 'Shutdown command sent to camera')
				} else {
					self.log('warn', 'Shutdown not confirmed — checkbox must be enabled')
				}
			},
		},
		send_command: {
			name: 'Send Generic Command',
			options: [{ type: 'textinput', label: 'Raw JSON Data', id: 'data', default: '{ "type": "rcp_set", "id": "ISO", "val": 800 }', useVariables: true }],
			callback: async (action, context) => {
				const msg = await context.parseVariablesInString(action.options.data)
				if (self.ws && self.ws.readyState === WebSocket.OPEN) self.ws.send(msg)
				else self.log('error', 'WebSocket not open')
			},
		},
	}
}
