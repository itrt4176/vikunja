import {describe, it, expect, vi} from 'vitest'
import {mount} from '@vue/test-utils'
import {setActivePinia, createPinia} from 'pinia'
import {defineComponent} from 'vue'

vi.mock('@/router', () => ({default: {currentRoute: {value: {params: {}}}, isReady: () => Promise.resolve()}}))
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (k: string) => k}), createI18n: () => ({global: {t: (k: string) => k}})}))
vi.mock('@/stores/base', () => ({useBaseStore: () => ({setHasTasks: vi.fn()})}))
vi.mock('@/services/customField', () => ({
	default: class {
		getValues = vi.fn()
		bulkUpsert = vi.fn()
		delete = vi.fn()
	},
}))

// AsyncEditor is a dynamic import (TipTap). Mock the module with a stub that
// emits `save` on a button click so the textarea commit-on-@save wiring is
// exercisable — TipTap emits `save` on its Save button (bubbleSave), not on blur
// (blur doesn't bubble from the contenteditable to the root <div>). vi.mock is
// hoisted above the import, so the stub is built in vi.hoisted (defineComponent
// is only available at runtime, not hoist time).
const {AsyncEditorStub} = vi.hoisted(() => {
	const {defineComponent} = require('vue')
	return {
		AsyncEditorStub: defineComponent({
			name: 'AsyncEditor',
			emits: ['save', 'update:modelValue'],
			template: '<div class="async-editor-stub"><button class="stub-save" @click="$emit(\'save\')">save</button></div>',
		}),
	}
})
vi.mock('@/components/input/AsyncEditor', () => ({default: AsyncEditorStub}))

import CustomFields from './CustomFields.vue'
import {useTaskStore} from '@/stores/tasks'
import type {CustomFieldValuesMap, ICustomFieldDefinition} from '@/modelTypes/ICustomField'

function def(partial: Partial<ICustomFieldDefinition> & Pick<ICustomFieldDefinition, 'id' | 'type'>): ICustomFieldDefinition {
	return {name: 'Field', field_config: {}, display_order: 0, project_ids: [], ...partial}
}
function entry(value: unknown, field: ICustomFieldDefinition) {
	return {value, field}
}

function mountFields(taskId: number, map: CustomFieldValuesMap, canWrite = true) {
	setActivePinia(createPinia())
	const store = useTaskStore()
	store.customFieldValues[taskId] = map
	store.saveCustomFieldValue = vi.fn().mockResolvedValue(map)
	store.clearCustomFieldValue = vi.fn().mockResolvedValue(undefined)
	store.loadCustomFields = vi.fn().mockResolvedValue(map)
	const wrapper = mount(CustomFields, {
		props: {taskId, canWrite},
		// CustomTransition is a real <transition>; stubbing it would discard the
		// v-for slot (and the .detail-title inside).
		global: {mocks: {$t: (k: string) => k}},
	})
	return {wrapper, store}
}

describe('CustomFields.vue', () => {
	it('renders nothing when the map is empty', () => {
		const {wrapper} = mountFields(1, {})
		expect(wrapper.find('.custom-fields').exists()).toBe(false)
	})

	it('renders one row per entry, sorted by display_order', () => {
		const map: CustomFieldValuesMap = {
			'3': entry(null, def({id: 3, type: 'text', display_order: 2, name: 'B'})),
			'7': entry(null, def({id: 7, type: 'text', display_order: 1, name: 'A'})),
		}
		const {wrapper} = mountFields(1, map)
		const labels = wrapper.findAll('.detail-title').map(n => n.text())
		expect(labels).toEqual(['A', 'B']) // display_order 1 before 2
	})

	it('disables the input when is_api_only', () => {
		const map: CustomFieldValuesMap = {'3': entry('x', def({id: 3, type: 'text', field_config: {is_api_only: true}}))}
		const {wrapper} = mountFields(1, map)
		const input = wrapper.find('input')
		expect(input.attributes('disabled')).toBeDefined()
	})

	it('disables the input when !canWrite', () => {
		const map: CustomFieldValuesMap = {'3': entry('x', def({id: 3, type: 'text'}))}
		const {wrapper} = mountFields(1, map, /*canWrite*/ false)
		expect(wrapper.find('input').attributes('disabled')).toBeDefined()
	})

	it('renders the right input per type', () => {
		const map: CustomFieldValuesMap = {
			'1': entry('hi', def({id: 1, type: 'text'})),
			'2': entry(true, def({id: 2, type: 'checkbox'})),
			'3': entry(null, def({id: 3, type: 'date'})),
			'4': entry(null, def({id: 4, type: 'select', options: [{id: 1, value: 'a', label: 'A', display_order: 0}]})),
		}
		const {wrapper} = mountFields(1, map)
		// text → FormInput (input); checkbox → FancyCheckbox (input[type=checkbox]);
		// date → Datepicker (a .datepicker); select → Multiselect (a combobox input)
		expect(wrapper.findAll('input').length).toBeGreaterThanOrEqual(2)
		expect(wrapper.find('.datepicker').exists() || wrapper.findComponent({name: 'Datepicker'}).exists()).toBe(true)
	})

	it('save-vs-clear: empty value routes to clearCustomFieldValue', async () => {
		const map: CustomFieldValuesMap = {'3': entry('x', def({id: 3, type: 'text'}))}
		const {wrapper, store} = mountFields(1, map)
		const input = wrapper.find('input')
		await input.setValue('')
		await input.trigger('blur')
		expect(store.clearCustomFieldValue).toHaveBeenCalledWith({taskId: 1, fieldId: 3})
		expect(store.saveCustomFieldValue).not.toHaveBeenCalled()
	})

	it('save-vs-clear: non-empty routes to saveCustomFieldValue', async () => {
		const map: CustomFieldValuesMap = {'3': entry('', def({id: 3, type: 'text'}))}
		const {wrapper, store} = mountFields(1, map)
		const input = wrapper.find('input')
		await input.setValue('hello')
		await input.trigger('blur')
		expect(store.saveCustomFieldValue).toHaveBeenCalledWith({taskId: 1, fieldId: 3, value: 'hello'})
	})

	it('textarea commits on @save (AsyncEditor emits save, not blur)', async () => {
		// TipTap emits `save` on its Save button (bubbleSave), not on blur — blur
		// doesn't bubble from the contenteditable to the root <div>, so @blur never
		// fires in a real browser. The commit must wire @save, not @blur.
		const map: CustomFieldValuesMap = {'3': entry('hi', def({id: 3, type: 'textarea'}))}
		const {wrapper, store} = mountFields(1, map)
		await wrapper.find('.stub-save').trigger('click')
		expect(store.saveCustomFieldValue).toHaveBeenCalledWith({taskId: 1, fieldId: 3, value: 'hi'})
	})
})
