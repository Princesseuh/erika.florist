use std::sync::OnceLock;

// Bit of a wucky global state to hold the latest catalogue hash
static CATALOGUE_HASH: OnceLock<String> = OnceLock::new();

pub fn set_catalogue_hash(hash: String) -> Result<(), String> {
    CATALOGUE_HASH
        .set(hash)
        .map_err(|_| "Catalogue hash already set".to_string())
}

pub fn get_catalogue_hash() -> Option<&'static str> {
    CATALOGUE_HASH.get().map(|s| s.as_str())
}
