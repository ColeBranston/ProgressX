'use client';

import { useState } from "react"
import styles from "./research.module.css"

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
    const [docs, setDocs] = useState<any>(null)
    const [resultCount, setResultCount] = useState<number>(0)

    async function getResults(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (query === "") return
        const endpoint = `https://progressx-search-backend.vercel.app/search/${query}`
        var response = await fetch(endpoint, {
            method: 'GET',
            credentials: 'include',
        })

        if (response.ok) {
            const solrResponse: SolrResponse = await response.json()

            if (solrResponse.hits === 0) return 
            setDocs(solrResponse.docs)
            setResultCount(solrResponse.hits)
        }
    } 
    return (
        <div className='mainWrapper'>
            <div className={styles.researchContainer}>
                <form onSubmit={getResults}>
                    <input placeholder="Search for optimal workouts..." onChange={(e)=>{setQuery(e.target.value)}}/>
                </form>

                { docs?
                    <div className={styles.resultsContainer}>
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
                    null
                }
            </div>
        </div>
    )
}

export default ResearchPage