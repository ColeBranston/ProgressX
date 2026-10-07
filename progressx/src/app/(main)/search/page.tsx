"use client";

import { Suspense } from "react";
import SearchResults from "../../internal_components/search/SearchResults";

// /search?q=...&tab=videos|profiles  (the navbar's search box lands here)
export default function SearchPage() {
    return (
        <Suspense>
            <SearchResults />
        </Suspense>
    )
}
