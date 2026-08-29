use std::cmp::Ordering;

use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};

pub fn fold_for_search(s: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    use unicode_normalization::char::is_combining_mark;
    s.nfd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .collect()
}

/// Ranks items (lists of key strings; empty = skipped) by best key score, ties on the folded `sort_key` string; an empty query matches everything, ordered by the sort key.
pub fn search(items: &[Vec<String>], sort_key: usize, query: &str) -> Vec<usize> {
    let fold_sort_key = |keys: &Vec<String>| {
        keys.get(sort_key)
            .filter(|s| !s.is_empty())
            .map(|s| fold_for_search(s))
    };

    if query.trim().is_empty() {
        let mut all: Vec<(usize, Option<String>)> = items
            .iter()
            .enumerate()
            .map(|(index, keys)| (index, fold_sort_key(keys)))
            .collect();
        all.sort_by(|a, b| cmp_sort_strings(&a.1, &b.1));
        return all.into_iter().map(|(index, _)| index).collect();
    }

    let mut matcher = Matcher::new(Config::DEFAULT);
    let pattern = Pattern::parse(query, CaseMatching::Ignore, Normalization::Smart);
    let mut buf = Vec::new();

    let mut results: Vec<(usize, u32, Option<String>)> = Vec::new();
    for (index, keys) in items.iter().enumerate() {
        let mut best: Option<u32> = None;
        for s in keys {
            if s.is_empty() {
                continue;
            }
            if let Some(score) = pattern.score(Utf32Str::new(s, &mut buf), &mut matcher) {
                best = Some(best.map_or(score, |b| b.max(score)));
            }
        }
        if let Some(score) = best {
            results.push((index, score, fold_sort_key(keys)));
        }
    }

    results.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| cmp_sort_strings(&a.2, &b.2)));
    results.into_iter().map(|(index, _, _)| index).collect()
}

fn cmp_sort_strings(a: &Option<String>, b: &Option<String>) -> Ordering {
    match (a, b) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => Ordering::Greater,
        (Some(_), None) => Ordering::Less,
        (Some(x), Some(y)) => x.cmp(y),
    }
}
