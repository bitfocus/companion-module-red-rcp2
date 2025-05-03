import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base'
import WebSocket from 'ws'
import objectPath from 'object-path'
import { upgradeScripts } from './upgrade.js'

// Mapping for all possible record formats with friendly labels and aspect ratios.
const recordFormatMappingAll = {
	0: '6K 16:9', // FORMAT_6K_FF
	1: '5K 16:9', // FORMAT_5K_FF
	2: '4K 16:9', // FORMAT_4K_FF
	3: '6K 16:9', // FORMAT_6K_HD
	4: '2K 16:9', // FORMAT_2K_FF
	5: '6K 2.39:1', // FORMAT_6K_WS
	6: '8K 16:9', // FORMAT_8K_FF
	7: '8K 16:9', // FORMAT_8K_HD
	8: '8K 21:9', // FORMAT_8K_2_1
	9: '8K 2.39:1', // FORMAT_8K_WS
	10: '7K 16:9', // FORMAT_7K_FF
	11: '7K 16:9', // FORMAT_7K_HD
	12: '7K 21:9', // FORMAT_7K_2_1
	13: '7K 2.39:1', // FORMAT_7K_WS
	14: '6K 21:9', // FORMAT_6K_2_1
}

const recordCodecMapping = {
  0: 'R3D',
  1: 'ProRes',
}

class RedRCP2Instance extends InstanceBase {
	isInitialized = false
	subscriptions = new Map()
    
    resetAllVariables() {
	for (const key in this.variables) {
		this.variables[key] = ''
	}
	this.setVariableValues(this.variables)
}

    updateStatus(status, message) {
	super.updateStatus(status, message)
	if (status !== InstanceStatus.Ok) {
		this.resetAllVariables()
	}
}
    updateChangedVariables(newVars) {
	this._previousVars = this._previousVars || {}
	const changed = {}

	for (const [key, val] of Object.entries(newVars)) {
		if (this._previousVars[key] !== val) {
			changed[key] = val
		}
	}

	if (Object.keys(changed).length > 0) {
		this.setVariableValues(changed)
		this._previousVars = { ...this._previousVars, ...changed }
	}
}

	async init(config) {
        this.currentExposureAdjust = 0
		this.config = config
		this.ws = null
		this.polling = null
		this.reconnect_timer = null
		this.variables = {
            iso: '',
            white_balance: '',
            fps: '',
            recording: '',
            shutter: '',
            record_format: '',   
            tint: '',
            sdi_freq: '',
            aperture: '',
            record_duration: '',
            exposure_adjust: '',
            lut_project: '',
            lut_top_lcd: '',
            lut_sdi1: '',  
            lut_sdi2: '',
            record_codec: '',
		}

		this.updateStatus(InstanceStatus.Connecting)
		this.connect()
		this.initVariables()
		this.initActions()
		this.initFeedbacks()
		if (typeof this.subscribeFeedbacks === 'function') {
			this.subscribeFeedbacks()
		}
		this.isInitialized = true
        
	}

	initVariables() {
this.setVariableDefinitions([
  { variableId: 'iso',            name: 'ISO' },
  { variableId: 'white_balance', name: 'White Balance' },
  { variableId: 'fps',           name: 'Sensor Frame Rate' },
  { variableId: 'recording',     name: 'Recording State' },
  { variableId: 'shutter',       name: 'Shutter' },
  { variableId: 'record_format', name: 'Record Format' },
  { variableId: 'tint',          name: 'Tint' },
  { variableId: 'sdi_freq',     name: 'SDI Output Frequency' },
  { variableId: 'aperture',      name: 'Iris Aperture' },
  { variableId: 'record_duration', name: 'Recording Duration' },
  { variableId: 'exposure_adjust', name: 'Exposure Adjust' },
  { variableId: 'lut_project',     name: 'Current Project/Camera LUT' },
  { variableId: 'lut_top_lcd',     name: 'Top LCD LUT' },
  { variableId: 'lut_sdi1',        name: 'Current LUT on SDI 1 Output' },
  { variableId: 'lut_sdi2',        name: 'Current LUT on SDI 2 Output' },
  { variableId: 'record_codec',    name: 'Recording Codec' },
])
		this.updateChangedVariables(this.variables)
	}

