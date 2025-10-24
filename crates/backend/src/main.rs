use axum::{Router, response::Html, routing::get, extract::State};
use erikaflorist::content::{content_sources, BlogPost, RouteContent};
use std::sync::Arc;

#[tokio::main]
async fn main() {
    let mut content = content_sources("../website".to_owned());

    content.init_all();

    // Leak the content to make it 'static so RouteContent can reference it
    let content_static: &'static _ = Box::leak(Box::new(content));
    let route_content = RouteContent::new(content_static);

    let shared_content = Arc::new(route_content);

    // build our application with a route
    let app = Router::new()
        .route("/", get(handler))
        .with_state(shared_content);

    // run it
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();
    println!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}

async fn handler(State(content): State<Arc<RouteContent<'static>>>) -> Html<String> {
    let some_content = &content.get_source::<BlogPost>("blog").entries;

    Html(format!(
        "<h1>Blog Posts</h1><ul>{}</ul>",
        some_content
            .iter()
            .map(|post| format!("<li>{}</li>", post.id))
            .collect::<String>()
    ))
}
