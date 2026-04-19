import lunoCss from "@luno-kit/ui/styles.css?raw";

const STYLE_MARK = "data-luno-kit-ui-styles";

/** Injects LunoKit CSS without PostCSS — the bundle is Tailwind v4 output and conflicts with Tailwind v3 in this project. */
export function injectLunoUiStyles(): void {
	if (typeof document === "undefined") return;
	if (document.head.querySelector(`style[${STYLE_MARK}]`)) return;

	const el = document.createElement("style");
	el.setAttribute(STYLE_MARK, "");
	el.textContent = lunoCss;
	document.head.appendChild(el);
}
