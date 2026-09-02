import {setActivePinia, createPinia} from 'pinia'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {getValues, bulkUpsert, deleteValue} = vi.hoisted(() => ({
	getValues: vi.fn(),
	bulkUpsert: vi.fn(),
	deleteValue: vi.fn(),
}))

// Module-level mock (hoisted by vitest): the store news up CustomFieldService at
// setup, so the module must be replaced before the store is constructed — a
// vi.mock inside an it block cannot close over block-scoped spies.
vi.mock('@/services/customField', () => ({
	default: class {
		getValues = getValues
		bulkUpsert = bulkUpsert
		delete = deleteValue
	},
}))

vi.mock('@/router', () => ({
	default: {
		currentRoute: {value: {params: {}}},
		isReady: () => Promise.resolve(),
	},
}))

vi.mock('vue-i18n', () => ({
	useI18n: () => ({t: (key: string) => key}),
	createI18n: () => ({global: {t: (key: string) => key}}),
}))

vi.mock('@/stores/base', () => ({
	useBaseStore: () => ({setHasTasks: vi.fn()}),
}))

import {useTaskStore} from './tasks'
import type {CustomFieldValuesMap} from '@/modelTypes/ICustomField'

const MAP: CustomFieldValuesMap = {
	'3': {value: 7, field: {id: 3, name: 'Priority', type: 'integer', field_config: {}, display_order: 0, project_ids: [5]}},
}

describe('useTaskStore custom field value actions', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		getValues.mockReset()
		bulkUpsert.mockReset()
		deleteValue.mockReset()
	})

	it('loadCustomFields stashes the map by taskId', async () => {
		const store = useTaskStore()
		getValues.mockResolvedValue({...MAP})

		const out = await store.loadCustomFields(7)

		expect(getValues).toHaveBeenCalledWith(7)
		expect(out).toEqual(MAP)
		expect(store.customFieldValues[7]).toEqual(MAP)
	})

	it('saveCustomFieldValue upserts one field and replaces the whole map from the response', async () => {
		const store = useTaskStore()
		// Seed a second field so the keyset differs from the response: only a wholesale
		// replace drops '4' — a one-field patch would leave it in place.
		const seeded: CustomFieldValuesMap = {
			...MAP,
			'4': {value: null, field: {id: 4, name: 'Blocked', type: 'checkbox', field_config: {}, display_order: 1, project_ids: [5]}},
		}
		const replaced: CustomFieldValuesMap = {'3': {...MAP['3'], value: 9}}
		bulkUpsert.mockResolvedValue(replaced)
		store.customFieldValues[7] = seeded

		await store.saveCustomFieldValue({taskId: 7, fieldId: 3, value: 9})

		expect(bulkUpsert).toHaveBeenCalledWith(7, [{custom_field_definition_id: 3, value: 9}])
		expect(store.customFieldValues[7]).toEqual(replaced)
		expect('4' in store.customFieldValues[7]).toBe(false) // wholesale replace, not one-field patch
	})

	it('clearCustomFieldValue sets the entry value to null, keeping the row (the field is still assigned)', async () => {
		// A cleared field is still *assigned* to the project — the row must stay,
		// rendered with an empty input (value: null), not vanish from the section.
		// Deleting the map key made the v-for drop the row; the next save's
		// wholesale-replace then "reappeared" it (readValuesForTask emits null for
		// the deleted row). Set the value to null instead so the row is stable.
		const store = useTaskStore()
		deleteValue.mockResolvedValue({})
		store.customFieldValues[7] = {...MAP}

		await store.clearCustomFieldValue({taskId: 7, fieldId: 3})

		expect(deleteValue).toHaveBeenCalledWith({taskId: 7, fieldId: 3, maxPermission: null})
		expect('3' in store.customFieldValues[7]).toBe(true) // the row stays
		expect(store.customFieldValues[7]['3'].value).toBe(null) // empty, not gone
	})
})