	subscribeToParameters() {
		const ids = [
			'ISO',
			'COLOR_TEMPERATURE',
			'SENSOR_FRAME_RATE',
			'RECORD_STATE',
			'EXPOSURE_DISPLAY',
			'RECORD_FORMAT',
			'TINT',
			'MONITOR_FREQUENCY_SDI',
			'MONITOR_FREQUENCY_SDI_2',
			'APERTURE',
			'CLIP_DURATION',
			'EXPOSURE_ADJUST',
			'APPLIED_CAMERA_LUT',
			'APPLIED_CAMERA_LUT_SDI_1',
			'APPLIED_CAMERA_LUT_SDI_2',
            'APPLIED_CAMERA_LUT_DSI_1', 
			'RECORD_CODEC',
		]
		ids.forEach(id => this.send({ type: 'rcp_get', id }))
	}

	pollParameters() {
		this.subscribeToParameters()
	}

	connect() {
		if (this.ws) this.ws.close()

		const host = this.config.host ? this.config.host.trim() : ''
		if (!host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Camera IP is not defined')
			return
		}

		const url = `ws://${host}:9998`
		this.log('debug', `Connecting to ${url}`)
		this.updateStatus(InstanceStatus.Connecting)

		try {
			this.ws = new WebSocket(url)

			this.ws.on('open', () => {
				this.updateStatus(InstanceStatus.Ok)
				this.log('debug', `Connection opened to ${url}`)
				this.send({
					type: 'rcp_config',
					strings_decoded: 1,
					json_minified: 1,
					include_cacheable_flags: 0,
					encoding_type: 'legacy',
					client: { name: 'Companion RED Module', version: '1.0.0' },
				})
				this.subscribeToParameters()
				this.polling = setInterval(() => this.pollParameters(), 1000)
			})

			this.ws.on('message', (data) => {
				let msg
				try {
					msg = JSON.parse(data)
				} catch (e) {
					this.log('error', `Failed to parse message: ${data}`)
					return
				}
				if (msg.type && msg.type.startsWith('rcp_cur')) {
					this.handleUpdate(msg)
				}
			})

			this.ws.on('error', (err) => {
				this.log('error', `WebSocket error: ${err.message}`)
				this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
				this.maybeReconnect()
			})

			this.ws.on('close', (code) => {
				this.log('debug', `Connection closed with code ${code}`)
				this.updateStatus(InstanceStatus.Disconnected, `Connection closed with code ${code}`)
				this.maybeReconnect()
			})
		} catch (err) {
			this.log('error', `Connect exception: ${err.message}`)
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
			this.maybeReconnect()
		}
	}

	maybeReconnect() {
		if (this.reconnect_timer) clearTimeout(this.reconnect_timer)
		this.reconnect_timer = setTimeout(() => {
			this.log('debug', 'Attempting reconnect...')
			this.connect()
		}, 5000)
	}

