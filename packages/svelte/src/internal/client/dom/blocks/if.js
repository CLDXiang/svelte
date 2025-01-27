import { IS_ELSEIF } from '../../constants.js';
import {
	current_hydration_fragment,
	hydrate_block_anchor,
	hydrating,
	set_current_hydration_fragment
} from '../hydration.js';
import { remove } from '../reconciler.js';
import { current_block } from '../../runtime.js';
import {
	destroy_effect,
	pause_effect,
	render_effect,
	resume_effect
} from '../../reactivity/effects.js';

/** @returns {import('#client').IfBlock} */
function create_if_block() {
	return {
		// dom
		d: null,
		// effect
		e: null,
		// parent
		p: /** @type {import('#client').Block} */ (current_block),
		// value
		v: false
	};
}

/**
 * @param {Comment} anchor
 * @param {() => boolean} get_condition
 * @param {(anchor: Node) => void} consequent_fn
 * @param {null | ((anchor: Node) => void)} alternate_fn
 * @param {boolean} [elseif] True if this is an `{:else if ...}` block rather than an `{#if ...}`, as that affects which transitions are considered 'local'
 * @returns {void}
 */
export function if_block(anchor, get_condition, consequent_fn, alternate_fn, elseif = false) {
	const block = create_if_block();

	hydrate_block_anchor(anchor);

	/** @type {null | import('#client').TemplateNode | Array<import('#client').TemplateNode>} */
	let consequent_dom = null;

	/** @type {null | import('#client').TemplateNode | Array<import('#client').TemplateNode>} */
	let alternate_dom = null;

	/** @type {import('#client').Effect | null} */
	let consequent_effect = null;

	/** @type {import('#client').Effect | null} */
	let alternate_effect = null;

	/** @type {boolean | null} */
	let condition = null;

	const if_effect = render_effect(() => {
		if (condition === (condition = !!get_condition())) return;

		/** Whether or not there was a hydration mismatch. Needs to be a `let` or else it isn't treeshaken out */
		let mismatch = false;

		if (hydrating) {
			const comment_text = /** @type {Comment} */ (current_hydration_fragment?.[0])?.data;

			if (
				!comment_text ||
				(comment_text === 'ssr:if:true' && !condition) ||
				(comment_text === 'ssr:if:false' && condition)
			) {
				// Hydration mismatch: remove everything inside the anchor and start fresh.
				// This could happen using when `{#if browser} .. {/if}` in SvelteKit.
				remove(current_hydration_fragment);
				set_current_hydration_fragment(null);
				mismatch = true;
			} else {
				// Remove the ssr:if comment node or else it will confuse the subsequent hydration algorithm
				current_hydration_fragment.shift();
			}
		}

		if (condition) {
			if (consequent_effect) {
				resume_effect(consequent_effect);
			} else {
				consequent_effect = render_effect(
					() => {
						consequent_fn(anchor);
						consequent_dom = block.d;

						if (mismatch) {
							// Set fragment so that Svelte continues to operate in hydration mode
							set_current_hydration_fragment([]);
						}

						return () => {
							// TODO make this unnecessary by linking the dom to the effect,
							// and removing automatically on teardown
							if (consequent_dom !== null) {
								remove(consequent_dom);
								consequent_dom = null;
							}
						};
					},
					block,
					true
				);
			}

			if (alternate_effect) {
				pause_effect(alternate_effect, () => {
					alternate_effect = null;
					if (alternate_dom) remove(alternate_dom);
				});
			}
		} else {
			if (alternate_effect) {
				resume_effect(alternate_effect);
			} else if (alternate_fn) {
				alternate_effect = render_effect(
					() => {
						alternate_fn(anchor);
						alternate_dom = block.d;

						if (mismatch) {
							// Set fragment so that Svelte continues to operate in hydration mode
							set_current_hydration_fragment([]);
						}

						return () => {
							// TODO make this unnecessary by linking the dom to the effect,
							// and removing automatically on teardown
							if (alternate_dom !== null) {
								remove(alternate_dom);
								alternate_dom = null;
							}
						};
					},
					block,
					true
				);
			}

			if (consequent_effect) {
				pause_effect(consequent_effect, () => {
					consequent_effect = null;
					if (consequent_dom) remove(consequent_dom);
				});
			}
		}
	}, block);

	if (elseif) {
		if_effect.f |= IS_ELSEIF;
	}

	if_effect.ondestroy = () => {
		// TODO make this unnecessary by linking the dom to the effect,
		// and removing automatically on teardown
		if (consequent_dom !== null) {
			remove(consequent_dom);
		}

		if (alternate_dom !== null) {
			remove(alternate_dom);
		}

		if (consequent_effect) {
			destroy_effect(consequent_effect);
		}
		if (alternate_effect) {
			destroy_effect(alternate_effect);
		}
	};

	block.e = if_effect;
}
