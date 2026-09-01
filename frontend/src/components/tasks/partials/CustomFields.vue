<template>
	<CustomTransition
		v-for="entry in sortedEntries"
		:key="entry.field.id"
		name="flash-background"
		appear
	>
		<div class="column custom-field">
			<div class="detail-title">
				{{ entry.field.name }}
			</div>
			<!-- text / url -->
			<FormInput
				v-if="entry.field.type === 'text' || entry.field.type === 'url'"
				:model-value="formModelValue(entry)"
				:type="entry.field.type === 'url' ? 'url' : 'text'"
				:disabled="!canWrite || entry.field.field_config.is_api_only"
				@update:modelValue="(v) => (localValues[String(entry.field.id)] = v)"
				@blur="commit(entry.field, localValues[String(entry.field.id)])"
			/>
			<!-- integer / decimal -->
			<FormInput
				v-else-if="entry.field.type === 'integer' || entry.field.type === 'decimal'"
				:model-value="formModelValue(entry)"
				:model-modifiers="{ number: true }"
				type="number"
				:step="entry.field.type === 'decimal' ? 'any' : '1'"
				:min="entry.field.field_config.min"
				:max="entry.field.field_config.max"
				:disabled="!canWrite || entry.field.field_config.is_api_only"
				@update:modelValue="(v) => (localValues[String(entry.field.id)] = v)"
				@blur="commit(entry.field, localValues[String(entry.field.id)])"
			/>
			<!-- textarea (TipTap; stores HTML) — commit on @save (the Save button),
			not @blur: TipTap doesn't emit blur and blur doesn't bubble from the
			contenteditable to its root <div>, so @blur never fires in a real browser.
			@save fires on the Save button click (bubbleSave), the "done editing"
			signal analogous to FormInput's @blur. :show-save renders the Save button
			(TipTap's showSave defaults to false; without it the button — and the only
			reachable commit trigger — never renders). Mirrors Description.vue. -->
			<AsyncEditor
				v-else-if="entry.field.type === 'textarea'"
				:model-value="textareaModelValue(entry)"
				:is-edit-enabled="canWrite && !entry.field.field_config.is_api_only"
				:show-save="true"
				@update:modelValue="(v) => (localValues[String(entry.field.id)] = v)"
				@save="commit(entry.field, localValues[String(entry.field.id)])"
			/>
			<!-- date / datetime -->
			<Datepicker
				v-else-if="entry.field.type === 'date' || entry.field.type === 'datetime'"
				:model-value="dateModelValue(entry)"
				:with-time="entry.field.type === 'datetime'"
				:disabled="!canWrite || entry.field.field_config.is_api_only"
				@update:modelValue="(v) => (localValues[String(entry.field.id)] = v)"
				@closeOnChange="commitDate(entry.field, localValues[String(entry.field.id)])"
			/>
			<!-- single-select -->
			<Multiselect
				v-else-if="entry.field.type === 'select'"
				:model-value="selectModelValue(entry)"
				:multiple="false"
				:creatable="false"
				:search-results="optionSearchResults(entry.field.options)"
				label="label"
				:disabled="!canWrite || entry.field.field_config.is_api_only"
				@update:modelValue="(v) => commitSelect(entry.field, v)"
			/>
			<!-- multi-select -->
			<Multiselect
				v-else-if="entry.field.type === 'multiselect'"
				:model-value="multiselectModelValue(entry)"
				:multiple="true"
				:creatable="false"
				:search-results="optionSearchResults(entry.field.options)"
				label="label"
				:disabled="!canWrite || entry.field.field_config.is_api_only"
				@update:modelValue="(v) => commitMultiselect(entry.field, v)"
			/>
			<!-- checkbox -->
			<FancyCheckbox
				v-else-if="entry.field.type === 'checkbox'"
				:model-value="!!localValues[String(entry.field.id)]"
				:disabled="!canWrite || entry.field.field_config.is_api_only"
				@update:modelValue="(v) => commitCheckbox(entry.field, v)"
			/>
		</div>
	</CustomTransition>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import FormInput from '@/components/input/FormInput.vue'
import Datepicker from '@/components/input/Datepicker.vue'
import Multiselect from '@/components/input/Multiselect.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
// AsyncEditor is already a lazy async component (createAsyncComponent); a normal
// import keeps the TipTap chunk deferred, matching the Description field.
import AsyncEditor from '@/components/input/AsyncEditor'
import CustomTransition from '@/components/misc/CustomTransition.vue'

import {useTaskStore} from '@/stores/tasks'
import type {
	ICustomFieldValue,
	ICustomFieldDefinition,
	ICustomFieldOption,
} from '@/modelTypes/ICustomField'

const props = defineProps<{
	taskId: number
	canWrite: boolean
}>()

const taskStore = useTaskStore()

const entries = computed<ICustomFieldValue[]>(() => {
	const map = taskStore.customFieldValues[props.taskId]
	return map ? Object.values(map) : []
})

