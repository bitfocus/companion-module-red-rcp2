import { MAGNIFY_OUTPUT_CHOICES } from './actions.js'

export function getFeedbackDefinitions(self) {
	return {
		recording_state: {
			type: 'boolean',
			name: 'Recording State',
			description: 'Change style when camera is recording',
			defaultStyle: { color: 0xffffff, bgcolor: 0xff0000 },
			options: [],
			callback: () => self.variables.recording === 'Recording',
		},
		magnify_active: {
			type: 'boolean',
			name: 'Magnify Active',
			description: 'Change style when magnify is enabled on the selected output',
			defaultStyle: { color: 0x000000, bgcolor: 0xffaa00 },
			options: [{
				type: 'dropdown', label: 'Output', id: 'output', default: 'MAGNIFY_ENABLE_SDI_1',
				choices: MAGNIFY_OUTPUT_CHOICES,
			}],
			callback: (feedback) => !!self.magnifyState[feedback.options.output],
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
				return self.variables.tally_state === states[feedback.options.state]
			},
		},
	}
}