	handleUpdate(msg) {
  this.log('debug', `Received message: ${JSON.stringify(msg)}`)
  switch (msg.id) {

    // ISO → integer, no thousands separator
    case 'ISO':
      if (msg.cur && Number.isInteger(msg.cur.val)) {
        this.variables.iso = `${msg.cur.val}`
      } else {
        this.variables.iso = ''
      }
      break

    // White Balance → append "K"
case 'COLOR_TEMPERATURE':
  if (msg.cur && Number.isInteger(msg.cur.val)) {
    // uppercase “K” → lowercase “k”
    this.variables.white_balance = `${msg.cur.val}k`
  } else if (msg.display && msg.display.str) {
    // strip any trailing “K/k” then append a lowercase “k”
    const raw = msg.display.str.replace(/\s*[Kk]?$/, '')
    this.variables.white_balance = `${raw}k`
  } else {
    this.variables.white_balance = ''
  }
  break

    // Sensor Frame Rate → use display string ("23.98 FPS")
case 'SENSOR_FRAME_RATE':
  if (msg.type === 'rcp_cur_str' && msg.display && msg.display.str) {
    this.variables.fps = msg.display.str.replace(/\s*FPS$/i, '')
  } else {
    this.log('debug', `Ignoring SENSOR_FRAME_RATE update of type ${msg.type}`)
  }
  break

    // Recording State → 1 = Recording, 0 = Idle
    case 'RECORD_STATE':
      this.variables.recording = ((msg.cur && msg.cur.val) || msg.val) === 1
        ? 'Recording'
        : 'Idle'
      break

    // Shutter/Exposure Display → use display or calc “1/xx”
    case 'EXPOSURE_DISPLAY':
      if (msg.display && msg.display.str) {
        this.variables.shutter = msg.display.str
      } else if (msg.cur && msg.cur.val) {
        this.variables.shutter = `1/${(msg.cur.val / 1000).toFixed(2)}`
      } else {
        this.variables.shutter = ''
      }
      break
case 'EXPOSURE_ADJUST':
	if (msg.cur && typeof msg.cur.val === 'number') {
		this.currentExposureAdjust = msg.cur.val // stored as int, like 2500
		this.variables.exposure_adjust = (msg.cur.val / 1000).toFixed(3)
	} else if (msg.display && msg.display.str) {
		this.variables.exposure_adjust = msg.display.str
	}
	break
    // Record Format → use your mapping (e.g. "8K 16:9")
    case 'RECORD_FORMAT':
      if (msg.type === 'rcp_cur_int' && msg.cur && msg.cur.val !== undefined) {
        this.variables.record_format =
          recordFormatMappingAll[msg.cur.val] ||
          `Unknown (${msg.cur.val})`
      } else {
        this.log('debug', `Ignoring RECORD_FORMAT message of type ${msg.type}`)
      }
      break

    // Tint → plain number or display
    case 'TINT':
      if (msg.display && msg.display.str) {
        this.variables.tint = msg.display.str
      } else if (msg.cur && msg.cur.val !== undefined) {
        this.variables.tint = `${msg.cur.val}`
      } else {
        this.variables.tint = ''
      }
      break

    // SDI 1 Frequency → "59.94 Hz"
    case 'MONITOR_FREQUENCY_SDI':
      if (msg.display && msg.display.str) {
        this.variables.sdi_freq = msg.display.str
      } else if (msg.cur && msg.cur.val !== undefined) {
        this.variables.sdi_freq = `${msg.cur.val} Hz`
      } else {
        this.variables.sdi_freq = ''
      }
      break

    // SDI 2 Frequency
          case 'APPLIED_CAMERA_LUT_DSI_1':
      // Top LCD LUT
      this.variables.lut_top_lcd =
        msg.display?.str
          ? msg.display.str.replace(/\.cube$/i, '')
          : msg.cur?.val
            ? msg.cur.val.replace(/\.cube$/i, '')
            : ''
      break
    // Iris Aperture → display or raw
case 'APERTURE': {
	
	if (!this.lastAperture) {
		this.lastAperture = 'N/A'
	}

	if (msg.cur && typeof msg.cur.val === 'number' && msg.cur.val >= 0) {
		const editInfo = msg.edit_info || {}
		const div = typeof editInfo.divider === 'number' ? editInfo.divider : 1
		const digs = typeof editInfo.digits === 'number' ? editInfo.digits : 1
		const value = (msg.cur.val / div).toFixed(digs)
		this.lastAperture = `${value}`
		this.variables.aperture = this.lastAperture
	}
	else if (msg.display && typeof msg.display.str === 'string') {
		const s = msg.display.str.trim()
		const m = s.match(/^T\s+(\d+)\s+(\d+)\/(\d+)/)

		if (m) {
			const whole = parseInt(m[1], 10)
			const num = parseInt(m[2], 10)
			const den = parseInt(m[3], 10)
			const value = (whole + num / den).toFixed(1)
			this.lastAperture = `${value}`
			this.variables.aperture = this.lastAperture
		}
		else {
			const v = parseFloat(s)
			if (!isNaN(v)) {
				this.lastAperture = v.toFixed(1)
				this.variables.aperture = this.lastAperture
			}
		}
	}
	else {
		// Don't update, keep last known good value
		this.variables.aperture = this.lastAperture
	}
	break
}

    // Recording Duration → hh:mm:ss from display.str
    case 'CLIP_DURATION':
      if (msg.display && msg.display.str) {
        this.variables.record_duration = msg.display.str
      } else {
        this.variables.record_duration = ''
      }
      break

    // Exposure Adjust → display or raw
    case 'EXPOSURE_ADJUST':
      if (msg.display && msg.display.str) {
        this.variables.exposure_adjust = msg.display.str
      } else if (msg.cur && msg.cur.val !== undefined) {
        this.variables.exposure_adjust = `${msg.cur.val}`
      } else {
        this.variables.exposure_adjust = ''
      }
      break

    // Project/Camera LUT → remove ".cube"
    case 'APPLIED_CAMERA_LUT':
      if (msg.display && msg.display.str) {
        this.variables.lut_project = msg.display.str.replace(/\.cube$/i, '')
      } else if (msg.cur && msg.cur.val) {
        this.variables.lut_project = `${msg.cur.val}`.replace(/\.cube$/i, '')
      } else {
        this.variables.lut_project = ''
      }
      break

    // SDI1 LUT
case 'APPLIED_CAMERA_LUT_SDI_1': {
  const val = msg.display?.str || msg.cur?.val || ''
  this.variables.lut_sdi1 = val
    ? val.replace(/\.cube$/i, '')
    : 'NO LUT on SDI #1'
  break
}

    // SDI2 LUT
case 'APPLIED_CAMERA_LUT_SDI_2': {
  const val = msg.display?.str || msg.cur?.val || ''
  this.variables.lut_sdi2 = val
    ? val.replace(/\.cube$/i, '')
    : 'NO LUT on SDI #2'
  break
}

    // Recording Codec → map 0/1 to "R3D"/"ProRes"
    case 'RECORD_CODEC':
      if (msg.cur && Number.isInteger(msg.cur.val)) {
        this.variables.record_codec =
          recordCodecMapping[msg.cur.val] ||
          `Unknown (${msg.cur.val})`
      } else if (msg.display && msg.display.str) {
        this.variables.record_codec = msg.display.str
      } else {
        this.variables.record_codec = ''
      }
      break

    // ──────────────────────────────────────────────────────────────────────────
    default:
      this.log('debug', `Unhandled parameter id: ${msg.id}`)
  }

  this.setVariableValues(this.variables)
}

