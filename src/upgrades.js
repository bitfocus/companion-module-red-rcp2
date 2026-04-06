export const upgradeScripts = [
	function v140_renameRecordingActions(_context, props) {
		const actionMap = {
			start_record:  'start_recording',
			stop_record:   'stop_recording',
			toggle_record: 'toggle_recording',
		}
		for (const action of props.actions) {
			if (actionMap[action.actionId]) {
				action.actionId = actionMap[action.actionId]
			}
		}
		props.feedbacks = props.feedbacks.filter((fb) => fb.feedbackId !== 'websocket_variable')
		return { updatedConfig: null, updatedActions: props.actions, updatedFeedbacks: props.feedbacks }
	},
]
