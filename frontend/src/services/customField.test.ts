import {describe, it, expect, vi, beforeEach} from 'vitest'

import CustomFieldService from './customField'
import type {CustomFieldValueItem} from './customField'
import type {CustomFieldValuesMap} from '@/modelTypes/ICustomField'

const get = vi.hoisted(() => vi.fn<(url: string) => Promise<{data: CustomFieldValuesMap}>>())
const post = vi.hoisted(() => vi.fn<(url: string, body: CustomFieldValueItem[]) => Promise<{data: CustomFieldValuesMap}>>())
const deleteFn = vi.hoisted(() => vi.fn())

vi.mock('@/helpers/fetcher', () => ({
	getApiBaseUrl: () => '/api/v1/',
	apiV2Url: (p: string) => `/api/v2/${p}`,
	HTTPFactory: () => ({get, post, delete: deleteFn, interceptors: {request: {use: vi.fn()}, response: {use: vi.fn()}}}),
	AuthenticatedHTTPFactory: () => ({get, post, delete: deleteFn, interceptors: {request: {use: vi.fn()}, response: {use: vi.fn()}}}),
}))

const MAP: CustomFieldValuesMap = {'3': {value: null, field: {id: 3, name: 'Priority', type: 'integer', field_config: {}, display_order: 0, project_ids: [5]}}}

describe('CustomFieldService', () => {
	beforeEach(() => {
		get.mockReset()
		post.mockReset()
		deleteFn.mockReset()
		get.mockResolvedValue({data: {...MAP}})
		post.mockResolvedValue({data: {...MAP}})
	})

	it('getValues hits the relative v1 path and returns the map untouched', async () => {
		const out = await new CustomFieldService().getValues(7)
		expect(get).toHaveBeenCalledTimes(1)
		expect(get.mock.calls[0][0]).toBe('/plugins/custom-fields/tasks/7/custom-fields')
		expect(out).toEqual(MAP)
		// no maxPermission mutation (the raw data is returned as-is)
		expect('maxPermission' in out).toBe(false)
	})

	it('bulkUpsert posts a bare array to the relative v1 path', async () => {
		const items: CustomFieldValueItem[] = [{custom_field_definition_id: 3, value: 7}]
		await new CustomFieldService().bulkUpsert(7, items)
		expect(post).toHaveBeenCalledTimes(1)
		expect(post.mock.calls[0][0]).toBe('/plugins/custom-fields/tasks/7/custom-fields')
		expect(post.mock.calls[0][1]).toBe(items) // the bare array, not objectToSnakeCase'd
		expect(Array.isArray(post.mock.calls[0][1])).toBe(true)
	})

	it('delete uses the inherited route-param substitution', async () => {
		const svc = new CustomFieldService()
		deleteFn.mockResolvedValue({data: {}})
		await svc.delete({taskId: 7, fieldId: 3} as never)
		expect(deleteFn).toHaveBeenCalledTimes(1)
		expect(deleteFn.mock.calls[0][0]).toBe('/plugins/custom-fields/tasks/7/custom-fields/3')
	})
})