	send(json) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(json))
		}
	}

	async configUpdated(config) {
		this.config = config
		this.connect()
	}

	async destroy() {
		if (this.ws) this.ws.close()
		if (this.polling) clearInterval(this.polling)
		if (this.reconnect_timer) clearTimeout(this.reconnect_timer)
		this.updateStatus(InstanceStatus.Disconnected)
	}

	getConfigFields() {
		return [
			{ type: 'textinput', id: 'host', label: 'Camera IP Address', width: 8, default: '10.60.230.102' },
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Note',
				value: 'Enter only the IP address of the RED camera. Port 9998 and ws:// are automatically added.',
			},
		]
	}

	initFeedbacks() {
		this.setFeedbackDefinitions({
			websocket_variable: {
				type: 'advanced',
				name: 'Update variable with value from WebSocket message',
				description: 'Receive messages from the WebSocket and set the value to a variable. Variables can be used on any button.',
				options: [
					{ type: 'textinput', label: 'JSON Path (blank if not json)', id: 'subpath', default: '' },
					{ type: 'textinput', label: 'Variable', id: 'variable', regex: '/^[-a-zA-Z0-9_]+$/', default: '' },
				],
				callback: () => ({}),
				subscribe: (feedback) => {
					this.subscriptions.set(feedback.id, { variableName: feedback.options.variable, subpath: feedback.options.subpath })
					if (this.isInitialized) this.updateVariables(feedback.id)
				},
				unsubscribe: (feedback) => this.subscriptions.delete(feedback.id),
			},
		})
	}

	initActions() {
		this.setActionDefinitions({
			increase_exposure_adjust: {
	name: 'Increase Exposure Adjust',
	options: [
		{
			type: 'number',
			label: 'Amount to increase (e.g. 0.250)',
			id: 'amount',
			default: 0.250,
			min: -8.000,
			max: 8.000,
			step: 0.001,
		},
	],
	callback: async (action, context) => {
		const delta = parseFloat(await context.parseVariablesInString(action.options.amount))
		if (!isNaN(delta)) {
			const newVal = this.currentExposureAdjust + Math.round(delta * 1000)
			const clamped = Math.min(8000, Math.max(-8000, newVal))
			this.send({ type: 'rcp_set', id: 'EXPOSURE_ADJUST', value: clamped })
			this.log('debug', `Increasing EXPOSURE_ADJUST by ${delta} → ${clamped / 1000}`)
		}
	},
},

decrease_exposure_adjust: {
	name: 'Decrease Exposure Adjust',
	options: [
		{
			type: 'number',
			label: 'Amount to decrease (e.g. 0.250)',
			id: 'amount',
			default: 0.250,
			min: -8.000,
			max: 8.000,
			step: 0.001,
		},
	],
	callback: async (action, context) => {
		const delta = parseFloat(await context.parseVariablesInString(action.options.amount))
		if (!isNaN(delta)) {
			const newVal = this.currentExposureAdjust - Math.round(delta * 1000)
			const clamped = Math.min(8000, Math.max(-8000, newVal))
			this.send({ type: 'rcp_set', id: 'EXPOSURE_ADJUST', value: clamped })
			this.log('debug', `Decreasing EXPOSURE_ADJUST by ${delta} → ${clamped / 1000}`)
		}
	},
},

set_exposure_adjust: {
	name: 'Set Exposure Adjust (Static)',
	options: [
		{
			type: 'number',
			label: 'Target Exposure Adjust Value',
			id: 'value',
			default: 0.000,
			min: -8.000,
			max: 8.000,
			step: 0.001,
		},
	],
	callback: async (action, context) => {
		const floatVal = parseFloat(await context.parseVariablesInString(action.options.value))
		if (!isNaN(floatVal)) {
			const clamped = Math.min(8, Math.max(-8, floatVal))
			const fixedPoint = Math.round(clamped * 1000)
			this.send({ type: 'rcp_set', id: 'EXPOSURE_ADJUST', value: fixedPoint })
			this.log('debug', `Setting EXPOSURE_ADJUST to ${clamped} (sent as ${fixedPoint})`)
		} else {
			this.log('error', 'Invalid static value for EXPOSURE_ADJUST')
		}
	},
},
            set_white_balance: {
	name: 'Set White Balance',
	options: [
		{
			type: 'dropdown',
			label: 'White Balance (Kelvin)',
			id: 'white_balance',
			default: '5600',
			choices: Array.from({ length: (6000 - 2700) / 100 + 1 }, (_, i) => {
				const kelvin = 2700 + i * 100
				return { id: kelvin.toString(), label: `${kelvin}K` }
			}),
		},
	],
	callback: async (action, context) => {
		const value = parseInt(await context.parseVariablesInString(action.options.white_balance), 10)
		if (!isNaN(value)) {
			this.send({ type: 'rcp_set', id: 'COLOR_TEMPERATURE', value })
			this.log('debug', `Sending COLOR_TEMPERATURE set to ${value}`)
		} else {
			this.log('warn', `Invalid white balance value: ${action.options.white_balance}`)
		}
	},
},
            set_iso: {
				name: 'Set ISO',
				options: [
					{ type: 'dropdown', label: 'ISO', id: 'iso', default: '1000', choices: [
						{ id: '250', label: '250' },{ id: '320', label: '320' },{ id: '400', label: '400' },{ id: '500', label: '500' },
						{ id: '640', label: '640' },{ id: '800', label: '800' },{ id: '1000', label: '1000' },{ id: '1280', label: '1280' }
					]},
				],
				callback: async (action, context) => {
					const iso = parseInt(await context.parseVariablesInString(action.options.iso), 10)
					this.send({ type: 'rcp_set', id: 'ISO', value: iso })
					this.log('debug', `Sending ISO set to ${iso}`)
				},
			},
			set_sensor_fps: {
				name: 'Set Sensor Frame Rate',
				options: [
					{ type: 'dropdown', label: 'Sensor Frame Rate', id: 'fps', default: '24000', choices: [
						{ id: '60000', label: '59.94 FPS' },{ id: '24000', label: '23.98 FPS' }
					]},
				],
				callback: async (action, context) => {
					const fps = parseInt(await context.parseVariablesInString(action.options.fps), 10)
					this.send({ type: 'rcp_set', id: 'SENSOR_FRAME_RATE', value: fps })
					this.log('debug', `Sending SENSOR_FRAME_RATE set to ${fps}`)
				},
			},
			set_record_format: {
				name: 'Set Record Format',
				options: [
					{ type: 'dropdown', label: 'Record Format', id: 'record_format', default: '3', choices: [
						{ id: '7', label: '8K' },{ id: '11', label: '7K' },{ id: '3', label: '6K' },{ id: '1', label: '5K' }
					]},
				],
				callback: async (action, context) => {
					const val = parseInt(await context.parseVariablesInString(action.options.record_format), 10)
					this.send({ type: 'rcp_set', id: 'RECORD_FORMAT', value: val })
					this.log('debug', `Sending RECORD_FORMAT set to ${val}`)
				},
			},
			start_record: {
				name: 'Start Recording',
				options: [],
				callback: () => this.send({ type: 'rcp_set', id: 'RECORD_STATE', value: 1 }),
			},
			stop_record: {
				name: 'Stop Recording',
				options: [],
				callback: () => this.send({ type: 'rcp_set', id: 'RECORD_STATE', value: 0 }),
			},
			send_command: {
				name: 'Send Generic Command',
				options: [{ type: 'textinput', label: 'Data', id: 'data', default: '', useVariables: true }],
				callback: async (action, context) => {
					const msg = await context.parseVariablesInString(action.options.data)
					if (this.ws && this.ws.readyState === WebSocket.OPEN) {
						this.ws.send(msg)
					} else {
						this.log('error', 'WebSocket not open')
					}
				},
			},
		})
	}
}

runEntrypoint(RedRCP2Instance, upgradeScripts)