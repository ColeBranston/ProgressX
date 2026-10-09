"""
Builds the `foods` Solr core used by the diet assistant (Quick Add > "Describe it instead").

Sources (all free, government published):
  - USDA FoodData Central: FNDDS survey foods (prepared dishes, e.g. "Stew, beef", with portion
    sizes), SR Legacy (standard reference foods) and Foundation foods. Public domain.
  - Health Canada, Canadian Nutrient File 2015. Open Government Licence - Canada.

Every food is stored with its nutrients per 100 g (in the app's units) and its portion sizes in
grams, so the app can work out any amount.

Run from the repo root while the solr container is up:
    python3 data/foods/ingest_foods.py
Re-running replaces the whole core's contents. Downloads are cached in data/foods/raw/.
Standard library only.
"""

import csv
import io
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

SOLR = os.environ.get("FOODS_SOLR_URL", "http://localhost:8983/solr").rstrip("/")
CORE = "foods"
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")

FDC = "https://fdc.nal.usda.gov/fdc-datasets/"
DATASETS = {
    "survey": FDC + "FoodData_Central_survey_food_csv_2024-10-31.zip",
    "sr_legacy": FDC + "FoodData_Central_sr_legacy_food_csv_2018-04.zip",
    "foundation": FDC + "FoodData_Central_foundation_food_csv_2026-04-30.zip",
    "cnf": "https://www.canada.ca/content/dam/hc-sc/migration/hc-sc/fn-an/alt_formats/zip/nutrition/fiche-nutri-data/cnf-fcen-csv.zip",
}

SOURCE_NAMES = {
    "survey": "USDA FoodData Central (FNDDS)",
    "sr_legacy": "USDA FoodData Central (SR Legacy)",
    "foundation": "USDA FoodData Central (Foundation)",
    "cnf": "Canadian Nutrient File",
}

# Ranking boost per source: survey foods are what people actually eat (mixed dishes, typical portions)
SOURCE_BOOST = {"survey": 1.3, "cnf": 1.15, "sr_legacy": 1.0, "foundation": 0.9}

# Restaurant/brand entries ("PIZZA HUT 14\" Pepperoni Pizza", "McDONALD'S, BIG MAC") rank below the
# generic version unless the search names the brand
BRANDED_PENALTY = 0.6


BRAND_WORD = re.compile(r"\b[A-Z][A-Z'&.-]{2,}\b")  # USDA writes brand names in capitals
NOT_BRANDS = {"NFS", "NS", "USDA", "UHT", "RTE", "RTF", "BBQ", "M.F"}


def is_branded(name):
    return any(word.strip(".") not in NOT_BRANDS for word in BRAND_WORD.findall(name))


# USDA legacy nutrient numbers (also used as CNF's NutrientCode) -> the app's names and units.
# Keys must match MICRONUTRIENT_DEFS in progressx/src/app/internal_components/mydiet/microNutrients.ts
NUTRIENTS = {
    "208": "calories",
    "203": "proteinG",
    "205": "carbsG",
    "204": "fatsG",
    "291": "fiberG",
    "320": "Vitamin A",       # ug RAE
    "324": "Vitamin D",       # IU (falls back to 328 ug x 40 below)
    "323": "Vitamin E",
    "430": "Vitamin K",
    "404": "Thiamin",
    "406": "Niacin",
    "405": "Riboflavin",
    "418": "Vitamin B12",
    "435": "Folate (B9)",     # ug DFE (falls back to 417 total folate below)
    "415": "Vitamin B6",
    "410": "Pantothenic Acid",
    "401": "Vitamin C",
    "303": "Iron",
    "416": "Biotin",
    "421": "Choline",
    "301": "Calcium",
    "304": "Magnesium",
    "306": "Potassium",
    "307": "Sodium",
    "601": "Cholesterol",     # mg
    "309": "Zinc",
    "314": "Iodine",
}
FALLBACKS = {"957": "208", "958": "208", "328": "324", "417": "435"}  # used only when the main one is missing
FALLBACK_SCALE = {"328": 40.0}  # vitamin D ug -> IU


def log(message):
    print(message, flush=True)


def download(name):
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, os.path.basename(urllib.parse.urlparse(DATASETS[name]).path))
    if not os.path.exists(path):
        log(f"Downloading {DATASETS[name]}")
        urllib.request.urlretrieve(DATASETS[name], path)
    return zipfile.ZipFile(path)


