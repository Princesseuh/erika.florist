use maud::{Markup, html};

pub fn mobile_menu(id_suffix: &str, content: Markup) -> Markup {
    let toggle_id = format!("mobile-menu-toggle-{}", id_suffix);
    let sidebar_id = format!("mobile-menu-sidebar-{}", id_suffix);
    let close_id = format!("mobile-menu-close-{}", id_suffix);

    html! {
        // Floating button for mobile
        button id=(toggle_id) ."sm:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-accent-valencia text-white-sugar-cane rounded-full p-0 flex items-center justify-center shadow-lg hover:bg-accent-valencia/90 focus:outline-none focus:ring-2 focus:ring-accent-valencia focus:ring-offset-2" aria-label="Toggle menu" {
            svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {
                path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4";
            }
        }

        // Mobile sidebar overlay
        div id=(sidebar_id) ."sm:hidden fixed inset-0 bg-black/50 z-50 opacity-0 pointer-events-none" {
            div."absolute right-0 top-0 h-full w-80 max-w-sm bg-white-sugar-cane overflow-y-auto transform translate-x-full transition-transform" {
                div."p-6 pt-12" {
                    button id=(close_id) ."absolute top-4 right-4 text-black-charcoal hover:text-accent-valencia" aria-label="Close menu" {
                        svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {
                            path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12";
                        }
                    }
                    (content)
                }
            }
        }

        (maud::PreEscaped(format!(r#"
            <script>
                (function() {{
                    const toggle = document.getElementById('{}');
                    const sidebar = document.getElementById('{}');
                    const close = document.getElementById('{}');
                    if (!toggle || !sidebar) return;

                    let open = false;

                    function toggleMenu() {{
                        open = !open;
                        sidebar.classList.toggle('opacity-0', !open);
                        sidebar.classList.toggle('opacity-100', open);
                        sidebar.classList.toggle('pointer-events-none', !open);
                        const content = sidebar.querySelector('div > div');
                        if (content) {{
                            content.classList.toggle('translate-x-full', !open);
                            content.classList.toggle('translate-x-0', open);
                        }}
                        document.body.style.overflow = open ? 'hidden' : '';
                    }}

                    toggle.addEventListener('click', toggleMenu);
                    close.addEventListener('click', toggleMenu);
                    sidebar.addEventListener('click', (e) => {{
                        if (e.target === sidebar) toggleMenu();
                    }});
                }})();
            </script>
        "#, toggle_id, sidebar_id, close_id)))
    }
}
