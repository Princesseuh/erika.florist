use lambda_http::RequestExt;
use lambda_http::{run, service_fn, tracing, Body, Error, Request, Response};
use routes::add::add_handler;
use routes::catalogue::catalogue_handler;

mod routes;

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing::init_default_subscriber();
    run(service_fn(function_handler)).await
}

pub(crate) async fn function_handler(event: Request) -> Result<Response<Body>, Error> {
    let path = event.raw_http_path();

    match path {
        "/catalogue" => catalogue_handler(event).await,
        "/add" => add_handler(event).await,
        _ => Ok(Response::builder()
            .status(404)
            .body("Not Found".into())
            .expect("Failed to render response")),
    }
}
