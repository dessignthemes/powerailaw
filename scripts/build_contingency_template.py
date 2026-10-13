"""Turns the firm's LEAP "Contingency Dates Letter" into a LawPower template.

Usage: python3 scripts/build_contingency_template.py <leap-letter.docx> src/templates/contingency-dates-letter.docx

Every LEAP content control / MERGEFIELD becomes a plain {{PLACEHOLDER}} run (in the
same formatting), LEAP's hidden data (customXml parts with the old matter's
details, the LEAP add-in pane) is removed, and the inspection date is added.
"""
import re, sys, zipfile

SRC, DST = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(SRC)
files = {n: z.read(n) for n in z.namelist()}

SDT = {  # LEAP alias / mapping -> placeholder ("" = drop)
    "Letter date": "DATE",
    "Insertable_Delivery_Method_Calculation": "DELIVERY",
    "matter.defaultFile.addressee": "ADDRESSEE",
    "matter.defaultFile.postalAddressDown": "ADDRESS",
    "SELLER.People_Last_Name": "SELLER_LAST",
    "BUYER.People_Last_Name": "BUYER_LAST",
    "PROPERTY.Street_address": "PROPERTY",
    "MATTER.File_Number": "FILE_NO",
    "matter.defaultFile.dear": "DEAR",
    "matter.criticalDates.attorneyReviewCompleted.date": "AR_DATE",
    "CONTRACT_DETAI.Total_deposit": "DEPOSIT_AMOUNT",
    "matter.criticalDates.secondDepositDueDate.date": "DEPOSIT_DUE",
    "Payable To:": "DEPOSIT_PAYABLE_TO",
    "Mailed To:": "DEPOSIT_MAILED_TO",
    "matter.criticalDates.mortgageContingencyDate.date": "MORTGAGE_DATE",
    "CONTRACT_DETAI.Closing_date": "CLOSING_DATE",
    "Insertable_Staff_Signing_Name_Calculation": "SIGNER",
    "Insertable_Staff_Initials_Calculation": "INITIALS",
}
FIELD = {  # MERGEFIELD name -> placeholder ("" = drop)
    "SELLER__People_Last_Name": "",  # the RE: line already has the seller control before it
    "BUYER__People_Last_Name": "BUYER_LAST",
    "PROPERTY__Street_address": "PROPERTY",
    "PROPERTY__Property_address": "",
    "MATTER__File_Number": "FILE_NO",
}

def first_rpr(x):
    m = re.search(r"<w:r[ >](?:(?!</w:r>).)*?(<w:rPr>.*?</w:rPr>)", x, re.S)
    return m.group(1) if m else ""

def run(rpr, key):
    return f'<w:r>{rpr}<w:t xml:space="preserve">{{{{{key}}}}}</w:t></w:r>' if key else ""

def convert(xml, where):
    # 1. content controls
    def sdt(m):
        x = m.group(0)
        alias = re.search(r'<w:alias w:val="([^"]*)"', x)
        key = SDT.get(alias.group(1) if alias else "")
        if key is None:
            raise SystemExit(f"{where}: unknown LEAP control {alias.group(1) if alias else '?'}")
        content = re.search(r"<w:sdtContent>(.*)</w:sdtContent>", x, re.S).group(1)
        rpr = first_rpr(content) or (re.search(r"<w:sdtPr>.*?(<w:rPr>.*?</w:rPr>)", x, re.S) or [None, ""])[1]
        ppr = (re.search(r"<w:pPr>.*?</w:pPr>", content, re.S) or [""])[0]
        # cell-level control (a whole table cell): keep the cell and its shading/width
        if "<w:tc>" in content or "<w:tc " in content:
            tcpr = (re.search(r"<w:tcPr>.*?</w:tcPr>", content, re.S) or [""])[0]
            return f"<w:tc>{tcpr}<w:p>{ppr}{run(rpr, key)}</w:p></w:tc>"
        # block-level control (whole paragraphs): keep the first paragraph's formatting
        if "<w:p " in content or "<w:p>" in content:
            return f"<w:p>{ppr}{run(rpr, key)}</w:p>"
        return run(rpr, key)
    prev = None
    while prev != xml:  # innermost first (controls can nest)
        prev = xml
        xml = re.sub(r"<w:sdt>(?:(?!<w:sdt>).)*?</w:sdt>", sdt, xml, flags=re.S)

    # 2. complex fields: begin … instrText … separate … result … end
    runs = r"<w:r[ >](?:(?!</w:r>).)*?</w:r>"
    out, i = [], 0
    pat = re.compile(r'<w:r[ >](?:(?!</w:r>).)*?<w:fldChar w:fldCharType="begin"/>(?:(?!</w:r>).)*?</w:r>', re.S)
    while True:
        m = pat.search(xml, i)
        if not m:
            out.append(xml[i:]); break
        out.append(xml[i:m.start()])
        # find the matching end (fields can nest)
        depth, j = 0, m.start()
        for fm in re.finditer(r'<w:fldChar w:fldCharType="(begin|end)"/>', xml[m.start():]):
            depth += 1 if fm.group(1) == "begin" else -1
            if depth == 0:
                j = m.start() + fm.end()
                break
        end_run = xml.index("</w:r>", j) + len("</w:r>")
        field = xml[m.start():end_run]
        instr = " ".join(re.findall(r"<w:instrText[^>]*>([^<]*)</w:instrText>", field))
        name = re.search(r"MERGEFIELD\s+(\S+)", instr)
        if name:
            key = FIELD.get(name.group(1))
            if key is None:
                raise SystemExit(f"{where}: unknown MERGEFIELD {name.group(1)}")
            out.append(run(first_rpr(field), key))
        elif instr.strip().startswith("IF"):
            out.append("")  # LEAP signature-image switch
        else:
            out.append(field)  # PAGE numbers etc. stay
        i = end_run
    xml = "".join(out)
    # 3. drop LEAP proofing/bookmark leftovers that pointed into removed controls
    xml = re.sub(r"<w:proofErr [^>]*/>", "", xml)
    return xml

