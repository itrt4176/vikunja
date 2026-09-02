import {describe, it, expect, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {setActivePinia, createPinia} from 'pinia'
import {defineComponent} from 'vue'

const {errorMessage} = vi.hoisted(() => ({errorMessage: vi.fn()}))

vi.mock('@/router', () => ({default: {currentRoute: {value: {params: {}}}, isReady: () => Promise.resolve()}}))
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (k: string) => k}), createI18n: () => ({global: {t: (k: string) => k}})}))
vi.mock('@/stores/base', () => ({useBaseStore: () => ({setHasTasks: vi.fn()})}))
vi.mock('@/message', () => ({error: errorMessage}))
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
		expect(wrapper.findAll('.custom-field')).toHaveLength(0)
		expect(wrapper.findAll('.detail-title')).toHaveLength(0)
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

	it('select Multiselect passes :show-empty so the dropdown opens on focus (not a text box)', () => {
		// Without :show-empty, Multiselect.searchResultsVisible is false while the
		// query is empty, so clicking the select focuses the search input but never
		// opens the dropdown — it looks like a plain text box until you type.
		const map: CustomFieldValuesMap = {
			'3': entry(null, def({id: 3, type: 'select', options: [{id: 1, value: 'a', label: 'A', display_order: 0}]})),
		}
		const {wrapper} = mountFields(1, map)
		const ms = wrapper.findComponent({name: 'Multiselect'})
		expect(ms.props('showEmpty')).toBe(true)
	})

	it('multiselect Multiselect passes :show-empty', () => {
		const map: CustomFieldValuesMap = {
			'3': entry(null, def({id: 3, type: 'multiselect', options: [{id: 1, value: 'a', label: 'A', display_order: 0}]})),
		}
		const {wrapper} = mountFields(1, map)
		expect(wrapper.findComponent({name: 'Multiselect'}).props('showEmpty')).toBe(true)
	})

	it('blur an unchanged empty field fires no commit (no spurious clear that erases the row)', async () => {
		// An assigned-but-unset field has value: null. Focusing it and blurring
		// without typing must NOT fire clearCustomFieldValue — the value didn't
		// change. The old code routed on isEmpty(new) alone, so blurring an
		// already-empty field fired a DELETE that erased the row.
		const map: CustomFieldValuesMap = {'3': entry(null, def({id: 3, type: 'text'}))}
		const {wrapper, store} = mountFields(1, map)
		const input = wrapper.find('input')
		await input.trigger('focus')
		await input.trigger('blur')
		expect(store.clearCustomFieldValue).not.toHaveBeenCalled()
		expect(store.saveCustomFieldValue).not.toHaveBeenCalled()
	})

	it('blur an unchanged non-empty field fires no commit (no spurious save)', async () => {
		const map: CustomFieldValuesMap = {'3': entry('same', def({id: 3, type: 'text'}))}
		const {wrapper, store} = mountFields(1, map)
		const input = wrapper.find('input')
		await input.trigger('focus')
		await input.trigger('blur')
		expect(store.saveCustomFieldValue).not.toHaveBeenCalled()
		expect(store.clearCustomFieldValue).not.toHaveBeenCalled()
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
		// fires in a real browser. The commit must wire @save, not @blur. The value
		// must actually change (the no-op guard skips a commit that matches the
		// stored value), so emit an update:modelValue before Save.
		const map: CustomFieldValuesMap = {'3': entry('hi', def({id: 3, type: 'textarea'}))}
		const {wrapper, store} = mountFields(1, map)
		const editor = wrapper.findComponent({name: 'AsyncEditor'})
		await editor.vm.$emit('update:modelValue', 'changed')
		await wrapper.find('.stub-save').trigger('click')
		expect(store.saveCustomFieldValue).toHaveBeenCalledWith({taskId: 1, fieldId: 3, value: 'changed'})
	})

	it('shows a toast and reverts the input to the stored value when save fails', async () => {
		// A rejected upsert (e.g. a 400) must not leave the rejected value in the
		// input: the store only updates on success, so the component reverts
		// localValues to the stored value and shows the error toast.
		const map: CustomFieldValuesMap = {'3': entry('stored', def({id: 3, type: 'text'}))}
		const {wrapper, store} = mountFields(1, map)
		store.saveCustomFieldValue = vi.fn().mockRejectedValue(new Error('400'))
		const input = wrapper.find('input')
		await input.setValue('rejected')
		await input.trigger('blur')
		await flushPromises()
		expect(errorMessage).toHaveBeenCalledWith({message: 'task.detail.customFields.saveError'})
		expect((wrapper.find('input').element as HTMLInputElement).value).toBe('stored')
	})

	it('shows a toast and reverts a select to the stored option when save fails', async () => {
		// The select binds option objects, the store holds option value strings —
		// the revert must re-resolve the stored string back to its option object.
		const map: CustomFieldValuesMap = {
			'3': entry('a', def({
				id: 3,
				type: 'select',
				options: [
					{id: 1, value: 'a', label: 'A', display_order: 0},
					{id: 2, value: 'b', label: 'B', display_order: 1},
				],
			})),
		}
		const {wrapper, store} = mountFields(1, map)
		store.saveCustomFieldValue = vi.fn().mockRejectedValue(new Error('400'))
		const ms = wrapper.findComponent({name: 'Multiselect'})
		await ms.vm.$emit('update:modelValue', {id: 2, value: 'b', label: 'B', display_order: 1})
		await flushPromises()
		expect(errorMessage).toHaveBeenCalledWith({message: 'task.detail.customFields.saveError'})
		const reverted = wrapper.findComponent({name: 'Multiselect'}).props('modelValue') as Record<string, unknown>
		expect(reverted).toEqual({id: 1, value: 'a', label: 'A', display_order: 0})
	})
})
