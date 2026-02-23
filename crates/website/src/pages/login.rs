use maud::{html, PreEscaped};
use maudit::route::prelude::*;

use crate::layouts::base_layout;

#[route("/login/")]
pub struct LoginPage;

impl Route for LoginPage {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        base_layout(
            Some("Login".into()),
            None,
            html! {
                div class="max-w-md mx-auto my-16" {
                    div class="p-8" {
                        div id="error" class="hidden bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" {}

                        form id="login-form" method="POST" class="space-y-4" {
                            div {
                                label class="block text-sm font-medium text-gray-700 mb-2" for="password" {
                                    "Password"
                                }
                                input class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-valencia"
                                    type="password" name="password" id="password" placeholder="Enter password" required;
                            }
                            button class="button-style-bg-accent w-full hover:cursor-pointer" type="submit" { "Login" }
                        }
                    }
                }

                script {
                    (PreEscaped(r#"
                    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                        ? "http://localhost:8787"
                        : "https://api.erika.florist";

                    document.getElementById('login-form').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const formData = new FormData();
                        formData.append('password', document.getElementById('password').value);

                        try {
                            const response = await fetch(API_URL + '/auth', {
                                method: 'POST',
                                body: formData,
                                credentials: 'include'
                            });

                            if (response.ok) {
                                window.location.href = '/catalogue/';
                            } else {
                                const errorDiv = document.getElementById('error');
                                errorDiv.textContent = 'Invalid password';
                                errorDiv.classList.remove('hidden');
                            }
                        } catch (err) {
                            const errorDiv = document.getElementById('error');
                            errorDiv.textContent = 'An error occurred. Please try again.';
                            errorDiv.classList.remove('hidden');
                        }
                    });
                    "#))
                }
            },
            true,
            None,
            ctx,
        )
    }
}
