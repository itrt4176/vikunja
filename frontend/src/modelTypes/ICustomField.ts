export type CustomFieldType =
	| 'text' | 'textarea' | 'integer' | 'decimal' | 'date' | 'datetime'
	| 'select' | 'multiselect' | 'checkbox' | 'url'

export interface ICustomFieldOption {
	id: number
	value: string
	label: string
	display_order: number
}

export interface ICustomFieldConfig {
	required?: boolean
	default?: string
	is_api_only?: boolean
	min?: number
	max?: number
}

export interface ICustomFieldDefinition {
	id: number
	name: string
	type: CustomFieldType
	description?: string
	field_config: ICustomFieldConfig
	display_order: number
	options?: ICustomFieldOption[]
	project_ids: number[]
}

export interface ICustomFieldValue {
	value: unknown
	field: ICustomFieldDefinition
}

export type CustomFieldValuesMap = Record<string, ICustomFieldValue>
