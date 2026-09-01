import {AuthenticatedHTTPFactory} from '@/helpers/fetcher'
import AbstractService from '@/services/abstractService'

import type {CustomFieldValuesMap} from '@/modelTypes/ICustomField'
import type {IAbstract} from '@/modelTypes/IAbstract'

export interface CustomFieldValueItem {
	custom_field_definition_id: number
	value: unknown
}

// {taskId} / {fieldId} are route params the inherited AbstractService.delete
// substitutes via getReplacedRoute (abstractService.ts:159-190).
interface CustomFieldDeleteModel extends IAbstract {
	taskId: number
	fieldId: number
}

export default class CustomFieldService extends AbstractService<CustomFieldDeleteModel> {
	constructor() {
		super({
			delete: '/plugins/custom-fields/tasks/{taskId}/custom-fields/{fieldId}',
		})
	}

	// Direct AuthenticatedHTTPFactory().get() — bypasses AbstractService.getM, which
	// mutates the response with result.maxPermission = Number(headers['x-max-permission'])
	// (NaN; the plugin sets no such header, main.go:1239). The map is returned untouched.
	async getValues(taskId: number): Promise<CustomFieldValuesMap> {
		const {data} = await AuthenticatedHTTPFactory().get(
			`/plugins/custom-fields/tasks/${taskId}/custom-fields`,
		)
		return data as CustomFieldValuesMap
	}

	// Direct AuthenticatedHTTPFactory().post() — NOT create (PUT) and NOT the inherited
	// update (which runs objectToSnakeCase on the body, mangling a bare array into an
	// object; case.ts:45). The bare array is sent unchanged; the plugin decodes []valueItem
	// (main.go:1381). Relative path — AuthenticatedHTTPFactory pins baseURL to /api/v1/
	// (fetcher.ts), so an absolute /api/v1/... would double-prefix; the relative path
	// combines with the v1 baseURL. Mirrors TaskService.bulkCreate (task.ts:180-220).
	async bulkUpsert(taskId: number, items: CustomFieldValueItem[]): Promise<CustomFieldValuesMap> {
		const {data} = await AuthenticatedHTTPFactory().post(
			`/plugins/custom-fields/tasks/${taskId}/custom-fields`,
			items,
		)
		return data as CustomFieldValuesMap
	}
}
