import {describe, it, expect, beforeEach, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {setActivePinia, createPinia} from 'pinia'

// Mounting the full TaskDetailView exercises the load-bearing integration: the
// watch(taskId) loader calling loadCustomFields + setActiveFields reading the
// map to show/hide the section. Everything heavy (partials, router, i18n) is
// mocked or shallow-stubbed so the view's own setup runs but no child does.
const {routerMock} = vi.hoisted(() => ({
	routerMock: {
		back: vi.fn(),
		push: vi.fn(),
		replace: vi.fn(),
		options: {history: {state: {}}},
		currentRoute: {value: {params: {}, fullPath: '/tasks/1'}},
		isReady: () => Promise.resolve(),
	},
}))
vi.mock('vue-router', async (importOriginal) => ({
	...await importOriginal<typeof import('vue-router')>(),
	useRouter: () => routerMock,
	useRoute: () => ({params: {taskId: '1'}, hash: '', fullPath: '/tasks/1'}),
	onBeforeRouteLeave: vi.fn(),
}))
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (k: string) => k}), createI18n: () => ({global: {t: (k: string) => k}})}))
// Reactions imports this statically; its extensionless subpath import does not
// resolve under vitest, which would fail the whole view's module graph.
vi.mock('vuemoji-picker', () => ({VuemojiPicker: {name: 'VuemojiPicker', render: () => null}}))

vi.mock('@/services/task', () => ({
	default: class {
		loading = false
		get = vi.fn().mockResolvedValue({
			id: 1,
			projectId: 1,
			title: 'Test Task',
			maxPermission: 2,
			isUnread: false,
			assignees: [],
			attachments: [],
			labels: [],
			reminders: [],
			relatedTasks: {},
			reactions: {},
			comments: [],
			percentDone: 0,
			priority: 0,
			dueDate: null,
			startDate: null,
			endDate: null,
			repeatAfter: null,
			repeatMode: 0,
			hexColor: '',
			timeEntriesCount: 0,
		})
	},
}))

import TaskDetailView from './TaskDetailView.vue'
import CustomFields from '@/components/tasks/partials/CustomFields.vue'
import {useTaskStore} from '@/stores/tasks'
import type {CustomFieldValuesMap} from '@/modelTypes/ICustomField'

function textEntry(id: number, value: unknown): CustomFieldValuesMap {
	return {
		[String(id)]: {
			value,
			field: {id, name: 'Field', type: 'text', field_config: {}, display_order: 0, project_ids: [1]},
		},
	}
}

// Mounts the view with loadCustomFields replaced by a spy that mirrors the real
// store action's contract: write the map into customFieldValues, then resolve.
async function mountView(map: CustomFieldValuesMap | null) {
	setActivePinia(createPinia())
	const store = useTaskStore()
	store.loadCustomFields = map === null
		? vi.fn().mockRejectedValue({response: {status: 404}})
		: vi.fn(async (taskId: number) => {
			store.customFieldValues[taskId] = map
			return map
		})

	const wrapper = mount(TaskDetailView, {
		props: {taskId: 1},
		shallow: true,
		global: {
			// CustomTransition wraps <transition> around a default slot; the default
			// shallow stub discards slot content, so the v-if'd columns (native and
			// custom fields alike) would never render.
			stubs: {
				CustomTransition: {template: '<div><slot /></div>'},
			},
			mocks: {
				$t: (k: string) => k,
			},
		},
	})
	await flushPromises()
	return {wrapper, store}
}

describe('TaskDetailView custom fields integration', () => {
	beforeEach(() => {
		routerMock.replace.mockClear()
	})

	it('loads custom fields on task load', async () => {
		const {store} = await mountView(textEntry(3, 'x'))
		expect(store.loadCustomFields).toHaveBeenCalledWith(1)
	})

	it('renders the custom fields section when the values map is non-empty', async () => {
		const {wrapper} = await mountView(textEntry(3, 'x'))
		const section = wrapper.find('.column.custom-fields')
		expect(section.exists()).toBe(true)
		expect(section.find('.detail-title').text()).toBe('task.attributes.customFields')

		const fields = wrapper.findComponent(CustomFields)
		expect(fields.exists()).toBe(true)
		expect(fields.props('taskId')).toBe(1)
		expect(fields.props('canWrite')).toBe(true)
	})

	it('renders no custom fields section when the values map is empty', async () => {
		const {wrapper} = await mountView({})
		expect(wrapper.find('.column.custom-fields').exists()).toBe(false)
	})

	it('hides the section but keeps the task page when loading custom fields fails', async () => {
		// The plugin endpoint 404s when the plugin is not loaded; the watch's main
		// catch treats 404 as task-not-found and routes away. The custom-fields
		// load must be isolated so a missing plugin never kills the task page.
		const {wrapper} = await mountView(null)
		expect(wrapper.find('.column.custom-fields').exists()).toBe(false)
		expect(wrapper.find('.task-view').exists()).toBe(true)
		expect(routerMock.replace).not.toHaveBeenCalled()
	})
})
