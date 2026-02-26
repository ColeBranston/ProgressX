from abc import ABC, abstractmethod

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../'))) # required for module tunneling to get access to the config.py
print(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from DAGs.config import clean_schema

class abstract_doc(ABC):

    core_schema = clean_schema

    @abstractmethod
    def __init__(self): self._clean_doc = {} # private doc only accessable from the class itself

    @abstractmethod
    def parseDoc(self, doc): pass

    @abstractmethod
    def getDoc(self): pass

