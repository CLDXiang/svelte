import { DEV } from 'esm-env';
import { render_effect, user_effect } from '../../../reactivity/effects.js';
import { stringify } from '../../../render.js';

/**
 * @param {HTMLInputElement} input
 * @param {() => unknown} get_value
 * @param {(value: unknown) => void} update
 * @returns {void}
 */
export function bind_value(input, get_value, update) {
	input.addEventListener('input', () => {
		if (DEV && input.type === 'checkbox') {
			throw new Error(
				'Using bind:value together with a checkbox input is not allowed. Use bind:checked instead'
			);
		}

		update(is_numberlike_input(input) ? to_number(input.value) : input.value);
	});

	render_effect(() => {
		if (DEV && input.type === 'checkbox') {
			throw new Error(
				'Using bind:value together with a checkbox input is not allowed. Use bind:checked instead'
			);
		}

		var value = get_value();

		// @ts-ignore
		input.__value = value;

		if (is_numberlike_input(input) && value === to_number(input.value)) {
			// handles 0 vs 00 case (see https://github.com/sveltejs/svelte/issues/9959)
			return;
		}

		if (input.type === 'date' && !value && !input.value) {
			// Handles the case where a temporarily invalid date is set (while typing, for example with a leading 0 for the day)
			// and prevents this state from clearing the other parts of the date input (see https://github.com/sveltejs/svelte/issues/7897)
			return;
		}

		input.value = stringify(value);
	});
}

/**
 * @param {Array<HTMLInputElement>} inputs
 * @param {null | [number]} group_index
 * @param {HTMLInputElement} input
 * @param {() => unknown} get_value
 * @param {(value: unknown) => void} update
 * @returns {void}
 */
export function bind_group(inputs, group_index, input, get_value, update) {
	var is_checkbox = input.getAttribute('type') === 'checkbox';
	var binding_group = inputs;

	if (group_index !== null) {
		for (var index of group_index) {
			var group = binding_group;
			// @ts-ignore
			binding_group = group[index];
			if (binding_group === undefined) {
				// @ts-ignore
				binding_group = group[index] = [];
			}
		}
	}

	binding_group.push(input);

	input.addEventListener('change', () => {
		// @ts-ignore
		var value = input.__value;

		if (is_checkbox) {
			value = get_binding_group_value(binding_group, value, input.checked);
		}

		update(value);
	});

	render_effect(() => {
		var value = get_value();

		if (is_checkbox) {
			value = value || [];
			// @ts-ignore
			input.checked = value.includes(input.__value);
		} else {
			// @ts-ignore
			input.checked = input.__value === value;
		}
	});

	user_effect(() => {
		// necessary to maintain binding group order in all insertion scenarios. TODO optimise
		binding_group.sort((a, b) => (a.compareDocumentPosition(b) === 4 ? -1 : 1));
	});

	render_effect(() => {
		return () => {
			var index = binding_group.indexOf(input);

			if (index !== -1) {
				binding_group.splice(index, 1);
			}
		};
	});
}

/**
 * @param {HTMLInputElement} input
 * @param {() => unknown} get_value
 * @param {(value: unknown) => void} update
 * @returns {void}
 */
export function bind_checked(input, get_value, update) {
	input.addEventListener('change', () => {
		var value = input.checked;
		update(value);
	});

	// eslint-disable-next-line eqeqeq
	if (get_value() == undefined) {
		update(false);
	}

	render_effect(() => {
		var value = get_value();
		input.checked = Boolean(value);
	});
}

/**
 * @template V
 * @param {Array<HTMLInputElement>} group
 * @param {V} __value
 * @param {boolean} checked
 * @returns {V[]}
 */
function get_binding_group_value(group, __value, checked) {
	var value = new Set();

	for (var i = 0; i < group.length; i += 1) {
		if (group[i].checked) {
			// @ts-ignore
			value.add(group[i].__value);
		}
	}

	if (!checked) {
		value.delete(__value);
	}

	return Array.from(value);
}

/**
 * @param {HTMLInputElement} input
 */
function is_numberlike_input(input) {
	var type = input.type;
	return type === 'number' || type === 'range';
}

/**
 * @param {string} value
 */
function to_number(value) {
	return value === '' ? null : +value;
}