doc = files["word/document.xml"].decode()
doc = convert(doc, "document")
# Inspection row: its "By: " has no field in the LEAP letter; add the date in that row.
rows = list(re.finditer(r"<w:tr[ >].*?</w:tr>", doc, re.S))
row = next(r for r in rows if "Inspection Report" in r.group(0))
x = row.group(0)
by = [m for m in re.finditer(r"<w:p[ >](?:(?!</w:p>).)*?</w:p>", x, re.S) if re.sub(r"<[^>]+>", "", m.group(0)).strip().startswith("By:")]
assert by, "inspection By: line not found"
para = by[-1].group(0)
filled = para[: para.rindex("</w:p>")] + run(first_rpr(para), "INSPECTION_DATE") + "</w:p>"
x = x[: by[-1].start()] + filled + x[by[-1].end():]
doc = doc[: row.start()] + x + doc[row.end():]
files["word/document.xml"] = doc.encode()
for name in list(files):
    if re.match(r"word/header\d+\.xml$", name) or re.match(r"word/footer\d+\.xml$", name):
        files[name] = convert(files[name].decode(), name).encode()

# Remove LEAP's hidden data and add-in.
drop = [n for n in files if n.startswith("customXml/") or n.startswith("word/webextensions/")]
for n in drop:
    del files[n]
rels = files["word/_rels/document.xml.rels"].decode()
rels = re.sub(r'<Relationship [^>]*Target="\.\./customXml/[^"]*"[^>]*/>', "", rels)
files["word/_rels/document.xml.rels"] = rels.encode()
top = files["_rels/.rels"].decode()
top = re.sub(r'<Relationship [^>]*Target="word/webextensions/[^"]*"[^>]*/>', "", top)
files["_rels/.rels"] = top.encode()
ct = files["[Content_Types].xml"].decode()
ct = re.sub(r'<Override PartName="/(customXml|word/webextensions)/[^"]*"[^>]*/>', "", ct)
files["[Content_Types].xml"] = ct.encode()
settings = files["word/settings.xml"].decode()
settings = re.sub(r"<w:attachedTemplate [^>]*/>", "", settings)
settings = re.sub(r"<w:docVars>.*?</w:docVars>", "", settings, flags=re.S)  # LEAP paths and ids
files["word/settings.xml"] = settings.encode()

with zipfile.ZipFile(DST, "w", zipfile.ZIP_DEFLATED) as w:
    for n, b in files.items():
        w.writestr(n, b)
left = set(re.findall(r"\{\{([A-Z_]+)\}\}", "".join(files[n].decode("utf-8", "ignore") for n in files if n.endswith(".xml"))))
print("placeholders:", sorted(left))
print("removed:", len(drop), "LEAP parts; sdt left:", sum(files[n].decode("utf-8","ignore").count("<w:sdt>") for n in files if n.startswith("word/") and n.endswith(".xml") and "glossary" not in n))
