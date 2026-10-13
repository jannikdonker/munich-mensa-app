//! Menus straight from the Studierendenwerk München Oberbayern website, for locations
//! the eat-api lacks or has stale IDs for. Pages are parsed into eat-api's JSON shape;
//! labels and prices follow eat-api's `StudentenwerkMenuParser`.
//!
//! The parser tolerates markup changes: it walks the page in document order (a date
//! heading starts a day, dish items after it belong to that day) and has fallbacks for
//! where dates, codes and diets are found. When a page has dishes it cannot place or
//! name, parsing fails instead of returning an empty menu, so the cache keeps serving
//! the last good copy.

use std::collections::BTreeSet;

use scraper::{ElementRef, Html, Selector};
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::{
    cache::{Fetched, cached},
    http::HttpClient,
};

const PAGE_URLS: [&str; 2] = [
    "https://www.studierendenwerk-muenchen-oberbayern.de/gastronomie/speiseplan/speiseplan_{id}_-de.html",
    // Former location; redirects to the one above as of 2026-10.
    "https://www.studierendenwerk-muenchen-oberbayern.de/mensa/speiseplan/speiseplan_{id}_-de.html",
];

#[derive(Debug, Serialize, PartialEq)]
pub struct Day {
    date: String,
    dishes: Vec<Dish>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Dish {
    name: String,
    dish_type: String,
    labels: Vec<&'static str>,
    prices: Prices,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Prices {
    students: Price,
    staff: Price,
    guests: Price,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Price {
    base_price: f64,
    price_per_unit: f64,
    unit: Option<&'static str>,
}

/// Additive/allergen/meat codes used on the pages, mapped to eat-api label names.
fn labels_for_code(code: &str) -> &'static [&'static str] {
    match code {
        "GQB" => &["BAVARIA"],
        "MSC" => &["MSC"],
        "1" | "6" => &["DYESTUFF"],
        "2" => &["PRESERVATIVES"],
        "3" => &["ANTIOXIDANTS"],
        "4" => &["FLAVOR_ENHANCER"],
        "5" => &["SULPHURS"],
        "7" => &["WAXED"],
        "8" => &["PHOSPHATES"],
        "9" | "11" => &["SWEETENERS"],
        "10" => &["PHENYLALANINE"],
        "13" => &["COCOA_CONTAINING_GREASE"],
        "14" => &["GELATIN"],
        "99" => &["ALCOHOL"],
        "S" => &["PORK"],
        "R" => &["BEEF"],
        "K" => &["VEAL"],
        "Kn" => &["GARLIC"],
        "Ei" => &["CHICKEN_EGGS"],
        "En" => &["PEANUTS"],
        "Fi" => &["FISH"],
        "Gl" => &["GLUTEN"],
        "GlW" => &["WHEAT"],
        "GlR" => &["RYE"],
        "GlG" => &["BARLEY"],
        "GlH" => &["OAT"],
        "GlD" => &["SPELT"],
        "Kr" | "Sc" => &["SHELLFISH"],
        "Lu" => &["LUPIN"],
        "Mi" => &["MILK", "LACTOSE"],
        "ScM" => &["ALMONDS"],
        "ScH" => &["HAZELNUTS"],
        "ScW" => &["WALNUTS"],
        "ScC" => &["CASHEWS"],
        "ScP" => &["PISTACHIOS"],
        "Se" => &["SESAME"],
        "Sf" => &["MUSTARD"],
        "Sl" => &["CELERY"],
        "So" => &["SOY"],
        "Sw" => &["SULPHURS", "SULFITES"],
        "Wt" => &["MOLLUSCS"],
        _ => &[],
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Diet {
    WithMeat,
    Vegetarian,
    Vegan,
}

fn labels(codes: &[String], diet: Option<Diet>) -> Vec<&'static str> {
    let mut labels: BTreeSet<&'static str> = codes
        .iter()
        .flat_map(|c| labels_for_code(c))
        .copied()
        .collect();
    match diet {
        Some(Diet::WithMeat) if !labels.contains("FISH") => {
            labels.insert("MEAT");
        }
        Some(Diet::Vegetarian) => {
            labels.insert("VEGETARIAN");
        }
        Some(Diet::Vegan) => {
            labels.extend(["VEGAN", "VEGETARIAN"]);
        }
        _ => {}
    }
    let has_any = |labels: &BTreeSet<&str>, set: &[&str]| set.iter().any(|l| labels.contains(l));
    if has_any(
        &labels,
        &[
            "ALMONDS",
            "HAZELNUTS",
            "MACADAMIA",
            "CASHEWS",
            "PECAN",
            "PISTACHIOS",
            "SESAME",
            "WALNUTS",
        ],
    ) {
        labels.insert("SHELL_FRUITS");
    }
    if has_any(&labels, &["BARLEY", "OAT", "RYE", "SPELT", "WHEAT"]) {
        labels.insert("CEREAL");
    }
    if has_any(&labels, &["PORK", "BEEF", "VEAL"]) {
        labels.insert("MEAT");
    }
    labels.into_iter().collect()
}

/// Self-service prices per 100 g (students, staff, guests) plus a base price by kind,
/// from https://www.studierendenwerk-muenchen-oberbayern.de/gastronomie/preise-und-bezahlung/
fn prices(dish_type: &str, name: &str, codes: &[String], diet: Option<Diet>) -> Prices {
    const CLASSIC: [f64; 3] = [0.90, 1.15, 1.60];
    const SOUP_STEW: [f64; 3] = [0.33, 1.15, 1.60];

    let has_code = |code: &str| codes.iter().any(|c| c == code);
    let kind = dish_type.to_lowercase();
    // Without a diet marker, meat or fish codes still tell.
    let with_meat = match diet {
        Some(diet) => diet == Diet::WithMeat,
        None => ["S", "R", "K", "Fi"].iter().any(|c| has_code(c)),
    };
    let (base, per_unit) = if kind.starts_with("pizza") {
        let base = if with_meat {
            [5.0, 5.5, 6.5]
        } else {
            [4.5, 5.0, 6.0]
        };
        (base, [0.0; 3])
    } else if kind == "studitopf" || kind == "beilagen" || !with_meat {
        (
            [0.0; 3],
            if kind == "studitopf" {
                SOUP_STEW
            } else {
                CLASSIC
            },
        )
    } else if has_code("Fi") {
        ([1.5; 3], CLASSIC)
    } else if name.to_lowercase().contains("wurst") || name.to_lowercase().contains("würstchen") {
        ([0.5; 3], CLASSIC)
    } else {
        ([1.0; 3], CLASSIC)
    };
    let price = |i: usize| Price {
        base_price: base[i],
        price_per_unit: per_unit[i],
        unit: Some("100g"),
    };
    Prices {
        students: price(0),
        staff: price(1),
        guests: price(2),
    }
}

fn selector(css: &str) -> Selector {
    Selector::parse(css).expect("static selector is valid")
}

fn text(element: ElementRef) -> String {
    element
        .text()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn has_class(element: ElementRef, predicate: impl Fn(&str) -> bool) -> bool {
    element.value().classes().any(predicate)
}

fn is_iso_date(s: &str) -> bool {
    s.len() == 10
        && s.char_indices().all(|(i, c)| {
            if i == 4 || i == 7 {
                c == '-'
            } else {
                c.is_ascii_digit()
            }
        })
}

/// First "13.10.2026"-style date in `text`, as "2026-10-13".
fn german_date(text: &str) -> Option<String> {
    text.split(|c: char| !(c.is_ascii_digit() || c == '.'))
        .find_map(|token| {
            let mut parts = token.trim_matches('.').split('.');
            let (d, m, y) = (parts.next()?, parts.next()?, parts.next()?);
            let (d, m, y): (u32, u32, u32) = (d.parse().ok()?, m.parse().ok()?, y.parse().ok()?);
            let valid = parts.next().is_none()
                && (1..=31).contains(&d)
                && (1..=12).contains(&m)
                && (2000..3000).contains(&y);
            valid.then(|| format!("{y:04}-{m:02}-{d:02}"))
        })
}

/// The date a day heading stands for: from its "heute_2026-10-13" class, or from heading
/// text like "Dienstag, 13.10.2026".
fn heading_date(element: ElementRef) -> Option<String> {
    let from_class = element
        .value()
        .classes()
        .find_map(|c| c.strip_prefix("heute_"))
        .filter(|d| is_iso_date(d));
    if let Some(date) = from_class {
        return Some(date.to_owned());
    }
    if has_class(element, |c| c.contains("schedule__header")) {
        return german_date(&text(element));
    }
    None
}

/// A dish entry: by class, or by carrying the diet attribute that only dish items have.
fn is_dish_item(element: ElementRef) -> bool {
    has_class(element, |c| c == "c-menu-dish-list__item")
        || element.value().attr("data-essen-fleischlos").is_some()
}

/// Codes from the item's data attributes, or from its marker elements if they moved there.
fn dish_codes(item: ElementRef) -> Vec<String> {
    const ATTRIBUTES: [&str; 3] = [
        "data-essen-typ",
        "data-essen-zusatz",
        "data-essen-allergene",
    ];
    let mut codes = BTreeSet::new();
    for element in std::iter::once(item).chain(item.descendants().filter_map(ElementRef::wrap)) {
        for attribute in ATTRIBUTES {
            if let Some(list) = element.value().attr(attribute) {
                codes.extend(
                    list.split(',')
                        .map(str::trim)
                        .filter(|c| !c.is_empty())
                        .map(str::to_owned),
                );
            }
        }
    }
    codes.into_iter().collect()
}

/// From `data-essen-fleischlos` (0 meat, 1 vegetarian, 2 vegan), else from the diet icon
/// ("veganes Gericht") or the "(v)"/"(f)" markers.
fn dish_diet(item: ElementRef) -> Option<Diet> {
    match item.value().attr("data-essen-fleischlos").map(str::trim) {
        Some("0") => return Some(Diet::WithMeat),
        Some("1") => return Some(Diet::Vegetarian),
        Some("2") => return Some(Diet::Vegan),
        _ => {}
    }
    let (mut vegan, mut vegetarian) = (false, false);
    for element in item.descendants().filter_map(ElementRef::wrap) {
        let title = element
            .value()
            .attr("title")
            .unwrap_or_default()
            .to_lowercase();
        let marker = text(element).to_lowercase();
        vegan |= has_class(element, |c| c.eq_ignore_ascii_case("vegan"))
            || title.contains("vegan")
            || marker == "(v)";
        vegetarian |= has_class(element, |c| {
            c.eq_ignore_ascii_case("vegetarisch") || c.eq_ignore_ascii_case("fleischlos")
        }) || title.contains("vegetarisch")
            || title.contains("fleischlos")
            || marker == "(f)";
    }
    if vegan {
        Some(Diet::Vegan)
    } else if vegetarian {
        Some(Diet::Vegetarian)
    } else {
        None
    }
}

/// Parses a `speiseplan_<id>_-de.html` page into days with dishes. Fails when the page
/// has dish entries that cannot be dated or named, which means the layout changed.
pub fn parse_page(page: &str) -> Result<Vec<Day>, String> {
    let document = Html::parse_document(page);
    let title_sel = selector("[class*='dish__title']");
    let group_sel = selector("[class*='artname'], [class*='dish-list__group']");

    let mut days: Vec<Day> = Vec::new();
    let mut dish_type = String::new();
    let (mut items, mut undated) = (0, 0);
    for element in document
        .root_element()
        .descendants()
        .filter_map(ElementRef::wrap)
    {
        if let Some(date) = heading_date(element) {
            if days.last().is_none_or(|day| day.date != date) {
                days.push(Day {
                    date,
                    dishes: Vec::new(),
                });
            }
            dish_type.clear();
            continue;
        }
        // Dish items nested in another (if attributes move inward) are the same dish.
        let nested = element
            .ancestors()
            .filter_map(ElementRef::wrap)
            .any(is_dish_item);
        if !is_dish_item(element) || nested {
            continue;
        }
        items += 1;
        let Some(day) = days.last_mut() else {
            undated += 1;
            continue;
        };
        // An empty group name continues the previous group.
        if let Some(group) = element.select(&group_sel).map(text).find(|g| !g.is_empty()) {
            dish_type = group;
        }
        // Entries without a name are placeholders on the site.
        let Some(name) = element.select(&title_sel).map(text).find(|n| !n.is_empty()) else {
            continue;
        };
        let codes = dish_codes(element);
        let diet = dish_diet(element);
        day.dishes.push(Dish {
            labels: labels(&codes, diet),
            prices: prices(&dish_type, &name, &codes, diet),
            dish_type: dish_type.clone(),
            name,
        });
    }

    let named: usize = days.iter().map(|d| d.dishes.len()).sum();
    if items > 0 && days.is_empty() {
        return Err(format!(
            "{items} dishes but no dates found; has the page layout changed?"
        ));
    }
    if items > 0 && named == 0 {
        return Err(format!(
            "{items} dishes but no names found; has the page layout changed?"
        ));
    }
    if undated > 0 {
        log::warn!("skipped {undated} dishes listed before the first date");
    }
    Ok(days)
}

async fn download(client: &HttpClient, id: u32) -> Result<Option<String>, String> {
    let mut error = None;
    for url in PAGE_URLS {
        match client.get(&url.replace("{id}", &id.to_string())).await {
            Ok(Some(bytes)) => return Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
            Ok(None) => {} // 404: try the next location
            Err(e) => error = Some(e),
        }
    }
    error.map_or(Ok(None), Err)
}

/// Menu of Studierendenwerk location `id` from today on (about two weeks), as
/// `{ "days": [{ "date", "dishes": [...] }] }`.
#[tauri::command]
pub async fn swm_menu(
    app: AppHandle,
    client: State<'_, HttpClient>,
    id: u32,
    max_age_secs: u64,
) -> Result<Fetched, String> {
    if !(100..1000).contains(&id) {
        return Err(format!("invalid Studierendenwerk location {id}"));
    }
    cached(&app, &format!("swm/{id}.json"), max_age_secs, || async {
        let Some(page) = download(&client, id).await? else {
            return Ok(None);
        };
        let days = parse_page(&page).map_err(|e| format!("Studierendenwerk menu {id}: {e}"))?;
        Ok(Some(serde_json::json!({ "days": days })))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../tests/fixtures/speiseplan.html");

    fn parse(page: &str) -> Vec<Day> {
        parse_page(page).expect("page parses")
    }

    fn dish<'a>(days: &'a [Day], name_start: &str) -> &'a Dish {
        days.iter()
            .flat_map(|d| &d.dishes)
            .find(|d| d.name.starts_with(name_start))
            .unwrap_or_else(|| panic!("no dish {name_start}"))
    }

    #[test]
    fn parses_days_and_dishes() {
        let days = parse(FIXTURE);
        let dates: Vec<_> = days.iter().map(|d| d.date.as_str()).collect();
        assert_eq!(dates, ["2026-10-13", "2026-10-14"]); // the legend block is skipped
        assert_eq!(days[0].dishes.len(), 4);
        assert_eq!(days[1].dishes.len(), 3);
        let steak = dish(&days, "Schweinesteak");
        assert_eq!(
            steak.name,
            "Schweinesteak (1 Stück) (S vom Strohschwein) mit grüner Pfeffersauce"
        );
        assert_eq!(steak.dish_type, "Grill");
    }

    #[test]
    fn empty_group_continues_the_previous_one() {
        let days = parse(FIXTURE);
        assert_eq!(dish(&days, "Schokotrüffelmousse").dish_type, "Pasta");
    }

    #[test]
    fn maps_labels_like_eat_api() {
        let days = parse(FIXTURE);
        let steak = &dish(&days, "Schweinesteak").labels;
        for label in [
            "PORK", "MEAT", "GLUTEN", "WHEAT", "CEREAL", "MILK", "LACTOSE",
        ] {
            assert!(steak.contains(&label), "{label} missing in {steak:?}");
        }
        let fish = &dish(&days, "Fisch").labels;
        assert!(fish.contains(&"FISH") && !fish.contains(&"MEAT"));
        let curry = &dish(&days, "Blumenkohl").labels;
        assert!(curry.contains(&"VEGAN") && curry.contains(&"VEGETARIAN"));
        let knoepfle = &dish(&days, "Schweizer").labels;
        assert!(knoepfle.contains(&"VEGETARIAN") && !knoepfle.contains(&"VEGAN"));
    }

    #[test]
    fn prices_follow_the_self_service_rules() {
        let days = parse(FIXTURE);
        let students = |name: &str| {
            let p = &dish(&days, name).prices.students;
            (p.base_price, p.price_per_unit)
        };
        assert_eq!(students("Schweinesteak"), (1.0, 0.90)); // meat
        assert_eq!(students("Fisch"), (1.5, 0.90)); // fish
        assert_eq!(students("Currywurst"), (0.5, 0.90)); // sausage
        assert_eq!(students("Blumenkohl"), (0.0, 0.33)); // Studitopf
        assert_eq!(students("Schweizer"), (0.0, 0.90)); // vegetarian
        assert_eq!(students("Pizza"), (5.0, 0.0)); // pizza with meat
        assert_eq!(
            dish(&days, "Schweinesteak").prices.guests.price_per_unit,
            1.60
        );
    }

    #[test]
    fn reads_the_date_from_the_heading_text_without_the_class() {
        let days = parse(
            r#"<div class="c-schedule__item"><div class="c-schedule__header"><span>Montag, <strong>19.10.2026</strong></span></div>
            <ul><li class="c-menu-dish-list__item" data-essen-fleischlos="2"><span class="stwm-artname">Vegan</span>
            <p class="c-menu-dish__title">Linsencurry</p></li></ul></div>"#,
        );
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].date, "2026-10-19");
        assert!(days[0].dishes[0].labels.contains(&"VEGAN"));
    }

    #[test]
    fn survives_restructured_markup() {
        // Headings and dishes as siblings, dish as a div, codes on a child element.
        let days = parse(
            r#"<main><h3 class="c-schedule__header heute_2026-10-20">Dienstag</h3>
            <div class="c-menu-dish" data-essen-fleischlos="0"><span class="new-dish__title">Rinderbraten</span>
              <span class="marker" data-essen-typ="R" data-essen-allergene="Sl"></span></div>
            <h3 class="c-schedule__header heute_2026-10-21">Mittwoch</h3>
            <div class="c-menu-dish" data-essen-fleischlos="1"><span class="new-dish__title">Käsespätzle</span></div></main>"#,
        );
        assert_eq!(days.len(), 2);
        let braten = &days[0].dishes[0];
        assert_eq!(braten.name, "Rinderbraten");
        assert!(
            braten.labels.contains(&"BEEF")
                && braten.labels.contains(&"MEAT")
                && braten.labels.contains(&"CELERY")
        );
        assert_eq!(braten.prices.students.base_price, 1.0);
        assert!(days[1].dishes[0].labels.contains(&"VEGETARIAN"));
    }

    #[test]
    fn falls_back_to_diet_icons_and_markers() {
        let days = parse(
            r#"<div class="c-schedule__header heute_2026-10-22"></div>
            <li class="c-menu-dish-list__item"><p class="c-menu-dish__title">Tofu-Bowl</p>
              <span title="veganes Gericht" class="vegan"></span></li>
            <li class="c-menu-dish-list__item"><p class="c-menu-dish__title">Gemüsestrudel</p>
              <span class="c-menu-dish__marker">(f)</span></li>
            <li class="c-menu-dish-list__item" data-essen-typ="S"><p class="c-menu-dish__title">Leberkäse</p></li>"#,
        );
        let dishes = &days[0].dishes;
        assert!(dishes[0].labels.contains(&"VEGAN"));
        assert!(dishes[1].labels.contains(&"VEGETARIAN") && !dishes[1].labels.contains(&"VEGAN"));
        // No diet marker: the pork code still makes it a meat dish with the meat base price.
        assert!(dishes[2].labels.contains(&"MEAT"));
        assert_eq!(dishes[2].prices.students.base_price, 1.0);
    }

    #[test]
    fn reports_layout_changes_instead_of_an_empty_menu() {
        let undated = r#"<li class="c-menu-dish-list__item" data-essen-fleischlos="0"><p class="c-menu-dish__title">Gulasch</p></li>"#;
        assert!(parse_page(undated).unwrap_err().contains("no dates"));
        let unnamed = r#"<div class="c-schedule__header heute_2026-10-13"></div>
            <li class="c-menu-dish-list__item" data-essen-fleischlos="0"><p class="renamed">Gulasch</p></li>"#;
        assert!(parse_page(unnamed).unwrap_err().contains("no names"));
    }

    #[test]
    fn a_page_without_dishes_is_an_empty_menu() {
        assert_eq!(
            parse_page("<html><body><h1>Speiseplan</h1></body></html>"),
            Ok(vec![])
        );
        // A day with only placeholder entries is fine as long as another dish has a name.
        let days = parse(
            r#"<div class="c-schedule__header heute_2026-10-13"></div>
            <li class="c-menu-dish-list__item" data-essen-fleischlos="0"><p class="c-menu-dish__title"></p></li>
            <li class="c-menu-dish-list__item" data-essen-fleischlos="2"><p class="c-menu-dish__title">Dal</p></li>"#,
        );
        assert_eq!(days[0].dishes.len(), 1);
    }

    #[test]
    fn parses_german_dates() {
        assert_eq!(
            german_date("Dienstag, 13.10.2026"),
            Some("2026-10-13".into())
        );
        assert_eq!(german_date("1.2.2027"), Some("2027-02-01".into()));
        assert_eq!(german_date("32.13.2026"), None);
        assert_eq!(german_date("Kennzeichnungen:"), None);
    }
}
