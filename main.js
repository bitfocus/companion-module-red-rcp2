import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base'
import WebSocket from 'ws'
import objectPath from 'object-path'
import { upgradeScripts } from './upgrade.js'

// Mapping for all possible record formats with friendly labels and aspect ratios.
const recordFormatMappingAll = {
	0: "6K 16:9",      // FORMAT_6K_FF
	1: "5K 16:9",      // FORMAT_5K_FF
	2: "4K 16:9",      // FORMAT_4K_FF
	3: "6K 16:9",      // FORMAT_6K_HD
	4: "2K 16:9",      // FORMAT_2K_FF
	5: "6K 2.39:1",    // FORMAT_6K_WS
	6: "8K 16:9",      // FORMAT_8K_FF
	7: "8K 16:9",      // FORMAT_8K_HD
	8: "8K 21:9",      // FORMAT_8K_2_1
	9: "8K 2.39:1",    // FORMAT_8K_WS
	10: "7K 16:9",     // FORMAT_7K_FF
	11: "7K 16:9",     // FORMAT_7K_HD
	12: "7K 21:9",     // FORMAT_7K_2_1
	13: "7K 2.39:1",   // FORMAT_7K_WS
	14: "6K 21:9"      // FORMAT_6K_2_1
}

class RedRCP2Instance extends InstanceBase {
	isInitialized = false
	subscriptions = new Map()

