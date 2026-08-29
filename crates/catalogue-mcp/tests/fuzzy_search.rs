use erika_catalogue_mcp::fuzzy::search;

const ITEMS: &[(&str, &str)] = &[
    ("Hotline Miami", "Dennaton Games"),
    ("Hotline Miami 2: Wrong Number", "Dennaton Games"),
    ("Miami Vice", ""),
    ("Heat", "Michael Mann"),
    ("Amélie", "Jean-Pierre Jeunet"),
    ("Mama", ""),
    ("Papers, Please", "Lucas Pope"),
    ("Return of the Obra Dinn", "Lucas Pope"),
];

fn items() -> Vec<Vec<String>> {
    ITEMS
        .iter()
        .map(|(title, author)| vec![title.to_string(), author.to_string()])
        .collect()
}

#[test]
fn title_match_ranks_best_first() {
    let got = search(&items(), 0, "hotline");
    assert_eq!(got, [0, 1]);
}

#[test]
fn word_order_does_not_matter() {
    let got = search(&items(), 0, "miami hotline");
    assert_eq!(&got[..2], [0, 1]);
}

#[test]
fn ascii_query_matches_diacritics() {
    let got = search(&items(), 0, "amelie");
    assert_eq!(got.first(), Some(&4));
}

#[test]
fn author_key_is_searched() {
    let got = search(&items(), 0, "dennaton");
    assert_eq!(got, [0, 1]);
}

#[test]
fn author_ties_break_on_title() {
    let got = search(&items(), 0, "lucas pope");
    assert_eq!(got, [6, 7]);
}

#[test]
fn garbage_matches_nothing() {
    let got = search(&items(), 0, "zzzzzz");
    assert!(got.is_empty());
}

#[test]
fn empty_query_returns_all_by_sort_key() {
    let got = search(&items(), 0, "");
    assert_eq!(got, [4, 3, 0, 1, 5, 2, 6, 7]);
}
