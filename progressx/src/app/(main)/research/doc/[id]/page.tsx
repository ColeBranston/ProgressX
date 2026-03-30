'use client';

import { useParams, useRouter } from "next/dist/client/components/navigation"
import { useEffect, useState } from "react";
import { SolrResponse } from "../../[[...query]]/page";

import styles from './doc.module.css'

export default function StudyPage() {
    const params = useParams()
    const router = useRouter()

    const [link, setLink] = useState<string>()
    const [journal, setJournal] = useState<string>()
    const [published, setPublished] = useState<string>()
    const [title, setTitle] = useState<string>()
    const [content, setContent] = useState<string>()

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
        setContent(doc.content)
    }
    
    useEffect(()=> {
        console.log("Params: ", params)
        console.log("ID: ", params.id)
        
        getDocument()
    },[])
    return (
            <div className='mainWrapper'>
                <div className={styles.docContainer}>
                    <a href={link} target="_blank_"><button>See More</button></a>
                    <p>{journal}</p>
                    <div>
                        <p>Published: {published}</p>
                        <p>{title}</p>
                    </div>
                    <div className={styles.contentContainer}>
                        <p>{content}</p>
                    </div>
                </div>
            </div>
    )
}