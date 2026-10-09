import csv
import io
import json
import os
import sys
import zipfile

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import ingest_foods as foods  # noqa: E402
from testsupport import SOLR_TEST_URL, fixture, solr_request  # noqa: E402


@pytest.mark.parametrize("name,branded", [
    ("McDONALD'S, BIG MAC", True),
    ('PIZZA HUT 14" Pepperoni Pizza', True),
    ("Beef, ground, NFS", False),
    ("Milk, UHT, whole", False),
    ("Stew, beef", False),
])
def test_is_branded(name, branded):
    assert foods.is_branded(name) is branded


def test_to_float():
    assert foods.to_float("1.5") == 1.5
    assert foods.to_float("") is None
    assert foods.to_float(None) is None


def test_nutrients_prefer_primary_codes_over_fallbacks():
    store = {}
    foods.add_nutrient(store, "957", 120)   # energy (Atwater) fallback
    foods.add_nutrient(store, "208", 100)   # energy
    foods.add_nutrient(store, "328", 2)     # vitamin D in ug -> IU fallback
    foods.add_nutrient(store, "203", -1)    # negative: ignored
    foods.add_nutrient(store, "999", 5)     # unknown code: ignored
    assert foods.finish_nutrients(store) == {"calories": 100, "Vitamin D": 80.0}


def test_portion_labels():
    units = {"1000": "cup", "9999": "undetermined"}
    assert foods.portion_label({"portion_description": "1 slice"}, units) == "1 slice"
    assert foods.portion_label({"portion_description": "Quantity not specified"}, units) == "1 typical serving"
    assert foods.portion_label({"amount": "1.0", "measure_unit_id": "1000", "modifier": "chopped"}, units) == "1 cup chopped"
    assert foods.portion_label({"amount": "2.0", "measure_unit_id": "9999", "modifier": "90000"}, units) == "2"


def test_to_solr_doc_matches_the_fixture_shape():
    doc = foods.to_solr_doc("survey", "survey-1", {
        "name": "Stew, beef", "category": "Stews",
        "nutrients": {"calories": 98, "proteinG": 7.6}, "portions": [{"label": f"{i} cup", "grams": i} for i in range(20)],
    })
    assert set(doc) == set(fixture("foods.json")[0])
    assert doc["name_head"] == "Stew" and doc["name_length"] == 10 and doc["boost"] == 1.3
    assert len(json.loads(doc["portions"])) == 12
    assert foods.to_solr_doc("survey", "x", {"name": "Water", "category": "", "nutrients": {}, "portions": []}) is None
    assert foods.to_solr_doc("sr_legacy", "x", {"name": "McDONALD'S, BIG MAC", "category": "", "nutrients": {"calories": 1}, "portions": []})["boost"] == 0.6


def zip_of(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, rows in files.items():
            text = io.StringIO()
            writer = csv.DictWriter(text, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
            archive.writestr(name, text.getvalue().encode("latin-1"))
    buffer.seek(0)
    return zipfile.ZipFile(buffer)


def test_load_cnf_reads_the_canadian_nutrient_file(monkeypatch):
    archive = zip_of({
        "cnf/NUTRIENT NAME.csv": [{"NutrientID": "1", "NutrientCode": "208"}, {"NutrientID": "2", "NutrientCode": "203"}],
        "cnf/FOOD GROUP.csv": [{"FoodGroupID": "9", "FoodGroupName": " Eggs "}],
        "cnf/MEASURE NAME.csv": [{"MeasureID": "5", "MeasureDescription": "1 large"}, {"MeasureID": "6", "MeasureDescription": "100g"}],
        "cnf/FOOD NAME.csv": [{"FoodID": "77", "FoodDescription": "Egg, whole, raw", "FoodGroupID": "9"}],
        "cnf/NUTRIENT AMOUNT.csv": [{"FoodID": "77", "NutrientID": "1", "NutrientValue": "143"}, {"FoodID": "77", "NutrientID": "2", "NutrientValue": "12.6"}],
        "cnf/CONVERSION FACTOR.csv": [{"FoodID": "77", "MeasureID": "5", "ConversionFactorValue": "0.5"}, {"FoodID": "77", "MeasureID": "6", "ConversionFactorValue": "1"}],
    })
    monkeypatch.setattr(foods, "download", lambda name: archive)
    monkeypatch.setattr(foods, "log", lambda message: None)
    assert list(foods.load_cnf()) == [("cnf-77", {
        "name": "Egg, whole, raw", "category": "Eggs",
        "nutrients": {"calories": 143.0, "proteinG": 12.6}, "portions": [{"label": "1 large", "grams": 50.0}],
    })]


@pytest.mark.integration
def test_schema_is_already_what_the_ingester_wants(solr_available, monkeypatch):
    """ensure_schema against the committed foods configset: nothing to add or change"""
    monkeypatch.setattr(foods, "SOLR", SOLR_TEST_URL.rstrip("/"))
    writes = []
    real = foods.solr

    def spy(path, payload=None, method=None):
        if payload is not None:
            writes.append((path, payload))
        return real(path, payload, method)

    monkeypatch.setattr(foods, "solr", spy)
    foods.ensure_schema()
    assert [path for path, _ in writes] == ["/foods/config"]
    assert solr_request("foods/config/overlay?wt=json")["overlay"]["userProps"]["update.autoCreateFields"] == "false"