def read_csv(archive, suffix, encoding="utf-8"):
    member = next(n for n in archive.namelist() if n.endswith(suffix))
    with archive.open(member) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding=encoding, newline=""))


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def add_nutrient(store, code, amount):
    """Records one nutrient value (per 100 g) under the app's name, preferring primary codes over fallbacks."""
    if amount is None or amount < 0:
        return
    if code in NUTRIENTS:
        store[NUTRIENTS[code]] = amount
    elif code in FALLBACKS:
        store.setdefault("_fallback", {})[FALLBACKS[code]] = amount * FALLBACK_SCALE.get(code, 1.0)


def finish_nutrients(store):
    fallback = store.pop("_fallback", {})
    for code, amount in fallback.items():
        store.setdefault(NUTRIENTS[code], amount)
    return {k: round(v, 4) for k, v in store.items()}


def portion_label(row, units):
    description = (row.get("portion_description") or "").strip()
    if description and description.lower() != "quantity not specified":
        return description
    if description.lower() == "quantity not specified":
        return "1 typical serving"
    amount = (row.get("amount") or "").strip()
    unit = units.get(row.get("measure_unit_id"), "")
    unit = "" if unit in ("undetermined", "") else unit
    modifier = (row.get("modifier") or "").strip()
    if modifier.isdigit():  # FNDDS modifier codes, not words
        modifier = ""
    amount = amount[:-2] if amount.endswith(".0") else amount
    return " ".join(part for part in (amount or "1", unit, modifier) if part)


def load_fdc(name):
    archive = download(name)
    log(f"Reading {SOURCE_NAMES[name]}")

    # survey files store the legacy nutrient number in food_nutrient.nutrient_id; the others store nutrient.id
    id_to_number = {row["id"]: row["nutrient_nbr"] for row in read_csv(archive, "/nutrient.csv")}
    units = {row["id"]: row["name"] for row in read_csv(archive, "/measure_unit.csv")}
    categories = {}
    for suffix in ("/food_category.csv", "/wweia_food_category.csv"):
        if not any(n.endswith(suffix) for n in archive.namelist()):
            continue
        for row in read_csv(archive, suffix):
            key = row.get("id") or row.get("wweia_food_category")
            categories[key] = row.get("description") or row.get("wweia_food_category_description") or ""

    wanted_type = {"survey": "survey_fndds_food", "sr_legacy": "sr_legacy_food", "foundation": "foundation_food"}[name]
    foods = {}
    for row in read_csv(archive, "/food.csv"):
        if row["data_type"] == wanted_type:
            foods[row["fdc_id"]] = {
                "name": row["description"].strip(),
                "category": categories.get(row["food_category_id"], ""),
                "nutrients": {},
                "portions": [],
            }

    for row in read_csv(archive, "/food_nutrient.csv"):
        food = foods.get(row["fdc_id"])
        if food is None:
            continue
        code = row["nutrient_id"] if name == "survey" else id_to_number.get(row["nutrient_id"], "")
        add_nutrient(food["nutrients"], code.split(".")[0], to_float(row["amount"]))

    for row in read_csv(archive, "/food_portion.csv"):
        food = foods.get(row["fdc_id"])
        grams = to_float(row["gram_weight"])
        if food is None or not grams or grams <= 0:
            continue
        label = portion_label(row, units)
        if not any(p["label"] == label for p in food["portions"]):
            food["portions"].append({"label": label, "grams": round(grams, 2)})

    for fdc_id, food in foods.items():
        yield f"{name}-{fdc_id}", food


def load_cnf():
    archive = download("cnf")
    log(f"Reading {SOURCE_NAMES['cnf']}")
    enc = "latin-1"
    id_to_code = {row["NutrientID"]: row["NutrientCode"] for row in read_csv(archive, "NUTRIENT NAME.csv", enc)}
    groups = {row["FoodGroupID"]: row["FoodGroupName"].strip() for row in read_csv(archive, "FOOD GROUP.csv", enc)}
    measures = {row["MeasureID"]: row["MeasureDescription"].strip() for row in read_csv(archive, "MEASURE NAME.csv", enc)}

    foods = {}
    for row in read_csv(archive, "FOOD NAME.csv", enc):
        foods[row["FoodID"]] = {
            "name": row["FoodDescription"].strip(),
            "category": groups.get(row["FoodGroupID"], ""),
            "nutrients": {},
            "portions": [],
        }
    for row in read_csv(archive, "NUTRIENT AMOUNT.csv", enc):
        food = foods.get(row["FoodID"])
        if food is not None:
            add_nutrient(food["nutrients"], id_to_code.get(row["NutrientID"], ""), to_float(row["NutrientValue"]))
    # a conversion factor is the measure's weight in units of 100 g
    for row in read_csv(archive, "CONVERSION FACTOR.csv", enc):
        food = foods.get(row["FoodID"])
        factor = to_float(row["ConversionFactorValue"])
        label = measures.get(row["MeasureID"])
        if food is None or not factor or not label or label.lower() == "100g":
            continue
        food["portions"].append({"label": label, "grams": round(factor * 100, 2)})

    for food_id, food in foods.items():
        yield f"cnf-{food_id}", food


