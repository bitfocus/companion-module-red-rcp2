import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base'
import WebSocket from 'ws'
import objectPath from 'object-path'
import { upgradeScripts } from './upgrade.js'

process.title = 'RED RCP2'
// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const recordFormatMappingAll = {
	0: '6K 16:9',    1: '5K 16:9',    2: '4K 16:9',    3: '6K 16:9',
	4: '2K 16:9',    5: '6K 2.39:1',  6: '8K 16:9',    7: '8K 16:9',
	8: '8K 21:9',    9: '8K 2.39:1',  10: '7K 16:9',   11: '7K 16:9',
	12: '7K 21:9',   13: '7K 2.39:1', 14: '6K 21:9',
}

const recordCodecMapping = { 0: 'R3D', 1: 'ProRes' }

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

// Camera type numbers from rcp_cur_cam_info (camera_type.num)
// 50=KOMODO, 51=V-RAPTOR, 52=V-RAPTOR XL, 53=KOMODO-X
const VRAPTOR_CAMERA_TYPES = new Set([51, 52])

// ─────────────────────────────────────────────────────────────────────────────
// PARAMETER LISTS
// ─────────────────────────────────────────────────────────────────────────────

// Small set of critical params subscribed immediately on connect for instant feedback,
// before rcp_get_parameters comes back. Everything else is handled dynamically by
// _onCameraParameters() based on what the camera reports it actually supports.
// This means the module works correctly across all camera models and firmware versions
// without needing hardcoded per-camera lists.
const CRITICAL_SUBSCRIBE_PARAMS = [
	'RECORD_STATE', 'SENSOR_FRAME_RATE', 'RECORD_FORMAT', 'RECORD_CODEC',
	'CLIP_DURATION', 'ISO', 'APERTURE', 'ND', 'COLOR_TEMPERATURE', 'TINT',
	'EXTERNAL_TALLY_STATE', 'TALLY_LED_ENABLE',
	'TIMECODE', 'TIMECODE_STATE',
]

const CAMERA_INFO_INTERVAL_MS = 60000
const RESYNC_INTERVAL_MS      = 30000

// ─────────────────────────────────────────────────────────────────────────────
// MODULE
// ─────────────────────────────────────────────────────────────────────────────

class RedRCP2Instance extends InstanceBase {
	isInitialized = false
	subscriptions = new Map()

	// ── Helpers ──────────────────────────────────────────────────────────────

	resetAllVariables() {
		// Preserve connected — it's set by updateStatus before this is called
		const preserveConnected = this._varStore.connected
		for (const key in this._varStore) this.variables[key] = ''
		this._varStore.connected = preserveConnected
		// Force immediate flush so Companion sees the reset synchronously
		if (this._flushTimer) { clearImmediate(this._flushTimer); this._flushTimer = null }
		this.setVariableValues({ ...this._varStore })
	}

	updateStatus(status, message) {
		// Set connected variable BEFORE resetAllVariables so it isn't blanked then re-set async
		if (status === InstanceStatus.Ok) {
			if (this.variables) this.variables.connected = 'Connected'
		} else if (status === InstanceStatus.Connecting) {
			if (this.variables) this.variables.connected = 'Connecting'
		} else {
			if (this.variables) this.variables.connected = 'Disconnected'
		}
		super.updateStatus(status, message)
		if (status !== InstanceStatus.Ok) this.resetAllVariables()
	}

	// Called once at init — wraps this.variables in a Proxy so any direct write
	// (this.variables.foo = val) auto-schedules a batched flush to Companion.
	// No need to call updateChangedVariables anywhere — just write to this.variables.
	_initVariableProxy() {
		this._varStore   = this._varStore   || {}
		this._dirtyVars  = this._dirtyVars  || {}
		this._flushTimer = null
		this.variables   = new Proxy(this._varStore, {
			set: (target, key, value) => {
				const strVal = value === null || value === undefined ? '' : String(value)
				if (target[key] !== strVal) {
					target[key]          = strVal
					this._dirtyVars[key] = strVal
					if (!this._flushTimer) {
						this._flushTimer = setImmediate(() => {
							this._flushTimer = null
							const dirty = this._dirtyVars
							this._dirtyVars = {}
							if (Object.keys(dirty).length > 0) {
								this.setVariableValues(dirty)
							}
						})
					}
				}
				return true
			},
			get: (target, key) => target[key],
		})
	}

	// Legacy helper kept for compatibility — no longer needed but harmless.
	updateChangedVariables(_newVars) {}

	minutesToHHMMSS(minutes) {
		if (isNaN(minutes) || minutes < 0) return '00:00:00'
		const s = Math.floor(minutes * 60)
		return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
			.map((n) => n.toString().padStart(2, '0')).join(':')
	}

	getColorName(v) {
		const m = {
			0: 'Black', 12517376: 'Red', 191: 'Blue', 48896: 'Green',
			16776960: 'Yellow', 12517567: 'Magenta', 49087: 'Cyan',
			12566463: 'Gray', 4210752: 'Dark Gray', 16777215: 'White',
		}
		return m[v] ?? `RGB(${v})`
	}

	// CDL values are fixed-point with 100000 multiplier (123456 = 1.23456)
	cdlFixed(v) { return (v / 100000).toFixed(5) }

	isVRaptor() { return VRAPTOR_CAMERA_TYPES.has(this.cameraTypeNum) }

	_clearTimers() {
		if (this.resync_timer)    { clearInterval(this.resync_timer);    this.resync_timer    = null }
		if (this.caminfo_timer)   { clearInterval(this.caminfo_timer);   this.caminfo_timer   = null }
		if (this.heartbeat_timer) { clearInterval(this.heartbeat_timer); this.heartbeat_timer = null }
		if (this.reconnect_timer) { clearTimeout(this.reconnect_timer);  this.reconnect_timer = null }
	}

	// ── Config ────────────────────────────────────────────────────────────────

