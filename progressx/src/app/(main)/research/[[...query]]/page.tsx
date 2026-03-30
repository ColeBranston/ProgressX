'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styles from "./research.module.css"
import { useParams, useRouter } from "next/dist/client/components/navigation";
import { StudyCard } from "@/app/internal_components";

type SolrResponse = {
    debug?: Record<any,any>,
    docs: Record<number,any>[],
    facets?: Record<any,any>,
    grouped?: Record<any,any>,
    highlighting?: Record<any,any>,
    hits: number,
    nextCursorMark?: any,
    qtime?: number,
    raw_response?: any,
    spellcheck?: Record<any,any>,
    stats?: Record<any,any>,
    _next_page_query?: any
}

const ResearchPage = () => {

    const [query, setQuery] = useState<string>("")
    const [lastQuery, setLastQuery] = useState<string|undefined>("")
    const [docs, setDocs] = useState<any>(null)
    const [resultCount, setResultCount] = useState<number>(0)
    const [cached, setCached] = useState<any>(null)

    const [isLoading, setIsLoading] = useState<Boolean>(true)

    const router = useRouter()
    const params = useParams()

    async function getResults(e: React.FormEvent<HTMLFormElement> | null, tempQuery?: string) {
        setIsLoading(true)

        if (query === "" && !tempQuery) return
        const currentQuery = query? query : tempQuery

        if (e) {
            e.preventDefault()
            router.push(`/research/${currentQuery}`) // only updates the path params on form submit, that way you don't rerequest

        }

        console.log("Query triggered, query: ", currentQuery)

        const endpoint = `https://progressx-search-backend.vercel.app/search/${currentQuery}`
                var response = await fetch(endpoint, {
            method: 'GET',
            credentials: 'include',
        })

        if (response.ok) {
            const solrResponse: SolrResponse = await response.json()

            if (solrResponse.hits === 0) return 
            setDocs(solrResponse.docs)
            setResultCount(solrResponse.hits)
            setLastQuery(currentQuery)

        }
        setIsLoading(false)
    } 

    async function getCached() {
        setIsLoading(true)
        const endpoint = `https://progressx-search-backend.vercel.app/cached`
        var response = await fetch(endpoint,
            {
                method: 'GET',
                credentials: 'omit',
            }
        )

        if (response.ok) {
            const cachedDocs = await response.json()
            setCached(cachedDocs.docs)

            console.log("cached docs: ", cachedDocs)
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
            const tempQuery = params.query[0].replaceAll("%20", " ")
            setQuery(tempQuery)
            getResults(null, tempQuery)
        } else {
            getCached()
        }
    },[])

    const scrollRef = useHorizontalScroll()

    return (
        <div className='mainWrapper'>
            <div className={styles.researchContainer}>
                <div className={styles.searchFormContainer}>
                    <form className={styles.searchForm} onSubmit={getResults}>
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
                    ( docs?
                        <div className={styles.resultsContainer}>
                            <div className={styles.resultsHeaderContainer}>
                                <p className={styles.searchHeader}>{lastQuery?.toUpperCase()}</p>
                                <p className={styles.resultsCount}>Search Results: {resultCount}</p>
                            </div>
                            <div className={styles.resultsScroll} ref={scrollRef}>
                                <div className={styles.resultsGrid}>
                                    {docs.map((doc: any, index:number)=>{
                                        return <StudyCard key={index} id={doc.id} title={doc.title} journal={doc.journal} callbackFunc={routeUser} />
                                    })}
                                </div>
                            </div>
                        </div>
                        :
                        <div className={styles.resultsContainer}>
                            <div className={styles.resultsHeaderContainer}>
                                <p className={styles.cacheHeader}>Recent Searches</p>
                            </div>
                            <div className={styles.resultsScroll} ref={scrollRef}>
                                <div className={styles.resultsGrid}>
                                {
                                    cached?
                                    cached.map((doc: any, index: number) => {
                                        return <StudyCard key={index} id={doc.id} title={doc.title} journal={doc.journal} callbackFunc={routeUser} />
                                    })
                                    :
                                    <p>No recent searches</p>
                                }
                                </div>
                            </div>
                        </div>
                    )}
            </div>
        </div>
    )
}

export default ResearchPage