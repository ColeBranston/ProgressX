import requests
import xml.etree.ElementTree as ET
import json
import time
import os

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"

# ---------------- QUERY ----------------
QUERY = (
    '"Health"[MeSH] OR "Wellness"[tiab] OR "Fitness"[tiab] OR '
    '"Exercise"[MeSH] OR "Physical Activity"[MeSH] OR '
    '"Mental Health"[MeSH] OR "Psychology"[tiab] OR '
    '"Exercise Therapy"[MeSH] OR "Resistance Training"[tiab] OR '
    '"Strength Training"[tiab]'
)

BATCH_SIZE = 100      # number of abstracts per request
CHUNK_SIZE = 10000    # number of articles per output file
DELAY = 0.34          # respect NCBI rate limits

# ---------------- OUTPUT DIRECTORY ----------------
OUTPUT_DIR = r"data\testing\storedArticles"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---------------- GET TOTAL COUNT ----------------
search_resp = requests.get(
    EUTILS + "esearch.fcgi",
    params={
        "db": "pubmed",
        "term": QUERY,
        "retmode": "xml",
        "retmax": 0,
    }
)
search_root = ET.fromstring(search_resp.text)
total_count = int(search_root.findtext(".//Count", "0"))
print(f"Total PubMed articles matching query: {total_count}")

# ---------------- PAGINATE ----------------
retstart = 0
chunk_index = 2

while retstart < total_count:
    print(f"\nFetching chunk {chunk_index} (articles {retstart + 1} to {min(retstart + CHUNK_SIZE, total_count)})")

    # fetch PMIDs for this chunk
    search_resp = requests.get(
        EUTILS + "esearch.fcgi",
        params={
            "db": "pubmed",
            "term": QUERY,
            "retmode": "xml",
            "retmax": CHUNK_SIZE,
            "retstart": retstart,
            "sort": "pub+date"  # oldest first
        }
    )
    search_root = ET.fromstring(search_resp.text)
    pmids = [x.text for x in search_root.findall(".//Id")]

    if not pmids:
        print(f"No more PMIDs returned at retstart={retstart}, stopping.")
        break  # stop loop if no PMIDs returned

    print(f"PMIDs retrieved: {len(pmids)}")
    time.sleep(DELAY)

    # ---------------- FETCH ABSTRACTS ----------------
    articles = []
    for i in range(0, len(pmids), BATCH_SIZE):
        batch_ids = pmids[i:i + BATCH_SIZE]
        fetch_resp = requests.get(
            EUTILS + "efetch.fcgi",
            params={
                "db": "pubmed",
                "id": ",".join(batch_ids),
                "retmode": "xml"
            }
        )
        root = ET.fromstring(fetch_resp.text)

        for article in root.findall(".//PubmedArticle"):
            pmid = article.findtext(".//PMID")
            title = article.findtext(".//ArticleTitle")
            journal = article.findtext(".//Journal/Title")
            year = article.findtext(".//PubDate/Year")
            abstract = " ".join([a.text for a in article.findall(".//AbstractText") if a.text])

            pmcid = article.findtext(".//ArticleId[@IdType='pmc']")
            doi = article.findtext(".//ArticleId[@IdType='doi']")

            pmc_link = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/" if pmcid else None
            doi_link = f"https://doi.org/{doi}" if doi else None

            articles.append({
                "pmid": pmid,
                "title": title,
                "journal": journal,
                "year": year,
                "abstract": abstract,
                "pmc_link": pmc_link,
                "doi_link": doi_link
            })

        print(f"Fetched batch {i // BATCH_SIZE + 1} / {max(1, len(pmids) // BATCH_SIZE)}")
        time.sleep(DELAY)

    # ---------------- WRITE CHUNK TO JSON ----------------
    filename = os.path.join(OUTPUT_DIR, f"pubmed_health_fitness_chunk_{chunk_index}.json")
    with open(filename, "w", encoding="utf-8") as f:
        json.dump({
            "article_count": len(articles),
            "articles": articles
        }, f, indent=2, ensure_ascii=False)

    print(f"Chunk {chunk_index} saved to {filename} with {len(articles)} articles")

    # ---------------- INCREMENT ----------------
    retstart += len(pmids)
    chunk_index += 1

print("\nAll done!")
