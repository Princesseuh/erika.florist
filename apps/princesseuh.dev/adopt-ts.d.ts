// Unfortunately, some packages don't have types available.

declare module "quicklink"

declare namespace astroHTML.JSX {
  interface HTMLAttributes {
    /**
     * The HTMLElement property inert is a boolean value that, when present, makes the browser "ignore" user input events for the element, including focus events
     * and events from assistive technologies. The browser may also ignore page search and text selection in the element. This can be useful when building UIs
     * such as modals where you would want to "trap" the focus inside the modal when it's visible.
     * @see https://github.com/WICG/inert
     */
    inert?: boolean | string | undefined | null
  }
}