	async init(config) {
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
			{ variableId: 'iso', name: 'ISO' },
			{ variableId: 'white_balance', name: 'White Balance' },
			{ variableId: 'fps', name: 'Sensor Frame Rate' },
			{ variableId: 'recording', name: 'Recording State' },
			{ variableId: 'shutter', name: 'Shutter' },
			{ variableId: 'record_format', name: 'Record Format' }
		])
		this.setVariableValues(this.variables)
	}

	subscribeToParameters() {
		const ids = [
			'ISO',
			'COLOR_TEMPERATURE',
			'SENSOR_FRAME_RATE',
			'RECORD_STATE',
			'EXPOSURE_DISPLAY',
			'RECORD_FORMAT'
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
					client: { name: 'Companion RED Module', version: '1.0.0' }
				})
				this.subscribeToParameters()
				this.polling = setInterval(() => this.pollParameters(), 1000)
			})

			this.ws.on('message', data => {
				let msg
				try { msg = JSON.parse(data) } catch (e) {
					this.log('error', `Failed to parse message: ${data}`)
					return
				}
				if (msg.type && msg.type.startsWith('rcp_cur')) {
					this.handleUpdate(msg)
				}
			})

			this.ws.on('error', err => {
				this.log('error', `WebSocket error: ${err.message}`)
				this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
				this.maybeReconnect()
			})

			this.ws.on('close', code => {
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
		// Retry after 5 seconds
		this.reconnect_timer = setTimeout(() => {
			this.log('debug', 'Attempting reconnect...')
			this.connect()
		}, 5000)
	}

	handleUpdate(msg) {
		this.log('debug', `Received message: ${JSON.stringify(msg)}`)
		switch (msg.id) {
			case 'ISO':
				this.variables.iso = (msg.cur && msg.cur.val) ? msg.cur.val : (msg.val || '')
				break

			case 'COLOR_TEMPERATURE':
				if (msg.cur && msg.cur.val) {
					this.variables.white_balance = msg.cur.val
				} else if (msg.display && msg.display.str) {
					this.variables.white_balance = msg.display.str
				} else {
					this.variables.white_balance = msg.val || ''
				}
				break

			case 'SENSOR_FRAME_RATE': {
					if (msg.type === 'rcp_cur_str' && msg.display && msg.display.str) {
						this.variables.fps = msg.display.str
					} else if (msg.type === 'rcp_cur_int_edit_info' && msg.cur && msg.cur.val) {
						const divider = msg.divider || 1
						const digits = (msg.digits !== undefined) ? msg.digits : 2
						this.variables.fps = `${(msg.cur.val/divider).toFixed(digits)} FPS`
					} else {
						this.log('debug', `Ignoring SENSOR_FRAME_RATE update of type ${msg.type}`)
					}
					break
			}

			case 'RECORD_STATE':
				this.variables.recording = ((msg.cur && msg.cur.val) || msg.val) === 1 ? 'Recording' : 'Idle'
				break

			case 'EXPOSURE_DISPLAY':
				if (msg.display && msg.display.str) {
					this.variables.shutter = msg.display.str
				} else if (msg.cur && msg.cur.val) {
					this.variables.shutter = `1/${(msg.cur.val/1000).toFixed(2)}`
				} else {
					this.variables.shutter = ''
				}
				break

			case 'RECORD_FORMAT': {
				if (msg.type === 'rcp_cur_int' && msg.cur && msg.cur.val !== undefined) {
					this.variables.record_format = recordFormatMappingAll[msg.cur.val] || `Unknown (${msg.cur.val})`
				} else {
					this.log('debug', `Ignoring RECORD_FORMAT message of type ${msg.type}`)
				}
				break
			}

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
			{ type: 'static-text', id: 'info', width: 12, label: 'Note', value: 'Enter only the IP address of the RED camera. Port 9998 and ws:// are automatically added.' }
		]
	}

	initFeedbacks() {
		this.setFeedbackDefinitions({
			websocket_variable: {
				type: 'advanced', name: 'Update variable with value from WebSocket message',
				description: 'Receive messages from the WebSocket and set the value to a variable. Variables can be used on any button.',
				options: [
					{ type: 'textinput', label: 'JSON Path (blank if not json)', id: 'subpath', default: '' },
					{ type: 'textinput', label: 'Variable', id: 'variable', regex: '/^[-a-zA-Z0-9_]+$/', default: '' }
				],
				callback: () => ({}),
				subscribe: feedback => {
					this.subscriptions.set(feedback.id, { variableName: feedback.options.variable, subpath: feedback.options.subpath })
					if (this.isInitialized) this.updateVariables(feedback.id)
				},
				unsubscribe: feedback => this.subscriptions.delete(feedback.id),
			}
		})
	}

	initActions() {
		this.setActionDefinitions({
			set_iso: {
				name: 'Set ISO', options: [{ type: 'dropdown', label: 'ISO', id: 'iso', default: '1000', choices: [
					{ id: '250', label: '250' },{ id: '320', label: '320' },{ id: '400', label: '400' },{ id: '500', label: '500' },
					{ id: '640', label: '640' },{ id: '800', label: '800' },{ id: '1000', label: '1000' },{ id: '1280', label: '1280' }
				]}],
				callback: async (action, context) => {
					const iso = parseInt(await context.parseVariablesInString(action.options.iso),10)
					this.send({ type:'rcp_set', id:'ISO', value:iso })
					this.log('debug', `Sending ISO set to ${iso}`)
				}
			},
			set_sensor_fps: {
				name:'Set Sensor Frame Rate', options:[{ type:'dropdown', label:'Sensor Frame Rate', id:'fps', default:'24000', choices:[
					{ id:'60000', label:'59.94 FPS'},{ id:'24000', label:'23.98 FPS'}
				]}],
				callback: async (action, context) => {
					const fps = parseInt(await context.parseVariablesInString(action.options.fps),10)
					this.send({ type:'rcp_set', id:'SENSOR_FRAME_RATE', value:fps })
					this.log('debug', `Sending SENSOR_FRAME_RATE set to ${fps}`)
				}
			},
			set_record_format: {
				name:'Set Record Format', options:[{ type:'dropdown', label:'Record Format', id:'record_format', default:'3', choices:[
					{ id:'7', label:'8K'},{ id:'11', label:'7K'},{ id:'3', label:'6K'},{ id:'1', label:'5K' }
				]}],
				callback: async (action, context) => {
					const val = parseInt(await context.parseVariablesInString(action.options.record_format),10)
					this.send({ type:'rcp_set', id:'RECORD_FORMAT', value:val })
					this.log('debug', `Sending RECORD_FORMAT set to ${val}`)
				}
			},
			start_record: {
				name:'Start Recording', options:[], callback: () => this.send({ type:'rcp_set', id:'RECORD_STATE', value:1 })
			},
			stop_record: {
				name:'Stop Recording', options:[], callback: () => this.send({ type:'rcp_set', id:'RECORD_STATE', value:0 })
			},
			send_command: {
				name:'Send Generic Command', options:[{ type:'textinput', label:'Data', id:'data', default:'', useVariables:true }],
				callback: async (action, context) => {
					const msg = await context.parseVariablesInString(action.options.data)
					if (this.ws && this.ws.readyState===WebSocket.OPEN) this.ws.send(msg)
					else this.log('error','WebSocket not open')
				}
			}
		})
	}
}

runEntrypoint(RedRCP2Instance, upgradeScripts)
