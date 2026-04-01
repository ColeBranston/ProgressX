'use client';

import { useParams, useRouter } from "next/dist/client/components/navigation"
import { useEffect, useMemo, useState } from "react";
import { SolrResponse } from "../../[[...query]]/page";

import styles from './doc.module.css'

export default function StudyPage() {
    const params = useParams()
    const router = useRouter()

    const [link, setLink] = useState<string>()
    const [journal, setJournal] = useState<string>()
    const [published, setPublished] = useState<string>()
    const [title, setTitle] = useState<string>()
    const [content, setContent] = useState<string[]>()

    async function getDocument(){
        const id = params.id
        if (!id) router.push('/research')

        const result = await fetch(`https://progressx-search-backend.vercel.app/doc/${id}`, {
            method: 'GET',
            credentials: 'omit'
        })

        const solrDocument: SolrResponse = await result.json()

        const doc = solrDocument.docs[0]

        if (!doc) router.push('/research')

        console.log(doc)

        setLink(doc.id)
        setJournal(doc.journal)
        setPublished(doc.published)
        setTitle(doc.title)
        setContent(formatContent(doc.content))
    }
    
    useEffect(()=> {
        console.log("Params: ", params)
        console.log("ID: ", params.id)
        
        getDocument()
    },[])

    function formatContent(content: string) {
        const output: string[] = []
        const max_size = 4

        const sentences = content?.split(". ") || []

        let currentChunk: string[] = []

        for (let i = 0; i < sentences.length; i++) {
            currentChunk.push(sentences[i])

            if (currentChunk.length === max_size) {
                output.push(currentChunk.join(". "))
                currentChunk = []
            }
        }

        // push any remaining sentences
        if (currentChunk.length > 0) {
            output.push(currentChunk.join(". "))
        }
        
        return output
    }

    return (
            <div className='mainWrapper'>
                <div className={styles.docContainer}>
                    <div className={styles.extraInfoContainer}>
                        <p>{journal}</p>
                        <a href={link} target="_blank_">See More</a>
                    </div>
                    <div className={styles.headerContainer}>
                        <p>{title}</p>
                        <p style={{color: "rgb(var(--primary-color))"}}>{published}</p>
                    </div>
                    <div className={styles.contentContainer}>
                        {content?.map((para, index)=>{
                            return (
                                <>
                                <br/>
                                <p className={styles.contentText}>{para}</p>
                                </> 
                            )
                        })}
                    </div>
                </div>
            </div>
    )
}