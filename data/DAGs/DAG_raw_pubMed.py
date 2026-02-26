import requests
import xml.etree.ElementTree as ET
import time
from solr_instance import *
from datetime import datetime, timezone

import json

# ---------------- CONFIG ----------------
now = str(datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"

# Main search query
'''
    pubmed docs indicate search queries should be seperated and made with tags such as [MeSH] for semantic intent, and [tiab] for keyword matching
'''
BASE_QUERY = (
    '"Health"[MeSH] OR "Wellness"[tiab] OR "Fitness"[tiab] OR '
    '"Exercise"[MeSH] OR "Physical Activity"[MeSH] OR '
    '"Mental Health"[MeSH] OR "Psychology"[tiab] OR '
    '"Exercise Therapy"[MeSH] OR "Resistance Training"[tiab] OR '
    '"Strength Training"[tiab] OR'
    '"Optimal"[tiab] OR "Optimal Exercise"[MeSH] OR "Optimal Training"[MeSH]'
)

BATCH_SIZE = 100        # efetch batch size
CHUNK_SIZE = 20000      # max records per efetch call
DELAY = 0.34            # NCBI rate limiting

# Years to split by (adjust range to cover your target years)
START_YEAR = 2000
END_YEAR = 2025

# ---------------- FUNCTION: FETCH AND LOAD CHUNK ----------------
def fetch_and_load(query, year):
    """
    Fetches all records for a given query + year, in CHUNK_SIZE batches,
    and loads them into Solr.
    """
    # ---------------- INITIAL SEARCH WITH HISTORY ----------------
    search_resp = requests.get(
        EUTILS + "esearch.fcgi",
        params={
            "db": "pubmed",
            "term": f"({query}) AND {year}[dp]",
            "retmode": "xml",
            "retmax": 0,
            "usehistory": "y"
        }
    )
    search_root = ET.fromstring(search_resp.text)
    total_count = int(search_root.findtext(".//Count", "0"))

    if total_count == 0:
        print(f"No articles found for year {year}")
        return

    webenv = search_root.findtext(".//WebEnv")
    query_key = search_root.findtext(".//QueryKey")
    print(f"\nYear {year}: {total_count} articles found")

    retstart = 0
    chunk_index = 1

    # ---------------- PAGE FULL RECORDS ----------------
    while retstart < total_count:
        print(f"Fetching chunk {chunk_index} for {year} (articles {retstart + 1} to {min(retstart + CHUNK_SIZE, total_count)})")

        fetch_resp = requests.get(
            EUTILS + "efetch.fcgi",
            params={
                "db": "pubmed",
                "query_key": query_key,
                "WebEnv": webenv,
                "retstart": retstart,
                "retmax": CHUNK_SIZE,
                "retmode": "xml"
            }
        )

        root = ET.fromstring(fetch_resp.text)
        articles_xml = root.findall(".//PubmedArticle")

        if not articles_xml:
            print("No more records returned, stopping this year.")
            break

        print(f"Records fetched: {len(articles_xml)}")
        time.sleep(DELAY)

        # ---------------- PARSE AND PREPARE FOR SOLR ----------------
        articles = []
        for article in articles_xml:
            pmid = article.findtext(".//PMID")
            title = article.findtext(".//ArticleTitle")
            journal = article.findtext(".//Journal/Title")
            year_pub = article.findtext(".//PubDate/Year")
            abstract = " ".join([a.text for a in article.findall(".//AbstractText") if a.text])
            pmcid = article.findtext(".//ArticleId[@IdType='pmc']")
            doi = article.findtext(".//ArticleId[@IdType='doi']")

            if not pmcid and not doi:
                continue
            if not all([title, year_pub, abstract]):
                continue

            pmc_link = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/" if pmcid else None
            doi_link = f"https://doi.org/{doi}" if doi else None

            # # Check if exists in Solr
            # pmcCheck = solr_raw_core.search(f'id:"{pmc_link}"', fl="id", rows=1).hits
            # doiCheck = solr_raw_core.search(f'id:"{doi_link}"', fl="id", rows=1).hits

            # if pmcCheck >= 1 or doiCheck >= 1:
            #     articles.append({
            #         "id": pmc_link or doi_link,
            #         "content": {"set": abstract},
            #         "published": {"set": year_pub},
            #         "updated_at": {"set": now},
            #         "type": {"set": "pubMed"},
            #         "additional": {"set": f"title:{title}|journal:{journal}|pmid:{pmid}"}
            #     })
            # else:
            articles.append({
                "id": pmc_link or doi_link,
                "content": abstract,
                "updated_at": now,
                "published": year_pub,
                "type": "pubMed",
                "additional": f"title:{title}||journal:{journal}||pmid:{pmid}"
            })

        # ---------------- LOAD TO SOLR ----------------
        print(f"Loading {len(articles)} articles into Solr")
        solr_raw_core.add(articles)
        print("Completed loading chunk :)")

        with open("pubMed_temp.json", "w", encoding="utf-8") as f:
            json.dump({
                "year": year,
                "chunk_index": chunk_index,
                "article_count": len(articles),
                "articles": articles
            }, f, indent=2, ensure_ascii=False)

        retstart += CHUNK_SIZE
        chunk_index += 1

# ---------------- MAIN LOOP OVER YEARS ----------------
for year in range(START_YEAR, END_YEAR + 1):
    fetch_and_load(BASE_QUERY, year)

print("\nAll done! All years processed successfully.")
