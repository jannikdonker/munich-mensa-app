//! Menus straight from the Studierendenwerk München Oberbayern website, for locations
//! the eat-api lacks or has stale IDs for. Pages are parsed into eat-api's JSON shape;
//! labels and prices follow eat-api's `StudentenwerkMenuParser`.

use std::collections::BTreeSet;

use scraper::{ElementRef, Html, Selector};
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::{
    cache::{Fetched, cached},
    http::HttpClient,
};

const PAGE_URL: &str =
    "https://www.studierendenwerk-muenchen-oberbayern.de/mensa/speiseplan/speiseplan_{id}_-de.html";

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

fn labels(codes: &[&str], meatless: &str) -> Vec<&'static str> {
    let mut labels: BTreeSet<&'static str> = codes
        .iter()
        .flat_map(|c| labels_for_code(c))
        .copied()
        .collect();
    match meatless {
        "0" if !labels.contains("FISH") => {
            labels.insert("MEAT");
        }
        "1" => {
            labels.insert("VEGETARIAN");
        }
        "2" => {
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
/// from https://www.studierendenwerk-muenchen-oberbayern.de/mensa/mensa-preise/
fn prices(dish_type: &str, name: &str, codes: &[&str], meatless: &str) -> Prices {
    const CLASSIC: [f64; 3] = [0.90, 1.15, 1.60];
    const SOUP_STEW: [f64; 3] = [0.33, 1.15, 1.60];

    let kind = dish_type.to_lowercase();
    let with_meat = meatless == "0";
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
    } else if codes.contains(&"Fi") {
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

/// Parses a `speiseplan_<id>_-de.html` page into days with dishes.
pub fn parse_page(page: &str) -> Vec<Day> {
    let document = Html::parse_document(page);
    let (day_sel, header_sel, item_sel, group_sel, title_sel) = (
        selector("div.c-schedule__item"),
        selector("div.c-schedule__header"),
        selector("li.js-menu__list-item"),
        selector("span.stwm-artname"),
        selector("p.c-menu-dish__title"),
    );

    let mut days = Vec::new();
    for day in document.select(&day_sel) {
        // The header carries the date as a class: "c-schedule__header heute_2026-10-13".
        let Some(date) = day.select(&header_sel).next().and_then(|header| {
            header
                .value()
                .classes()
                .find_map(|c| c.strip_prefix("heute_").map(str::to_owned))
        }) else {
            continue;
        };

        let mut dishes = Vec::new();
        let mut dish_type = String::new();
        for item in day.select(&item_sel) {
            let attr = |name: &str| item.value().attr(name).unwrap_or_default();
            // An empty group name continues the previous group.
            if let Some(group) = item
                .select(&group_sel)
                .next()
                .map(text)
                .filter(|g| !g.is_empty())
            {
                dish_type = group;
            }
            let Some(name) = item
                .select(&title_sel)
                .next()
                .map(text)
                .filter(|n| !n.is_empty())
            else {
                continue;
            };
            let codes: Vec<&str> = [
                attr("data-essen-typ"),
                attr("data-essen-zusatz"),
                attr("data-essen-allergene"),
            ]
            .iter()
            .flat_map(|list| list.split(','))
            .map(str::trim)
            .filter(|c| !c.is_empty())
            .collect();
            let meatless = attr("data-essen-fleischlos");
            dishes.push(Dish {
                labels: labels(&codes, meatless),
                prices: prices(&dish_type, &name, &codes, meatless),
                dish_type: dish_type.clone(),
                name,
            });
        }
        days.push(Day { date, dishes });
    }
    days
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
        let Some(bytes) = client
            .get(&PAGE_URL.replace("{id}", &id.to_string()))
            .await?
        else {
            return Ok(None);
        };
        let page = String::from_utf8_lossy(&bytes);
        let days = parse_page(&page);
        serde_json::to_value(serde_json::json!({ "days": days }))
            .map(Some)
            .map_err(|e| e.to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../tests/fixtures/speiseplan.html");

    fn dish<'a>(days: &'a [Day], name_start: &str) -> &'a Dish {
        days.iter()
            .flat_map(|d| &d.dishes)
            .find(|d| d.name.starts_with(name_start))
            .unwrap_or_else(|| panic!("no dish {name_start}"))
    }

    #[test]
    fn parses_days_and_dishes() {
        let days = parse_page(FIXTURE);
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
        let days = parse_page(FIXTURE);
        assert_eq!(dish(&days, "Schokotrüffelmousse").dish_type, "Pasta");
    }

    #[test]
    fn maps_labels_like_eat_api() {
        let days = parse_page(FIXTURE);
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
        let days = parse_page(FIXTURE);
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
}
