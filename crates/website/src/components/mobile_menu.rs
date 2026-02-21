use maud::{Markup, PreEscaped, html};

use crate::components::icon::{Icon, icon};

pub fn mobile_menu_button(id: &str, extra_classes: &str, button_icon: Icon) -> Markup {
    let classes = format!(
        "w-14 h-14 bg-accent-valencia text-white-sugar-cane rounded-full p-0 flex items-center justify-center shadow-lg hover:bg-accent-valencia/90 focus:outline-none focus:ring-2 focus:ring-accent-valencia focus:ring-offset-2 {}",
        extra_classes
    );
    html! {
        button id=(id) class=(classes) aria-label="Toggle menu" {
            (icon(button_icon, 24, ""))
        }
    }
}

pub fn mobile_menu(id_suffix: &str, content: Markup, button_icon: Icon) -> Markup {
    let toggle_id = format!("mobile-menu-toggle-{}", id_suffix);
    let sidebar_id = format!("mobile-menu-sidebar-{}", id_suffix);
    let close_id = format!("mobile-menu-close-{}", id_suffix);

    html! {
        (mobile_menu_button(&toggle_id, "sm:hidden fixed bottom-6 right-6 z-40", button_icon))

        // Mobile sidebar overlay
        div id=(sidebar_id) ."sm:hidden fixed inset-0 bg-black/50 z-50 opacity-0 pointer-events-none" {
            div."absolute right-0 top-0 h-full w-80 max-w-sm bg-white-sugar-cane overflow-y-auto transform translate-x-full transition-transform" {
                div."p-6 pt-12" {
                    button id=(close_id) ."absolute top-4 right-4 text-black-charcoal hover:text-accent-valencia" aria-label="Close menu" {
                            (icon(Icon::Close, 24, "Close"))
                        }
                    (content)
                }
            }
        }

        (PreEscaped(format!(r#"
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
