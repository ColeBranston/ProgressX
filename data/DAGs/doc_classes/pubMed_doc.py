from abstract_doc import abstract_doc

class pubMed_doc(abstract_doc):

    # studies ingested before authors were collected don't have them
    optional_keys = {"authors"}

    def __init__(self, doc):
        super().__init__()
        self.parseDoc(doc)

    def parseDoc(self, doc):
        new_json = self.parseAdditional(doc['additional'])
        doc = doc | new_json # merges the two dictionaries
        for key in self.core_schema.keys():
            if key in self.optional_keys and key not in doc:
                continue
            self._clean_doc[key] = doc[key]

    def parseAdditional(self, s: str):
        s = s.split("||")
        temp = {}
        for string in s[0:2]: # the first two additional keys are always title, journal
            indexx = string.index(":")
            key = string[0:indexx]
            value = string[indexx+1:]

            temp[key] = value

        # authors come after pmid, ";"-separated, on studies ingested since they were collected
        for string in s[2:]:
            if string.startswith("authors:"):
                temp["authors"] = [name for name in string[len("authors:"):].split(";") if name]

        return temp

    def getDoc(self):
        return self._clean_doc