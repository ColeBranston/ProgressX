from abstract_doc import abstract_doc

class pubMed_doc(abstract_doc):
    
    def __init__(self, doc):
        super().__init__()
        self.parseDoc(doc)

    def parseDoc(self, doc):
        new_json = self.parseAdditional(doc['additional'])
        doc = doc | new_json # merges the two dictionaries
        for key in self.core_schema.keys():
            self._clean_doc[key] = doc[key]

    def parseAdditional(self, s: str):
        s = s.split("||")
        temp = {}
        for string in s[0:2]: # only takes first two additional keys: title, journal
            indexx = string.index(":")
            key = string[0:indexx]
            value = string[indexx+1:]

            temp[key] = value

        return temp

    def getDoc(self):
        return self._clean_doc