const sortedEntries = computed(() =>
	[...entries.value].sort(
		(a, b) => (a.field.display_order ?? 0) - (b.field.display_order ?? 0),
	),
)

// Local refs for the blur-commit types: FormInput emits update:modelValue per
// keystroke, so the in-progress value is held locally and committed on @blur.
// For select/multiselect, localValues holds the option objects the Multiselect
// binds (it emits the whole object(s)), and the commit extracts .value strings.
const localValues = ref<Record<string, unknown>>({})

// `localValues` is heterogeneous (string/number/Date/option/option[]); the
// `:model-value` props each expect a different type, so per-type accessors cast
// from `unknown` to the prop's type. The casts live in the script (a template
// `as ... | ...` triggers vue/no-deprecated-filter, which misreads `|` as a
// filter pipe).
function formModelValue(e: ICustomFieldValue): string | number | Date | null {
	return localValues.value[String(e.field.id)] as string | number | Date | null
}
function textareaModelValue(e: ICustomFieldValue): string {
	return localValues.value[String(e.field.id)] as string
}
function dateModelValue(e: ICustomFieldValue): Date | string | null {
	return localValues.value[String(e.field.id)] as Date | string | null
}
function selectModelValue(e: ICustomFieldValue): Record<string, unknown> | null {
	return localValues.value[String(e.field.id)] as Record<string, unknown> | null
}
function multiselectModelValue(e: ICustomFieldValue): Record<string, unknown>[] {
	return localValues.value[String(e.field.id)] as Record<string, unknown>[]
}

// Multiselect's generic is `T extends Record<string, unknown>`; ICustomFieldOption
// is an interface (no implicit index signature), so cast the options to satisfy
// the constraint without altering the Task 3 type.
function optionSearchResults(options?: ICustomFieldOption[]): Record<string, unknown>[] {
	return (options ?? []) as unknown as Record<string, unknown>[]
}

watch(
	entries,
	() => {
		for (const e of entries.value) {
			const key = String(e.field.id)
			if (!(key in localValues.value)) {
				localValues.value[key] = resolveInitialValue(e)
			}
		}
	},
	{immediate: true, deep: true},
)

function resolveInitialValue(e: ICustomFieldValue): unknown {
	if (e.field.type === 'select') {
		const v = e.value as string | null
		return (e.field.options ?? []).find(o => o.value === v) ?? null
	}
	if (e.field.type === 'multiselect') {
		const vals = Array.isArray(e.value) ? (e.value as string[]) : []
		return (e.field.options ?? []).filter(o => vals.includes(o.value))
	}
	return e.value
}

function isEmpty(v: unknown): boolean {
	return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

// Save-vs-clear routing: empty -> clear (DELETE); non-empty -> save (upsert).
function commit(field: ICustomFieldDefinition, value: unknown) {
	if (isEmpty(value)) {
		taskStore.clearCustomFieldValue({taskId: props.taskId, fieldId: field.id})
	} else {
		taskStore.saveCustomFieldValue({taskId: props.taskId, fieldId: field.id, value})
	}
}

// checkbox false is a real value, not empty — always save.
function commitCheckbox(field: ICustomFieldDefinition, value: boolean) {
	taskStore.saveCustomFieldValue({taskId: props.taskId, fieldId: field.id, value})
}

function toDateOnly(d: Date): string {
	const m = (d.getMonth() + 1).toString().padStart(2, '0')
	const day = d.getDate().toString().padStart(2, '0')
	return `${d.getFullYear()}-${m}-${day}`
}

// Datepicker emits closeOnChange with a boolean (not the date); read the bound
// model instead. null/empty -> clear; date -> format to wire format.
function commitDate(field: ICustomFieldDefinition, value: unknown) {
	if (value === null || value === undefined || value === '') {
		taskStore.clearCustomFieldValue({taskId: props.taskId, fieldId: field.id})
		return
	}
	const date = value instanceof Date ? value : new Date(value as string)
	const formatted = field.type === 'datetime' ? date.toISOString() : toDateOnly(date)
	taskStore.saveCustomFieldValue({taskId: props.taskId, fieldId: field.id, value: formatted})
}

function commitSelect(field: ICustomFieldDefinition, value: unknown) {
	if (value === null || value === undefined) {
		taskStore.clearCustomFieldValue({taskId: props.taskId, fieldId: field.id})
		return
	}
	const option = value as ICustomFieldOption
	taskStore.saveCustomFieldValue({taskId: props.taskId, fieldId: field.id, value: option.value})
}

function commitMultiselect(field: ICustomFieldDefinition, value: unknown) {
	// Derive the value array from the bound model (the option objects); the last
	// option removed -> empty array -> clear.
	const arr = Array.isArray(value) ? (value as ICustomFieldOption[]) : []
	const values = arr.map(o => o.value)
	if (values.length === 0) {
		taskStore.clearCustomFieldValue({taskId: props.taskId, fieldId: field.id})
	} else {
		taskStore.saveCustomFieldValue({taskId: props.taskId, fieldId: field.id, value: values})
	}
}
</script>
