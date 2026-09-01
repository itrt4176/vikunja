import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {setActivePinia, createPinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import DatepickerInline from './DatepickerInline.vue'
import en from '@/i18n/lang/en.json'

const i18n = createI18n({legacy: false, locale: 'en', messages: {en}})

// Stub flat-pickr so the test sees the config prop without instantiating flatpickr.
// Defined inside the factory because vi.mock is hoisted above the module body.
vi.mock('vue-flatpickr-component', () => ({
	default: defineComponent({
		name: 'flat-pickr',
		props: {config: null, modelValue: null},
		setup(props) {
			return () => h('div', {class: 'fp-stub'}, JSON.stringify(props.config))
		},
	}),
}))

function mountInline(props: {withTime?: boolean} = {}) {
	return mount(DatepickerInline, {
		props: {modelValue: null, ...props},
		global: {
			plugins: [i18n],
			stubs: {BaseButton: true},
		},
	})
}

describe('DatepickerInline withTime', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('enables time by default', () => {
		const wrapper = mountInline()
		const config = JSON.parse(wrapper.find('.fp-stub').text())
		expect(config.enableTime).toBe(true)
		expect(config.dateFormat).toBe('Y-m-d H:i')
	})

	it('disables time and uses date-only format when withTime is false', () => {
		const wrapper = mountInline({withTime: false})
		const config = JSON.parse(wrapper.find('.fp-stub').text())
		expect(config.enableTime).toBe(false)
		expect(config.dateFormat).toBe('Y-m-d')
	})
})
