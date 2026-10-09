import requests
import xml.etree.ElementTree as ET
import time
from solr_instance import *
from datetime import datetime, timezone

from PUBMED_QUERIES import QUERIES

# ---------------- CONFIG ----------------
now = str(datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"

BATCH_SIZE = 100        # efetch batch size
CHUNK_SIZE = 20000      # max records per efetch call
DELAY = 0.34            # NCBI rate limiting

# Years to split by (adjust range to cover your target years)
START_YEAR = 2000
END_YEAR = datetime.now().year

# ---------------- FUNCTION: ONE ARTICLE -> RAW SOLR DOCUMENT ----------------
def parse_article(article, updated_at=None):
    """
    Turns one <PubmedArticle> into a raw-core document, or None when it can't be linked to (no PMC id
    or DOI) or is missing its title, year or abstract.
    """
    pmid = article.findtext(".//PMID")
    title = article.findtext(".//ArticleTitle")
    journal = article.findtext(".//Journal/Title")
    year_pub = article.findtext(".//PubDate/Year")
    abstract = " ".join([a.text for a in article.findall(".//AbstractText") if a.text])
    pmcid = article.findtext(".//ArticleId[@IdType='pmc']")
    doi = article.findtext(".//ArticleId[@IdType='doi']")

    if not pmcid and not doi:
        return None
    if not all([title, year_pub, abstract]):
        return None

    pmc_link = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/" if pmcid else None
    doi_link = f"https://doi.org/{doi}" if doi else None

    return {
        "id": pmc_link or doi_link,
        "content": abstract,
        "updated_at": updated_at or now,
        "published": year_pub,
        "type": "pubMed",
        "additional": f"title:{title}||journal:{journal}||pmid:{pmid}"
    }

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
        articles = [doc for doc in (parse_article(article) for article in articles_xml) if doc]

        # ---------------- LOAD TO SOLR ----------------
        print(f"Loading {len(articles)} articles into Solr")
        solr_raw_core.add(articles)
        print("Completed loading chunk :)")

        # with open("pubMed_temp.json", "w", encoding="utf-8") as f:
        #     json.dump({
        #         "year": year,
        #         "chunk_index": chunk_index,
        #         "article_count": len(articles),
        #         "articles": articles
        #     }, f, indent=2, ensure_ascii=False)

        retstart += CHUNK_SIZE
        chunk_index += 1

# ---------------- MAIN LOOP OVER YEARS ----------------
def main():
    for year in range(START_YEAR, END_YEAR + 1):
        retryCount = 0
        while retryCount < 3:
            try:
                for query in QUERIES:
                    fetch_and_load(query, year)
                break
            except Exception as e:
                retryCount += 1
                print(f'ERROR: {e}')
                print(f'Retry: {retryCount}/3')

        if retryCount >= 3:
            raise Exception(f'Retry Count Hit Maximum: {retryCount}/3')
        

    print("\nAll done! All years processed successfully.")


if __name__ == "__main__":
    main()
