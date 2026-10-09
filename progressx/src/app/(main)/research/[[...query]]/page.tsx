'use client';

import { useCallback, useEffect, useRef, useState } from "react"
import styles from "./research.module.css"
import { useParams, useRouter } from "next/dist/client/components/navigation";
import { StudyCard } from "@/app/internal_components";
import { pressable } from "@/app/internal_components/a11y";

export type SolrResponse = {
    debug?: Record<string, string>,
    docs: SolrDoc[],
    facets?: Record<string, string>,
    grouped?: Record<string, string>,
    highlighting?: Record<string, string>,
    hits: number,
    nextCursorMark?: string,
    qtime?: number,
    raw_response?: string,
    spellcheck?: Record<string, string>,
    stats?: Record<string, string>,
    _next_page_query?: string
}

export type SolrDoc = {
    id: string,
    journal: string,
    title: string,
    published?: string,
    content?: string
}
const ResearchPage = () => {

    const [query, setQuery] = useState<string>("")
    const [lastQuery, setLastQuery] = useState<string|undefined>("")
    const [docs, setDocs] = useState<SolrDoc[]>([])
    const [resultCount, setResultCount] = useState<number>(0)
    const [cached, setCached] = useState<SolrDoc[]>([])
    const [currPage, setCurrPage] = useState<number>(0)

    const [isLoading, setIsLoading] = useState<boolean>(true)

    const router = useRouter()
    const params = useParams()
    const latestRequest = useRef(0) // ignores responses from older searches that finish late

    const RESULTS_PER_PAGE = 10 // matches rows=10 in the search backend
    const MAX_PAGE_BUTTONS = 10

    const totalPages = Math.ceil(resultCount / RESULTS_PER_PAGE)
    // window of up to 10 page numbers, keeping 5 before the current page where possible
    const firstPageButton = Math.max(0, Math.min(currPage - 5, totalPages - MAX_PAGE_BUTTONS))
    const pageButtons = Array.from({length: Math.min(MAX_PAGE_BUTTONS, totalPages - firstPageButton)}, (_, i) => firstPageButton + i)

    function goToPage(pageNum: number, searchQuery: string) {
        router.push(`/research/${pageNum}/${encodeURIComponent(searchQuery)}`)
    }

    function submitSearch(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (query.trim() === "") return
        goToPage(0, query) // the params effect below does the fetch
    }

    async function getResults(currentQuery: string, pageNum: number){
        setIsLoading(true)
        const requestId = ++latestRequest.current

        console.log("Query triggered, query: ", currentQuery)

        const endpoint = `/api/search/search/${pageNum}/${encodeURIComponent(currentQuery)}`
                const response = await fetch(endpoint, {
            method: 'GET',
            credentials: 'include',
        })

        if (requestId !== latestRequest.current) return

        if (response.ok) {
            const solrResponse: SolrResponse = await response.json()
            console.log("Current solr repsonse: ", solrResponse)

            setDocs(solrResponse.docs ?? [])
            setResultCount(solrResponse.hits || 0)
            setLastQuery(currentQuery)
        }
        setIsLoading(false)
    }

    async function getCached() {
        setIsLoading(true)
        const endpoint = `/api/search/cached`
        const response = await fetch(endpoint,
            {
                method: 'GET',
                credentials: 'omit',
            }
        )

        if (response.ok) {
            const cachedDocs = await response.json()
            setCached(cachedDocs.docs)

            console.log("cached docs: ", cachedDocs)
            console.log("current docs: ", docs)
        }
        setIsLoading(false)
    }

    const routeUser = useCallback((link: string)=>{
        router.push(link) 
    },[router])

    function useHorizontalScroll() {
        const onWheel = (e: WheelEvent) => {
            if (e.deltaY === 0) return;
            
            // Find the closest scrollable container
            const container = e.currentTarget as HTMLElement;
            if (container) {
                e.preventDefault();
                container.scrollLeft += e.deltaY;
            }
        };

        // This "callback ref" runs every time the element mounts/unmounts
        const setRef = (el: HTMLDivElement | null) => {
            if (el) {
                el.addEventListener("wheel", onWheel, { passive: false });
            }
        };

        return setRef;
    }

    useEffect(()=> {
        if (params?.query) {
            const tempQuery = decodeURIComponent(params.query[1] ?? "") // query is placed here at index 1
            const pageNum = Math.max(0, Number(params.query[0]) || 0) // the page num is placed here at index 0
            console.log("Current Page Num:", pageNum)
            setQuery(tempQuery)
            setCurrPage(pageNum)
            if (tempQuery) {
                getResults(tempQuery, pageNum)
            } else {
                setIsLoading(false)
            }

        } else {
            console.log(`No Params detected, getting cached documents`)
            getCached()
        }
    },[params])

    const scrollRef = useHorizontalScroll()

    return (
        <div className='mainWrapper'>
            <div className={styles.researchContainer}>
                <div className={styles.searchFormContainer}>
                    <form className={styles.searchForm} onSubmit={submitSearch}>
                        <svg xmlns="http://www.w3.org/2000/svg"
                            className={styles.searchIcon}
                            viewBox="0 0 24 24" 
                            fill="none" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            width="20" 
                            height="20"
                            aria-hidden="true">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input className={styles.searchbar} placeholder="Search for optimal workouts..." type={"text"} onChange={(e)=>{setQuery(e.target.value)}}/>
                    </form>
                </div>

                { isLoading? null : 
                    ( docs?.length > 0?
                        <div className={styles.resultsContainer}>
                            <div className={styles.resultsHeaderContainer}>
                                <p className={styles.searchHeader}>{lastQuery?.toUpperCase()}</p>
                                <p className={styles.resultsCount}>Search Results: {resultCount}</p>
                            </div>
                            <div className={styles.resultsScroll} ref={scrollRef}>
                                <div className={styles.resultsGrid}>
                                    {docs.map((doc: SolrDoc, index:number)=>{
                                        return <StudyCard key={index} id={doc.id} title={doc.title} journal={doc.journal} callbackFunc={routeUser} />
                                    })}
                                </div>
                            </div>
                            <div className={styles.paginationContainer}>
                                {pageButtons.map((pageNum) => {
                                    return <i {...pressable(()=>{goToPage(pageNum, lastQuery ?? "")})} aria-label={`Page ${pageNum}`} aria-current={currPage == pageNum ? "page" : undefined} key={pageNum} style={{color: (currPage == pageNum? "red" : undefined)}}>{pageNum}</i>
                                })}
                            </div>
                        </div>
                        :
                        lastQuery?
                        (
                            <div className={styles.resultsContainer}>
                                <div className={styles.resultsHeaderContainer}>
                                    <p className={styles.searchHeader}>{lastQuery?.toUpperCase()}</p>
                                    <p className={styles.resultsCount}>Search Results: {resultCount}</p>
                                    <p>No results found, try changing your search</p>
                                </div>
                            </div>
                        )
                        :
                        (
                        <div className={styles.resultsContainer}>
                            <div className={styles.resultsHeaderContainer}>
                                <p className={styles.cacheHeader}>Recent Searches</p>
                            </div>
                            <div className={styles.resultsScroll} ref={scrollRef}>
                                <div className={styles.resultsGrid}>
                                {
                                    cached?
                                    cached.map((doc: SolrDoc, index: number) => {
                                        return <StudyCard key={index} id={doc.id} title={doc.title} journal={doc.journal} callbackFunc={routeUser} />
                                    })
                                    :
                                    <p>No recent searches</p>
                                }
                                </div>
                            </div>
                        </div>
                        )
                    )}
            </div>
        </div>
    )
}

export default ResearchPage