# ---------- Solr ----------

def solr(path, payload=None, method=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{SOLR}{path}", data=data, method=method or ("POST" if data else "GET"),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Solr {path} -> {e.code}: {e.read().decode()[:500]}") from None


def ensure_core():
    status = solr(f"/admin/cores?action=STATUS&core={CORE}&wt=json")
    if status.get("status", {}).get(CORE):
        return
    # Solr runs in user-managed mode: copy the default config into the core's folder, then register it
    container = os.environ.get("SOLR_CONTAINER", "progressx-solr")
    log(f"Creating Solr core '{CORE}' in container {container}")
    subprocess.run(["docker", "exec", container, "sh", "-c",
                    f"mkdir -p /var/solr/data/{CORE} && ( [ -d /var/solr/data/{CORE}/conf ] || cp -r /opt/solr/server/solr/configsets/_default/conf /var/solr/data/{CORE}/ )"],
                   check=True)
    solr(f"/admin/cores?action=CREATE&name={CORE}&instanceDir={CORE}&wt=json")


FIELDS = [
    {"name": "name", "type": "text_en", "stored": True, "indexed": True},
    {"name": "name_head", "type": "text_en", "stored": False, "indexed": True},  # text before the first comma: what the food is
    {"name": "category", "type": "text_en", "stored": True, "indexed": True},
    {"name": "source", "type": "string", "stored": True, "indexed": True},
    {"name": "boost", "type": "pfloat", "stored": True, "indexed": True},
    {"name": "name_length", "type": "pint", "stored": True, "indexed": True},
    {"name": "nutrients", "type": "string", "stored": True, "indexed": False, "docValues": False},
    {"name": "portions", "type": "string", "stored": True, "indexed": False, "docValues": False},
]


def ensure_schema():
    existing = {f["name"]: f for f in solr(f"/{CORE}/schema/fields?wt=json")["fields"]}
    for field in FIELDS:
        current = existing.get(field["name"])
        if current is None:
            solr(f"/{CORE}/schema", {"add-field": field})
        elif current.get("type") != field["type"]:
            solr(f"/{CORE}/schema", {"replace-field": field})
    # the default "data driven" mode would guess types for unknown fields; we only send known ones
    solr(f"/{CORE}/config", {"set-user-property": {"update.autoCreateFields": "false"}})


def to_solr_doc(name, doc_id, food):
    """One food as a `foods` core document, or None when it has no calories (useless without energy)."""
    nutrients = finish_nutrients(food["nutrients"])
    if "calories" not in nutrients:
        return None
    return {
        "id": doc_id,
        "name": food["name"],
        "name_head": food["name"].split(",")[0],
        "category": food["category"],
        "source": SOURCE_NAMES[name],
        "boost": SOURCE_BOOST[name] * (BRANDED_PENALTY if name != "cnf" and is_branded(food["name"]) else 1.0),
        "name_length": len(food["name"]),
        "nutrients": json.dumps(nutrients, separators=(",", ":")),
        "portions": json.dumps(food["portions"][:12], separators=(",", ":")),
    }


def main():
    ensure_core()
    ensure_schema()

    docs = []
    for name in ("survey", "sr_legacy", "foundation"):
        for doc_id, food in load_fdc(name):
            docs.append((name, doc_id, food))
    for doc_id, food in load_cnf():
        docs.append(("cnf", doc_id, food))

    log("Replacing the foods core contents")
    solr(f"/{CORE}/update?commit=true", {"delete": {"query": "*:*"}})

    batch, written, skipped = [], 0, 0
    for name, doc_id, food in docs:
        doc = to_solr_doc(name, doc_id, food)
        if doc is None:  # useless without energy
            skipped += 1
            continue
        batch.append(doc)
        if len(batch) == 1000:
            solr(f"/{CORE}/update", batch)
            written += len(batch)
            batch = []
    if batch:
        solr(f"/{CORE}/update", batch)
        written += len(batch)
    solr(f"/{CORE}/update?commit=true", {"commit": {}})
    log(f"Indexed {written} foods ({skipped} skipped without calories)")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, urllib.error.URLError, subprocess.CalledProcessError) as e:
        sys.exit(f"Failed: {e}")
