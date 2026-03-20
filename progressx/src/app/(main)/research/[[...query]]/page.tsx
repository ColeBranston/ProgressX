'use client';

import { useEffect, useState } from "react"
import styles from "./research.module.css"
import { useParams, useRouter } from "next/dist/client/components/navigation";
import { base64url } from "jose";

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

    const router = useRouter()
    const params = useParams()

    async function getResults(e: React.FormEvent<HTMLFormElement> | null, tempQuery?: string) {
        
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
    } 

    async function getCached() {
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

    return (
        <div className='mainWrapper'>
            <div className={styles.researchContainer}>
                <form onSubmit={getResults}>
                    <input placeholder="Search for optimal workouts..." onChange={(e)=>{setQuery(e.target.value)}}/>
                </form>

                { docs?
                    <div className={styles.resultsContainer}>
                        <p>{lastQuery}</p>
                        <p>Search Results: {resultCount}</p>
                        <div>
                            {docs.map((doc: any, index:number)=>{
                                return (
                                    <a href={doc.id} target="_blank" key={index}>
                                        <div>
                                            <p>{doc.title}</p>
                                            <p>{doc.description}</p>
                                        </div>
                                    </a>
                                )
                            })}
                        </div>
                    </div>
                    :
                    <div>
                        <p>Recent Searches</p>
                        {
                            cached?
                            cached.map((doc: any, index: number) => {
                                return (
                                    <a href={doc.id} target="_blank" key={index}>
                                        <div>
                                            <p>{doc.title}</p>
                                            <p>{doc.description}</p>
                                        </div>
                                    </a>
                                )
                            })
                            :
                            <p>No recent searches</p>
                        }
                    </div>
                }
            </div>
        </div>
    )
}

export default ResearchPage