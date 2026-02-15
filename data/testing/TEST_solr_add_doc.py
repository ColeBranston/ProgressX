from solr_instance import *

# solr_raw_core.add([
#     {
#         "id": "this is a new doc",

#     }
# ])

# solr_clean_core.add([
#     {
#         "id": "hello"
#     }
# ])


def select_core():
    inputt = eval(input("\nChoose your core:"
                        + "\n1. raw_ingestion_core"
                        + "\n2. clean_ingestion_core\n\n"))

    if inputt == 1:
        return solr_raw_core
    elif input == 2:
        return solr_clean_core


while True:
    print("##################")
    print("SOLR MANIPULATOR")
    print("##################")

    print("\n\nChoose from these options"
          + "\n1. Add Document"
          + "\n2. Remove Document")

    inputt = eval(input("Enter (1 or 2): "))

    core = select_core()

    if inputt == 1:
        print("\n...Adding Document to Core: ", core)

        id = input("Enter ID to add to solr core: ")

        core.add([
            {
                "id": id
            }
        ])

        print("Document added to core: ", id)

    elif inputt == 2:
        print("\n...Removing Document from Core: ", core)

        id = input("Enter ID to remove from solr core: ")

        core.delete(id)

        print("Document removed from core: ", id)

    again = input("Do you want to go again (Y/N): ").upper()

    if again != "Y":
        break