	getConfigFields() {
		return [
			{ type: 'textinput', id: 'host', label: 'Camera IP Address', width: 8, default: '' },
			{
				type: 'static-text', id: 'info', label: 'Notes', width: 12,
				value: 'RED RCP2 connects on port 9998. Max 8 simultaneous connections per camera (1 recommended per application).',
			},
		]
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	async init(config) {
		this.currentExposureAdjust = 0
		this.lutSdi1Enabled = false
		this.lutSdi2Enabled = false
		this.cameraTypeNum  = 0  // 50=KOMODO, 51=V-RAPTOR, 52=V-RAPTOR XL, 53=KOMODO-X
		this.pollOnlyParams = null  // non-subscribed params to poll at heartbeat
		this.config = config
		this.ws = null
		this.resync_timer = null; this.caminfo_timer = null
		this.heartbeat_timer = null; this.reconnect_timer = null

		this._varStore = {
			// Connection state
			connected: 'Disconnected',
			// Exposure
			iso: '', white_balance: '', fps: '', shutter: '',
			aperture: '', exposure_adjust: '', nd: '',
			// Recording
			recording: '', record_format: '', record_codec: '',
			record_duration: '', record_mode: '',
			// Color/grading
			tint: '', color_space: '', roll_off: '',
			// CDL (rcp_cur_cdl — all arrive in one message, fixed-point /100000)
			cdl_slope_r: '', cdl_slope_g: '', cdl_slope_b: '',
			cdl_offset_r: '', cdl_offset_g: '', cdl_offset_b: '',
			cdl_power_r: '', cdl_power_g: '', cdl_power_b: '',
			cdl_saturation: '',
			// Output
			sdi_freq: '',
			// LUT
			lut_project: '', lut_top_lcd: '',
			lut_sdi1: '', lut_sdi2: '',
			lut_sdi1_enabled: '', lut_sdi2_enabled: '',
			// Camera identity
			camera_id: '', camera_pin: '', camera_position: '',
			camera_name: '', camera_type: '', firmware_version: '',
			serial_number: '', camera_runtime: '',
			// Clip/media
			clip_name: '', reel_number: '', total_clips: '',
			media_remaining_min: '', media_remaining_time: '',
			media_capacity_min: '', media_free_space: '', media_used_space: '',
			// Power (ACTIVE_POWER_IN — all cameras per support matrix)
			power_voltage: '', power_current: '', power_percent: '',
			power_runtime: '', power_state: '', power_present: '', power_valid: '',
			// Autofocus
			af_state: '',
			// Tally — USB-C external monitor (all cameras)
			tally_state: '',
			tally_1_color: '', tally_2_color: '', tally_3_color: '',
			tally_opacity: '', tally_style: '', tally_thickness: '',
			// Tally LED — all cameras
			tally_led_enable: '',
			// Timecode
			timecode: '', timecode_display_mode: '',
			// Recording extras
			exposure_integration_time: '', timelapse_interval: '',
			pre_record_start: '', record_format_rect_sdi1: '',
			record_format_rect_sdi2: '', format_arg_camera_id: '',
			// Calibration
			cal_status_temp: '', cal_current_temp: '',
			// Display extras
			magnify_dsi1: '', sdi2_freq: '', frame_guide_color: '', power_type: '',
			// Display tools
			log_view: '', false_color: '', peaking: '',
		}
		this._initVariableProxy()

		this.updateStatus(InstanceStatus.Connecting)
		this.connect()
		this.initVariables()
		this.initActions()
		this.initFeedbacks()
		if (typeof this.subscribeFeedbacks === 'function') this.subscribeFeedbacks()
		this.isInitialized = true
	}

	async destroy() {
		this._clearTimers()
		if (this.ws) { this.ws.removeAllListeners(); this.ws.close(); this.ws = null }
		this.updateStatus(InstanceStatus.Disconnected)
	}

	async configUpdated(config) { this.config = config; this.connect() }

	// ── Connection ────────────────────────────────────────────────────────────

	connect() {
		this._clearTimers()
		if (this.ws) { this.ws.removeAllListeners(); this.ws.close(); this.ws = null }

		const host = this.config.host ? this.config.host.trim() : ''
		if (!host) { this.updateStatus(InstanceStatus.BadConfig, 'Camera IP is not defined'); return }

		const url = 'ws://' + host + ':9998'
		this.log('debug', 'Connecting to ' + url)
		this.updateStatus(InstanceStatus.Connecting)
		try {
			this.ws = new WebSocket(url)

			this.ws.on('open', () => {
				this.updateStatus(InstanceStatus.Ok)
				this.log('debug', 'Connected to ' + url)

				// Step 1: Announce client — camera waits for this before any other comms
				this.send({
					type: 'rcp_config',
					strings_decoded: 1, json_minified: 1,
					include_cacheable_flags: 0, encoding_type: 'legacy',
					client: { name: 'Companion RED Module', version: '1.4.6' },
				})

				// Step 2: rcp_get_types — required immediately after rcp_config per spec
				this.send({ type: 'rcp_get_types' })

				// Step 3: Camera info — determines type for conditional subscriptions
				this.send({ type: 'rcp_get', id: 'CAMERA_INFO' })

				// Step 4: Ask the camera for its full parameter list — reply is rcp_cur_parameters.
				// Once we receive it we subscribe + rcp_get everything the camera actually supports.
				this.send({ type: 'rcp_get_parameters' })

				// Step 5: Also subscribe our known-good static list immediately as a fallback
				// (rcp_cur_parameters may take a moment to arrive)
				this._sendSubscriptions()
				this._sendHeartbeat()

				this.resync_timer = setInterval(() => {
					this.log('debug', 'Re-sending subscriptions (30s resync)')
					this._sendSubscriptions()
				}, RESYNC_INTERVAL_MS)

				this.caminfo_timer = setInterval(() => {
					this.send({ type: 'rcp_get', id: 'CAMERA_INFO' })
				}, CAMERA_INFO_INTERVAL_MS)

				this.heartbeat_timer = setInterval(() => {
					this._sendHeartbeat()
				}, RESYNC_INTERVAL_MS)
			})

			this.ws.on('message', (data) => {
				try {
					const msg = JSON.parse(data.toString())

					// rcp_session keep-alive — camera drops connection if we don't echo back
					if (msg.type === 'rcp_session') {
						if (msg.status === 'open' && msg.data !== undefined) {
							this.send({ type: 'rcp_session', data: msg.data })
						}
						return
					}

					// rcp_cur_parameters — camera's full supported parameter list
					if (msg.type === 'rcp_cur_parameters' && Array.isArray(msg.parameters)) {
						this._onCameraParameters(msg.parameters)
						return
					}

					if (msg.type && (msg.type.startsWith('rcp_cur') || msg.type === 'rcp_cur_cam_info')) {
						this.handleUpdate(msg)
					}
				} catch (err) {
					this.log('error', 'Message parse error: ' + err.toString())
				}
			})

			this.ws.on('error', (err) => { this.log('error', 'WebSocket error: ' + err.toString()) })

			this.ws.on('close', () => {
				this.updateStatus(InstanceStatus.Disconnected)
				this._clearTimers()
				this.scheduleReconnect()
			})

		} catch (err) {
			this.log('error', 'Connection error: ' + err.toString())
			this.updateStatus(InstanceStatus.ConnectionFailure)
			this.scheduleReconnect()
		}
	}

	scheduleReconnect() {
		if (this.reconnect_timer) return
		this.reconnect_timer = setTimeout(() => {
			this.reconnect_timer = null
			this.log('debug', 'Attempting reconnect...')
			this.connect()
		}, 5000)
	}

	_sendSubscriptions() {
		// Subscribe to critical params immediately for instant feedback.
		// Full subscription happens in _onCameraParameters() once the camera
		// reports what it actually supports — handles all models and firmware versions.
		for (const id of CRITICAL_SUBSCRIBE_PARAMS) {
			this.send({ type: 'rcp_subscribe', id, on_off: true })
			this.send({ type: 'rcp_get', id })
		}
	}

	_sendHeartbeat() {
		// 30-second poll for params not covered by push subscriptions above.
		// These change during a shoot but don't need instant push notification.
		// rcp_get implicitly subscribes, so always follow with on_off:false.
		//
		// Note: subscribed params get push updates automatically from _onCameraParameters
		// and do NOT need to be listed here. This list is only for poll-only params.
		const POLL_30S = new Set([
			// Power / Battery — continuous readings that change every few seconds
			'ACTIVE_POWER_IN_CURRENT',
			'ACTIVE_POWER_IN_INFO',
			'ACTIVE_POWER_IN_LOW_POWER',
			'ACTIVE_POWER_IN_PERCENT',
			'ACTIVE_POWER_IN_PRESENT',
			'ACTIVE_POWER_IN_RUNTIME',
			'ACTIVE_POWER_IN_STATE',
			'ACTIVE_POWER_IN_TYPE',
			'ACTIVE_POWER_IN_VALID',
			'ACTIVE_POWER_IN_VOLTAGE',
			// Calibration temps — can drift during long shoots
			'CALIBRATION_STATUS_TEMPERATURE',
			'CURRENT_CALIBRATION_TEMPERATURE',
			// Camera uptime — increments slowly, useful for maintenance logs
			'CAMERA_RUNTIME',
			// Media remaining — real confirmed DB params (MEDIA_FREE/USED/MINUTES_REMAINING don't exist)
			'MEDIA_CAPACITY',
			'MEDIA_PERCENTAGE_REMAINING',
			'MEDIA_TIME_REMAINING',
			'MEDIA_CLIP_COUNT',
			// Sync — can change if external sync source is connected/disconnected
			'SYNC_SOURCE',
			'SYNC_STATE',
			// Board temperatures — drift throughout a shoot
			'TEMPERATURE_IOB',
			'TEMPERATURE_LEVEL',
			'TEMPERATURE_PCM',
			'TEMPERATURE_PL',
			'TEMPERATURE_PS',
			'TEMPERATURE_SB',
			// USB-C media — name/status can change when media is swapped
			'USBC_MEDIA_NAME',
			'USBC_MEDIA_STATUS',
			// Network connection status
			'USBC_STATUS',
			'WIFI_INFRASTRUCTURE_SIGNAL',
			'WIFI_IP_ADDRESS',
			'WIFI_STATUS',
			'WIRED_NETWORK_STATUS',
		])
		// Stagger the heartbeat sends — 3 params every 500ms rather than all at once.
		// 33 params ÷ 3 per batch × 500ms = ~5.5 seconds spread, CPU barely registers it.
		const hbIds = Array.from(POLL_30S)
		let hbOffset = 0
		const sendHbBatch = () => {
			const batch = hbIds.slice(hbOffset, hbOffset + 3)
			if (batch.length === 0) return
			for (const id of batch) {
				this.send({ type: 'rcp_get', id })
				this.send({ type: 'rcp_subscribe', id, on_off: false })
			}
			hbOffset += 3
			if (hbOffset < hbIds.length) {
				setTimeout(sendHbBatch, 500)
			}
		}
		sendHbBatch()
	}

	_onCameraParameters(parameters) {
		// SKIP: action-only params, streaming params that fire every frame, truncated duplicates.
		// Subscribing or polling these would either do nothing or flood the connection.
		const SKIP = new Set([
			'AUDIO_VU_DATA', 'AUTO_WHITE_BALANCE', 'BROADCAST_BLACK_GAMMA_OFFSET_', 'BROADCAST_LOW_KEY_SATURATION_',
			'BROADCAST_MULTI_MATRIX_SATURATION_', 'CALIBRATE_GYRO', 'CALIBRATION_CLEAR', 'CAMERA_',
			'CAMERA_AWS_DELETE', 'CAMERA_AWS_EXPORT_ALL_TO_MEDIA', 'CAMERA_AWS_EXPORT_TO_MEDIA', 'CAMERA_CDL_APPLY',
			'CAMERA_CDL_APPLY_BUILT_IN_LCD', 'CAMERA_CDL_APPLY_DSI_1', 'CAMERA_CDL_APPLY_SDI_1', 'CAMERA_CDL_APPLY_SDI_2',
			'CAMERA_CDL_DELETE', 'CAMERA_CDL_EXPORT_ALL_TO_MEDIA', 'CAMERA_CDL_EXPORT_TO_MEDIA', 'CAMERA_LICENSE_DELETE',
			'CAMERA_LUT_DELETE', 'CAMERA_LUT_EXPORT_ALL_TO_MEDIA', 'CAMERA_LUT_EXPORT_TO_MEDIA', 'CAMERA_PRESET_APPLY',
			'CAMERA_PRESET_DELETE', 'CAMERA_PRESET_EXPORT_ALL_TO_', 'CAMERA_PRESET_EXPORT_ALL_TO_MEDIA', 'CAMERA_PRESET_EXPORT_TO_MEDIA',
			'CAMERA_SCENE_APPLY', 'CAMERA_SCENE_CREATE', 'CAMERA_SCENE_DELETE', 'CAMERA_SCENE_DELETE_ALL',
			'CAMERA_SCENE_EXPORT_ALL_TO_MEDIA', 'CAMERA_SCENE_EXPORT_TO_MEDIA', 'CAMERA_SCENE_RENAME', 'HISTOGRAM',
			'RESET_FACTORY_DEFAULTS', 'SAVE_LOG', 'SAVE_LOG_INTERNAL', 'SENSOR_CALIBRATION',
			'SENSOR_SYNC_OFFSET_UNIT_PICO_', 'SHUTDOWN', 'SLATE_EXT_FILTER_1', 'SLATE_EXT_FILTER_2',
			'SLATE_EXT_UPLOAD_SERVICE', 'TIMECODE_HIGH_FREQUENCY', 'TIMECODE_JAM',
			'TIMECODE_MANUAL_JAM', 'UPGRADE_CAMERA_FIRMWARE', 'USBC_MEDIA_EJECT', 'VIDEO_FRAMES_BUFFERED',
			'VIDEO_OVERLAY_CLEAR_BUILT_IN_LCD', 'VIDEO_OVERLAY_CLEAR_DSI_1', 'VIDEO_OVERLAY_CLEAR_SDI_1', 'VIDEO_OVERLAY_CLEAR_SDI_2',
			'WIFI_INFRASTRUCTURE_CONNECT', 'WIFI_INFRASTRUCTURE_FORGET', 'WIFI_INFRASTRUCTURE_SCAN',
		])

		// SUBSCRIBE: changes infrequently and matters for instant feedback.
		// Camera pushes on every change — no polling needed for these.
		const SUBSCRIBE = new Set([
			'AF_ENABLE', 'AF_MODE', 'AF_STATE', 'APERTURE',
			'APERTURE_CONTROL', 'APERTURE_LIST_MODE', 'APPLIED_CAMERA_LUT', 'APPLIED_CAMERA_LUT_DSI_1',
			'APPLIED_CAMERA_LUT_SDI_1', 'APPLIED_CAMERA_LUT_SDI_2', 'AUDIO_HEADPHONE_MUTE', 'AUDIO_HEADPHONE_SOURCE',
			'AUDIO_SOURCE', 'BROADCAST_COLOR_SPACE', 'BROADCAST_COLOR_SPACE_SDI_1', 'BROADCAST_COLOR_SPACE_SDI_2',
			'BROADCAST_EOTF', 'BROADCAST_EOTF_SDI_1', 'BROADCAST_EOTF_SDI_2', 'CAMERA_LUT_ENABLE',
			'CAMERA_LUT_ENABLE_BUILT_IN_LCD', 'CAMERA_LUT_ENABLE_DSI_1', 'CAMERA_LUT_ENABLE_SDI_1', 'CAMERA_LUT_ENABLE_SDI_2',
			'CDL', 'CLIP_DURATION', 'CLIP_NAME', 'COLOR_SPACE',
			'COLOR_TEMPERATURE', 'EXPOSURE_ADJUST', 'EXPOSURE_DISPLAY', 'EXPOSURE_INTEGRATION_TIME',
			'EXTERNAL_TALLY_1_COLOR', 'EXTERNAL_TALLY_2_COLOR', 'EXTERNAL_TALLY_3_COLOR', 'EXTERNAL_TALLY_OPACITY',
			'EXTERNAL_TALLY_STATE', 'EXTERNAL_TALLY_STYLE', 'EXTERNAL_TALLY_THICKNESS', 'FALSE_COLOR_ENABLE', 'ISO',
			'LOG_VIEW_ENABLE', 'MEDIA_PERCENTAGE_REMAINING', 'MEDIA_TIME_REMAINING', 'ND',
			'PEAKING_ENABLE', 'RECORD_CODEC', 'RECORD_FORMAT', 'RECORD_FORMAT_RECT_SDI_1',
			'RECORD_FORMAT_RECT_SDI_2', 'RECORD_MODE', 'RECORD_STATE', 'ROLL_OFF',
			'SENSOR_FRAME_RATE', 'SHUTTER_DISPLAY_MODE',
			'SLATE_CAMERA_ID', 'SLATE_CAMERA_OPERATOR', 'SLATE_CAMERA_POS', 'SLATE_DIRECTOR',
			'SLATE_DOP', 'SLATE_PRODUCTION', 'SLATE_SCENE', 'SLATE_SHOT',
			'SLATE_TAKE', 'SLATE_UNIT', 'TALLY_LED_ENABLE', 'TIMECODE', 'TIMECODE_AUTO_JAM',
			'TIMECODE_DISPLAY_MODE', 'TIMECODE_SOURCE', 'TIMECODE_STATE', 'TINT',
		])

		// Everything not in SKIP or SUBSCRIBE is POLL_ONLY:
		// rcp_get at heartbeat interval only — NO subscribe.
		// This covers power, temps, network, sync, hardware status, etc.
		// These either change too fast (voltage, current) or rarely enough
		// that 30s polling is fine and subscribing would waste bandwidth.

		const ids = parameters
			.map(p => p.replace(/^RCP_PARAM_/, ''))
			.filter(id => !SKIP.has(id))

		const subscribeCount = ids.filter(id => SUBSCRIBE.has(id)).length
		this.log('info', 'Camera supports ' + ids.length + ' parameters — subscribing ' + subscribeCount + ', polling rest at heartbeat')

		// Subscribe params get sent immediately — small list, instant feedback needed
		for (const id of ids) {
			if (SUBSCRIBE.has(id)) {
				this.send({ type: 'rcp_subscribe', id, on_off: true })
				this.send({ type: 'rcp_get', id })
			}
		}

		// Store poll-only list for heartbeat
		this.pollOnlyParams = ids.filter(id => !SUBSCRIBE.has(id))

		// Poll-only params are staggered — send in batches of 5 every 500ms.
		// ~900 params ÷ 5 per batch × 500ms = ~90 seconds to fully populate on connect.
		// This keeps CPU flat during connect and avoids starving the ESE/LTC clock.
		// Subscribed params (record state, ISO, tally, timecode) are still live instantly —
		// only telemetry/status trickles in over ~90s, which is acceptable.
		const pollIds = this.pollOnlyParams.slice()
		const BATCH = 5
		const BATCH_INTERVAL_MS = 500
		let offset = 0
		const sendBatch = () => {
			const batch = pollIds.slice(offset, offset + BATCH)
			if (batch.length === 0) return
			for (const id of batch) {
				this.send({ type: 'rcp_get', id })
				this.send({ type: 'rcp_subscribe', id, on_off: false })
			}
			offset += BATCH
			if (offset < pollIds.length) {
				setTimeout(sendBatch, BATCH_INTERVAL_MS)
			}
		}
		sendBatch()

		// Define a Companion variable for every param not already defined.
		// Only call setVariableDefinitions when there are genuinely new vars —
		// it rebuilds Companion's entire variable registry so we minimize calls.
		const existing = new Set(Object.keys(this._varStore))
		const newDefs = []
		for (const id of ids) {
			const varId = id.toLowerCase()
			if (!existing.has(varId)) {
				this._varStore[varId] = ''           // add to backing store directly
				newDefs.push({ variableId: varId, name: id.replace(/_/g, ' ') })
			}
		}
		if (newDefs.length > 0) {
			// Build full def list once using the static base defs + dynamic additions.
			// Cache the result so reconnects don't rebuild if params haven't changed.
			if (!this._dynamicVarDefs) this._dynamicVarDefs = []
			this._dynamicVarDefs.push(...newDefs)
			// Re-register all defs (Companion requires the full list each time)
			const allDefs = [
				...this._staticVarDefs,
				...this._dynamicVarDefs,
			]
			this.setVariableDefinitions(allDefs)
			this.log('info', 'Registered ' + newDefs.length + ' new dynamic variables (' + allDefs.length + ' total)')
		}

	}

	send(json) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(json))
		}
	}

	// ── Variables ─────────────────────────────────────────────────────────────

	initVariables() {
		this._staticVarDefs = [
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
		this._dynamicVarDefs = []   // reset dynamic additions on each init
		this.setVariableDefinitions(this._staticVarDefs)
	}

	// ── Message handler ───────────────────────────────────────────────────────

	handleUpdate(msg) {

		// ── rcp_cur_cdl — CDL has its own message type, NOT rcp_cur_int ──────────
		// Camera sends all CDL values in one batch msg with id=RCP_PARAM_CDL.
		// Values are fixed-point with 100000 multiplier (123456 = 1.23456).
		if (msg.type === 'rcp_cur_cdl') {
			if (msg.slope) {
				this.variables.cdl_slope_r = this.cdlFixed(msg.slope.r ?? 100000)
				this.variables.cdl_slope_g = this.cdlFixed(msg.slope.g ?? 100000)
				this.variables.cdl_slope_b = this.cdlFixed(msg.slope.b ?? 100000)
			}
			if (msg.offset) {
				this.variables.cdl_offset_r = this.cdlFixed(msg.offset.r ?? 0)
				this.variables.cdl_offset_g = this.cdlFixed(msg.offset.g ?? 0)
				this.variables.cdl_offset_b = this.cdlFixed(msg.offset.b ?? 0)
			}
			if (msg.power) {
				this.variables.cdl_power_r = this.cdlFixed(msg.power.r ?? 100000)
				this.variables.cdl_power_g = this.cdlFixed(msg.power.g ?? 100000)
				this.variables.cdl_power_b = this.cdlFixed(msg.power.b ?? 100000)
			}
			if (msg.saturation !== undefined) {
				this.variables.cdl_saturation = this.cdlFixed(msg.saturation)
			}
			return
		}

		// ── rcp_cur_cam_info — camera info response ────────────────────────────
		if (msg.type === 'rcp_cur_cam_info') {
			if (msg.name)                               this.variables.camera_name      = msg.name
			if (msg.serial_number)                      this.variables.serial_number    = msg.serial_number
			if (msg.camera_type && msg.camera_type.str) this.variables.camera_type      = msg.camera_type.str
			if (msg.version && msg.version.str)         this.variables.firmware_version = msg.version.str
			if (msg.camera_type && typeof msg.camera_type.num === 'number') {
				this.cameraTypeNum = msg.camera_type.num
				this.log('info', 'Camera type: ' + msg.camera_type.str + ' (type ' + msg.camera_type.num + ')')
			}
			return
		}

		switch (msg.id) {

			case 'ISO':
				this.variables.iso = (msg.cur && Number.isInteger(msg.cur.val)) ? String(msg.cur.val) : ''
				break

			case 'COLOR_TEMPERATURE':
				if (msg.cur && Number.isInteger(msg.cur.val)) {
					this.variables.white_balance = msg.cur.val + 'K'
				} else if (msg.display && msg.display.str) {
					this.variables.white_balance = msg.display.str.replace(/\s*[Kk]?$/, '') + 'K'
				} else {
					this.variables.white_balance = ''
				}
				break

			case 'SENSOR_FRAME_RATE': {
				// RED rounds some drop-frame rates to the nearest whole milliHz internally:
				//   24000 = 23.976 (displayed as "23.98"), 30000 = 29.97, 60000 = 59.94
				// The lookup below maps these correctly. rcp_cur_str display string is also correct
				// but arrives separately — we handle both and the lookup wins over raw math.
				const fpsLookup = {
					23976: '23.976', 24000: '23.98', 25000: '25',
					29970: '29.97',  30000: '29.97', 47952: '47.95',
					48000: '48',     50000: '50',    59940: '59.94',
					60000: '59.94',  96000: '96',    100000: '100',
					119880: '119.88', 120000: '119.88',
				}
				if (msg.type === 'rcp_cur_int' && msg.cur && typeof msg.cur.val === 'number') {
					this.variables.fps = fpsLookup[msg.cur.val]
						?? (msg.cur.val / 1000).toFixed(3).replace(/\.?0+$/, '')
				} else if (msg.type === 'rcp_cur_str' && msg.display && msg.display.str) {
					// Only use display string if rcp_cur_int hasn't set a value yet
					if (!this.variables.fps) {
						this.variables.fps = msg.display.str.replace(/\s*FPS$/i, '').trim()
					}
				}
				break
			}

			case 'RECORD_STATE': {
				// record_state enum from rcp_cur_types:
				// 0=NOT_RECORDING, 1=RECORDING, 2=FINALIZING, 3=PRE_RECORDING, 4=ENCODING
				const val = msg.cur && msg.cur.val !== undefined ? msg.cur.val : -1
				const stateMap = { 0: 'Idle', 1: 'Recording', 2: 'Finalizing', 3: 'Pre-Recording', 4: 'Encoding' }
				this.variables.recording = stateMap[val] ?? ((msg.display && msg.display.str) ? msg.display.str : 'Unknown')
				if (typeof this.checkFeedbacks === 'function') this.checkFeedbacks('recording_state')
				break
			}

			case 'RECORD_MODE':
				this.variables.record_mode = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'EXPOSURE_DISPLAY':
				if (msg.display && msg.display.str) {
					this.variables.shutter = msg.display.str
				} else if (msg.cur && msg.cur.val) {
					this.variables.shutter = '1/' + (msg.cur.val / 1000).toFixed(2)
				} else {
					this.variables.shutter = ''
				}
				break

			case 'EXPOSURE_ADJUST':
				if (msg.cur && typeof msg.cur.val === 'number') {
					this.currentExposureAdjust = msg.cur.val
					this.variables.exposure_adjust = (msg.cur.val / 1000).toFixed(3)
				} else if (msg.display && msg.display.str) {
					this.variables.exposure_adjust = msg.display.str
				}
				break

			case 'ND':
				this.variables.nd = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'RECORD_FORMAT':
				if (msg.cur && msg.cur.val !== undefined) {
					this.variables.record_format = recordFormatMappingAll[msg.cur.val]
						|| ((msg.display && msg.display.str) ? msg.display.str : 'Unknown (' + msg.cur.val + ')')
				} else if (msg.display && msg.display.str) {
					this.variables.record_format = msg.display.str
				}
				break

			case 'RECORD_CODEC':
				if (msg.cur && Number.isInteger(msg.cur.val)) {
					this.variables.record_codec = recordCodecMapping[msg.cur.val] || ('Unknown (' + msg.cur.val + ')')
				} else {
					this.variables.record_codec = (msg.display && msg.display.str) ? msg.display.str : ''
				}
				break

			case 'TINT':
				this.variables.tint = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'COLOR_SPACE':
				this.variables.color_space = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'ROLL_OFF':
				this.variables.roll_off = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'MONITOR_FREQUENCY_SDI':
				this.variables.sdi_freq = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? msg.cur.val + ' Hz' : '')
				break

			case 'APERTURE': {
				if (!this.lastAperture) this.lastAperture = 'N/A'
				if (msg.cur && typeof msg.cur.val === 'number' && msg.cur.val >= 0) {
					const ei = msg.edit_info || {}
					const div = typeof ei.divider === 'number' ? ei.divider : 1
					const digs = typeof ei.digits === 'number' ? ei.digits : 1
					this.lastAperture = (msg.cur.val / div).toFixed(digs)
					this.variables.aperture = this.lastAperture
				} else if (msg.display && typeof msg.display.str === 'string') {
					const s = msg.display.str.trim()
					const m = s.match(/^T\s+(\d+)\s+(\d+)\/(\d+)/)
					if (m) {
						this.lastAperture = (parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10)).toFixed(1)
					} else {
						const v = parseFloat(s)
						if (!isNaN(v)) this.lastAperture = v.toFixed(1)
					}
					this.variables.aperture = this.lastAperture
				} else {
					this.variables.aperture = this.lastAperture
				}
				break
			}

			case 'CLIP_DURATION':
				this.variables.record_duration = (msg.display && msg.display.str) ? msg.display.str : ''
				break

			case 'APPLIED_CAMERA_LUT':
				this.variables.lut_project = String(
					(msg.display && msg.display.str) ? msg.display.str : (msg.cur && msg.cur.val ? msg.cur.val : '')
				).replace(/\.cube$/i, '')
				break

			case 'APPLIED_CAMERA_LUT_SDI_1': {
				const v = (msg.display && msg.display.str) ? msg.display.str : (msg.cur && msg.cur.val ? msg.cur.val : '')
				this.variables.lut_sdi1 = v ? String(v).replace(/\.cube$/i, '') : 'NO LUT on SDI 1'
				break
			}

			case 'APPLIED_CAMERA_LUT_SDI_2': {
				const v = (msg.display && msg.display.str) ? msg.display.str : (msg.cur && msg.cur.val ? msg.cur.val : '')
				this.variables.lut_sdi2 = v ? String(v).replace(/\.cube$/i, '') : 'NO LUT on SDI 2'
				break
			}

			case 'APPLIED_CAMERA_LUT_DSI_1':
				this.variables.lut_top_lcd = String(
					(msg.display && msg.display.str) ? msg.display.str : (msg.cur && msg.cur.val ? msg.cur.val : '')
				).replace(/\.cube$/i, '')
				break

			case 'ENABLE_CAMERA_LUT_SDI_1': {
				const on = (msg.cur && typeof msg.cur.val === 'number')
					? msg.cur.val === 1
					: !!(msg.display && msg.display.str && (msg.display.str.toLowerCase() === 'on' || msg.display.str === '1'))
				this.lutSdi1Enabled = on
				this.variables.lut_sdi1_enabled = on ? 'On' : 'Off'
				break
			}

			case 'ENABLE_CAMERA_LUT_SDI_2': {
				const on = (msg.cur && typeof msg.cur.val === 'number')
					? msg.cur.val === 1
					: !!(msg.display && msg.display.str && (msg.display.str.toLowerCase() === 'on' || msg.display.str === '1'))
				this.lutSdi2Enabled = on
				this.variables.lut_sdi2_enabled = on ? 'On' : 'Off'
				break
			}

			case 'CAMERA_ID':
				this.variables.camera_id = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'CAMERA_PIN':
				this.variables.camera_pin = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'CAMERA_POSITION':
				if (msg.display && msg.display.str) {
					this.variables.camera_position = msg.display.str
				} else if (msg.cur && typeof msg.cur.val === 'number') {
					this.variables.camera_position = (msg.cur.val >= 0 && msg.cur.val <= 25)
						? String.fromCharCode(65 + msg.cur.val)
						: String(msg.cur.val)
				} else {
					this.variables.camera_position = ''
				}
				break

			case 'CAMERA_RUNTIME':
				this.variables.camera_runtime = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			// CAMERA_INFO — also handled above via rcp_cur_cam_info type check
			case 'CAMERA_INFO':
				if (msg.name)                               this.variables.camera_name      = msg.name
				if (msg.serial_number)                      this.variables.serial_number    = msg.serial_number
				if (msg.camera_type && msg.camera_type.str) this.variables.camera_type      = msg.camera_type.str
				if (msg.version && msg.version.str)         this.variables.firmware_version = msg.version.str
				if (msg.camera_type && typeof msg.camera_type.num === 'number') {
					this.cameraTypeNum = msg.camera_type.num
				}
				break

			case 'MEDIA_MINUTES':
				if (msg.cur && typeof msg.cur.val === 'number') {
					this.variables.media_remaining_min  = String(msg.cur.val)
					this.variables.media_remaining_time = this.minutesToHHMMSS(msg.cur.val)
				} else if (msg.display && msg.display.str) {
					this.variables.media_remaining_min  = msg.display.str
					this.variables.media_remaining_time = this.minutesToHHMMSS(parseInt(msg.display.str, 10))
				} else {
					this.variables.media_remaining_min  = ''
					this.variables.media_remaining_time = ''
				}
				break

			case 'MEDIA_CAPACITY':
				this.variables.media_capacity_min = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'MEDIA_FREE':
				this.variables.media_free_space = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'MEDIA_USED':
				this.variables.media_used_space = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'CLIP_NAME':
				this.variables.clip_name = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'REEL_NUMBER':
				this.variables.reel_number = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'CLIP_COUNT':
				this.variables.total_clips = (msg.cur && typeof msg.cur.val === 'number')
					? String(msg.cur.val)
					: ((msg.display && msg.display.str) ? msg.display.str : '')
				break

			// Power — ACTIVE_POWER_IN_* (correct names per support matrix — all cameras)
			case 'ACTIVE_POWER_IN_VOLTAGE':
				this.variables.power_voltage = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'ACTIVE_POWER_IN_CURRENT':
				this.variables.power_current = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'ACTIVE_POWER_IN_PERCENT':
				this.variables.power_percent = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) + '%' : '')
				break

			case 'ACTIVE_POWER_IN_RUNTIME':
				this.variables.power_runtime = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'ACTIVE_POWER_IN_STATE':
				this.variables.power_state = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'ACTIVE_POWER_IN_PRESENT':
				this.variables.power_present = (msg.cur && typeof msg.cur.val === 'number')
					? (msg.cur.val ? 'Yes' : 'No')
					: ((msg.display && msg.display.str) ? msg.display.str : '')
				break

			case 'ACTIVE_POWER_IN_VALID':
				this.variables.power_valid = (msg.cur && typeof msg.cur.val === 'number')
					? (msg.cur.val ? 'Yes' : 'No')
					: ((msg.display && msg.display.str) ? msg.display.str : '')
				break

			case 'AF_STATE':
				this.variables.af_state = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'TIMECODE':
				this.variables.timecode = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'TIMECODE_DISPLAY':
				this.variables.timecode_display_mode = (msg.display && msg.display.str) ? msg.display.str : ''
				break

			case 'LOG_VIEW_ENABLE':
				this.variables.log_view = (msg.cur && typeof msg.cur.val === 'number')
					? (msg.cur.val ? 'On' : 'Off')
					: ((msg.display && msg.display.str) ? msg.display.str : '')
				break

			case 'FALSE_COLOR_ENABLE':
				this.variables.false_color = (msg.cur && typeof msg.cur.val === 'number')
					? (msg.cur.val ? 'On' : 'Off')
					: ((msg.display && msg.display.str) ? msg.display.str : '')
				break

			case 'PEAKING_ENABLE':
				this.variables.peaking = (msg.cur && typeof msg.cur.val === 'number')
					? (msg.cur.val ? 'On' : 'Off')
					: ((msg.display && msg.display.str) ? msg.display.str : '')
				break

			// Tally — USB-C external monitor (all cameras)
			case 'EXTERNAL_TALLY_STATE': {
				const states = ['Off', 'Tally 1', 'Tally 2', 'Tally 3']
				this.variables.tally_state = (msg.cur && typeof msg.cur.val === 'number')
					? (states[msg.cur.val] || ('State ' + msg.cur.val))
					: ((msg.display && msg.display.str) ? msg.display.str : '')
				if (typeof this.checkFeedbacks === 'function') this.checkFeedbacks('tally_state_active')
				break
			}

			case 'EXTERNAL_TALLY_1_COLOR':
				this.variables.tally_1_color = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && typeof msg.cur.val === 'number' ? this.getColorName(msg.cur.val) : '')
				break

			case 'EXTERNAL_TALLY_2_COLOR':
				this.variables.tally_2_color = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && typeof msg.cur.val === 'number' ? this.getColorName(msg.cur.val) : '')
				break

			case 'EXTERNAL_TALLY_3_COLOR':
				this.variables.tally_3_color = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && typeof msg.cur.val === 'number' ? this.getColorName(msg.cur.val) : '')
				break

			case 'EXTERNAL_TALLY_OPACITY': {
				const opacities = ['25%', '50%', '75%', '100%']
				this.variables.tally_opacity = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && typeof msg.cur.val === 'number' ? (opacities[msg.cur.val] || String(msg.cur.val)) : '')
				break
			}

			case 'EXTERNAL_TALLY_STYLE': {
				const styles = ['Solid', 'Dashed', 'Bracket']
				this.variables.tally_style = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && typeof msg.cur.val === 'number' ? (styles[msg.cur.val] || ('Style ' + msg.cur.val)) : '')
				break
			}

			case 'EXTERNAL_TALLY_THICKNESS': {
				const thicknesses = ['Small', 'Medium', 'Large']
				this.variables.tally_thickness = (msg.display && msg.display.str)
					? msg.display.str
					: (msg.cur && typeof msg.cur.val === 'number' ? (thicknesses[msg.cur.val] || ('Thickness ' + msg.cur.val)) : '')
				break
			}

			// Recording extras
			case 'EXPOSURE_INTEGRATION_TIME':
				this.variables.exposure_integration_time = (msg.display && msg.display.str)
					? msg.display.str : (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'RECORD_TIMELAPSE_INTERVAL':
				this.variables.timelapse_interval = (msg.display && msg.display.str)
					? msg.display.str : (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'PRE_RECORD_START_ON_RECORD':
				this.variables.pre_record_start = (msg.cur && typeof msg.cur.val === 'number')
					? (msg.cur.val ? 'Yes' : 'No') : ((msg.display && msg.display.str) ? msg.display.str : '')
				break

			case 'RECORD_FORMAT_RECT_SDI_1':
				this.variables.record_format_rect_sdi1 = (msg.display && msg.display.str)
					? msg.display.str : (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'RECORD_FORMAT_RECT_SDI_2':
				this.variables.record_format_rect_sdi2 = (msg.display && msg.display.str)
					? msg.display.str : (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'FORMAT_ARG_CAMERA_ID':
				this.variables.format_arg_camera_id = (msg.display && msg.display.str)
					? msg.display.str : (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			// Calibration
			case 'CALIBRATION_STATUS_TEMPERATURE':
				this.variables.cal_status_temp = (msg.display && msg.display.str)
					? msg.display.str : (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'CURRENT_CALIBRATION_TEMPERATURE':
				this.variables.cal_current_temp = (msg.display && msg.display.str)
					? msg.display.str : (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			// Display extras
			case 'MAGNIFY_ENABLE_DSI_1':
				this.variables.magnify_dsi1 = (msg.cur && typeof msg.cur.val === 'number')
					? (msg.cur.val ? 'On' : 'Off') : ((msg.display && msg.display.str) ? msg.display.str : '')
				break

			case 'MONITOR_FREQUENCY_SDI_2':
				this.variables.sdi2_freq = (msg.display && msg.display.str)
					? msg.display.str : (msg.cur && msg.cur.val !== undefined ? msg.cur.val + ' Hz' : '')
				break

			case 'FRAME_GUIDE_1_COLOR':
				this.variables.frame_guide_color = (msg.display && msg.display.str)
					? msg.display.str : (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			case 'ACTIVE_POWER_IN_TYPE':
				this.variables.power_type = (msg.display && msg.display.str)
					? msg.display.str : (msg.cur && msg.cur.val !== undefined ? String(msg.cur.val) : '')
				break

			// Tally LED — all cameras
			case 'TALLY_LED_ENABLE':
				if (msg.cur && typeof msg.cur.val === 'number') {
					this.variables.tally_led_enable = msg.cur.val === 1 ? 'Enabled' : 'Disabled'
				} else {
					this.variables.tally_led_enable = (msg.display && msg.display.str) ? msg.display.str : ''
				}
				break

			default: {
				// Generic handler for any param not explicitly cased above.
				// Uses display string if available, otherwise raw cur.val.
				// Covers all dynamically discovered params from rcp_get_parameters.
				if (!msg.id) break
				const varId = msg.id.toLowerCase()
				if (!(varId in this.variables)) break  // only update if we have a slot for it
				if (msg.display && msg.display.str) {
					this.variables[varId] = msg.display.str
				} else if (msg.cur && msg.cur.val !== undefined && msg.cur.val !== null) {
					this.variables[varId] = String(msg.cur.val)
				}
				break
			}
		}
	}

	// ── Feedbacks ─────────────────────────────────────────────────────────────

	initFeedbacks() {
		this.setFeedbackDefinitions({
			recording_state: {
				type: 'boolean',
				name: 'Recording State',
				description: 'Change style when camera is recording',
				defaultStyle: { color: 0xffffff, bgcolor: 0xff0000 },
				options: [],
				callback: () => this.variables.recording === 'Recording',
			},
			tally_state_active: {
				type: 'boolean',
				name: 'Tally State Active',
				description: 'Change style when external monitor tally is active',
				defaultStyle: { color: 0xffffff, bgcolor: 0xff0000 },
				options: [{
					type: 'dropdown', label: 'Tally State', id: 'state', default: '1',
					choices: [{ id: '1', label: 'Tally 1' }, { id: '2', label: 'Tally 2' }, { id: '3', label: 'Tally 3' }],
				}],
				callback: (feedback) => {
					const states = { '1': 'Tally 1', '2': 'Tally 2', '3': 'Tally 3' }
					return this.variables.tally_state === states[feedback.options.state]
				},
			},
		})
	}

	// ── Actions ───────────────────────────────────────────────────────────────

	initActions() {
		this.setActionDefinitions({

			// Recording — set_record_state enum values from rcp_cur_types:
			// STOP=0, START=1, TOGGLE=2, PRE_RECORD_STOP=3
			start_recording: {
				name: 'Start Recording',
				options: [],
				callback: () => this.send({ type: 'rcp_set', id: 'RECORD_STATE', value: 1 }),
			},
			stop_recording: {
				name: 'Stop Recording',
				options: [],
				callback: () => this.send({ type: 'rcp_set', id: 'RECORD_STATE', value: 0 }),
			},
			toggle_recording: {
				name: 'Toggle Recording',
				options: [],
				callback: () => this.send({ type: 'rcp_set', id: 'RECORD_STATE', value: 2 }),
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
					const newVal = Math.min(8000, (this.currentExposureAdjust || 0) + step)
					this.send({ type: 'rcp_set', id: 'EXPOSURE_ADJUST', value: newVal })
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
					const newVal = Math.max(-8000, (this.currentExposureAdjust || 0) - step)
					this.send({ type: 'rcp_set', id: 'EXPOSURE_ADJUST', value: newVal })
				},
			},
			set_exposure_adjust: {
				name: 'Set Exposure Adjust (Static)',
				options: [{ type: 'number', label: 'Target Value', id: 'value', default: 0.0, min: -8.0, max: 8.0, step: 0.001 }],
				callback: async (action, context) => {
					const v = parseFloat(await context.parseVariablesInString(action.options.value))
					if (!isNaN(v)) this.send({ type: 'rcp_set', id: 'EXPOSURE_ADJUST', value: Math.round(Math.min(8, Math.max(-8, v)) * 1000) })
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
					if (!isNaN(value)) this.send({ type: 'rcp_set', id: 'COLOR_TEMPERATURE', value })
				},
			},

			// ISO
			set_iso: {
				name: 'Set ISO',
				options: [{ type: 'dropdown', label: 'ISO', id: 'iso', default: '800', choices: ISO_CHOICES }],
				callback: async (action, context) => {
					const iso = parseInt(await context.parseVariablesInString(action.options.iso), 10)
					this.send({ type: 'rcp_set', id: 'ISO', value: iso })
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
					this.send({ type: 'rcp_set', id: 'SENSOR_FRAME_RATE', value: parseInt(await context.parseVariablesInString(action.options.fps), 10) })
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
					this.send({ type: 'rcp_set', id: 'RECORD_FORMAT', value: parseInt(await context.parseVariablesInString(action.options.record_format), 10) })
				},
			},

			// Camera identity
			set_camera_id: {
				name: 'Set Camera ID',
				options: [{ type: 'textinput', label: 'Camera ID (max 63 chars)', id: 'camera_id', default: '', useVariables: true }],
				callback: async (action, context) => {
					const id = await context.parseVariablesInString(action.options.camera_id)
					if (id) this.send({ type: 'rcp_set', id: 'CAMERA_ID', value: id })
				},
			},
			set_reel_number: {
				name: 'Set Reel Number',
				options: [{ type: 'number', label: 'Reel Number (1-999)', id: 'reel', default: 1, min: 1, max: 999 }],
				callback: async (action, context) => {
					const reel = parseInt(await context.parseVariablesInString(action.options.reel), 10)
					if (!isNaN(reel) && reel >= 1 && reel <= 999) this.send({ type: 'rcp_set', id: 'REEL_NUMBER', value: reel })
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
					if (!isNaN(pos) && pos >= 0 && pos <= 25) this.send({ type: 'rcp_set', id: 'CAMERA_POSITION', value: pos })
				},
			},

			// LUT
			toggle_lut_sdi1:  { name: 'Toggle LUT on SDI 1',  options: [], callback: () => this.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_1', value: this.lutSdi1Enabled ? 0 : 1 }) },
			toggle_lut_sdi2:  { name: 'Toggle LUT on SDI 2',  options: [], callback: () => this.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_2', value: this.lutSdi2Enabled ? 0 : 1 }) },
			enable_lut_sdi1:  { name: 'Enable LUT on SDI 1',  options: [], callback: () => this.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_1', value: 1 }) },
			disable_lut_sdi1: { name: 'Disable LUT on SDI 1', options: [], callback: () => this.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_1', value: 0 }) },
			enable_lut_sdi2:  { name: 'Enable LUT on SDI 2',  options: [], callback: () => this.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_2', value: 1 }) },
			disable_lut_sdi2: { name: 'Disable LUT on SDI 2', options: [], callback: () => this.send({ type: 'rcp_set', id: 'ENABLE_CAMERA_LUT_SDI_2', value: 0 }) },

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
					this.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_STATE', value: parseInt(await context.parseVariablesInString(action.options.state), 10) })
				},
			},
			set_tally_1_color: {
				name: 'Set External Monitor Tally 1 Color',
				options: [{ type: 'dropdown', label: 'Color', id: 'color', default: '12517376', choices: TALLY_COLOR_CHOICES }],
				callback: async (action, context) => {
					this.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_1_COLOR', value: parseInt(await context.parseVariablesInString(action.options.color), 10) })
				},
			},
			set_tally_2_color: {
				name: 'Set External Monitor Tally 2 Color',
				options: [{ type: 'dropdown', label: 'Color', id: 'color', default: '48896', choices: TALLY_COLOR_CHOICES }],
				callback: async (action, context) => {
					this.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_2_COLOR', value: parseInt(await context.parseVariablesInString(action.options.color), 10) })
				},
			},
			set_tally_3_color: {
				name: 'Set External Monitor Tally 3 Color',
				options: [{ type: 'dropdown', label: 'Color', id: 'color', default: '16776960', choices: TALLY_COLOR_CHOICES }],
				callback: async (action, context) => {
					this.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_3_COLOR', value: parseInt(await context.parseVariablesInString(action.options.color), 10) })
				},
			},
			set_tally_opacity: {
				name: 'Set External Monitor Tally Opacity',
				options: [{
					type: 'dropdown', label: 'Opacity', id: 'opacity', default: '3',
					choices: [{ id: '0', label: '25%' }, { id: '1', label: '50%' }, { id: '2', label: '75%' }, { id: '3', label: '100%' }],
				}],
				callback: async (action, context) => {
					this.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_OPACITY', value: parseInt(await context.parseVariablesInString(action.options.opacity), 10) })
				},
			},
			set_tally_style: {
				name: 'Set External Monitor Tally Style',
				options: [{
					type: 'dropdown', label: 'Style', id: 'style', default: '0',
					choices: [{ id: '0', label: 'Solid' }, { id: '1', label: 'Dashed' }, { id: '2', label: 'Bracket' }],
				}],
				callback: async (action, context) => {
					this.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_STYLE', value: parseInt(await context.parseVariablesInString(action.options.style), 10) })
				},
			},
			set_tally_thickness: {
				name: 'Set External Monitor Tally Thickness',
				options: [{
					type: 'dropdown', label: 'Thickness', id: 'thickness', default: '1',
					choices: [{ id: '0', label: 'Small' }, { id: '1', label: 'Medium' }, { id: '2', label: 'Large' }],
				}],
				callback: async (action, context) => {
					this.send({ type: 'rcp_set', id: 'EXTERNAL_TALLY_THICKNESS', value: parseInt(await context.parseVariablesInString(action.options.thickness), 10) })
				},
			},

			// Tally LED — all cameras
			enable_tally_led: {
				name: 'Enable Camera Body Tally LED',
				options: [],
				callback: () => this.send({ type: 'rcp_set', id: 'TALLY_LED_ENABLE', value: 1 }),
			},
			disable_tally_led: {
				name: 'Disable Camera Body Tally LED',
				options: [],
				callback: () => this.send({ type: 'rcp_set', id: 'TALLY_LED_ENABLE', value: 0 }),
			},
			toggle_tally_led: {
				name: 'Toggle Camera Body Tally LED',
				options: [],
				callback: () => this.send({ type: 'rcp_set', id: 'TALLY_LED_ENABLE', value: this.variables.tally_led_enable === 'Enabled' ? 0 : 1 }),
			},

			// System
			shutdown_camera: {
				name: 'Shutdown Camera',
				options: [{ type: 'checkbox', label: 'Confirm Shutdown (must be checked to proceed)', id: 'confirm', default: false }],
				callback: async (action) => {
					if (action.options.confirm) {
						this.send({ type: 'rcp_set', id: 'SHUTDOWN', value: 1 })
						this.log('info', 'Shutdown command sent to camera')
					} else {
						this.log('warn', 'Shutdown not confirmed — checkbox must be enabled')
					}
				},
			},
			send_command: {
				name: 'Send Generic Command',
				options: [{ type: 'textinput', label: 'Raw JSON Data', id: 'data', default: '{ "type": "rcp_set", "id": "ISO", "val": 800 }', useVariables: true }],
				callback: async (action, context) => {
					const msg = await context.parseVariablesInString(action.options.data)
					if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(msg)
					else this.log('error', 'WebSocket not open')
				},
			},
		})
	}
}

runEntrypoint(RedRCP2Instance, upgradeScripts)
