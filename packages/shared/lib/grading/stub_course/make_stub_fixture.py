#!/usr/bin/env python3
"""Write the STUB COURSE's data fixture: a blank template and one submission.

Separate from `build_stub_course.py` because these are DATA, not the course
definition: they belong under $COURSE_DATA/courses/stub/, which is outside any
repository, while the course file and rubric ship with the engine.

The .docx files are built by hand as zips. `docx_text` reads a submission with
`zipfile` + `ElementTree` and wants exactly one member, `word/document.xml`, so
that is what these carry -- no python-docx dependency, and nothing in them that
the reader does not look at.

    python3 make_stub_fixture.py            # into $COURSE_DATA/courses/stub
    python3 make_stub_fixture.py <dir>
"""
import os
import pathlib
import sys
import zipfile

HANDOUTS = (1, 2)
PARTICIPANT = 1

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def _docx(path: pathlib.Path, paragraphs: list[str]) -> None:
    """One .docx carrying `paragraphs`, in order."""
    body = "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs)
    doc = f'<?xml version="1.0" encoding="UTF-8"?><w:document {W}><w:body>{body}</w:body></w:document>'
    path.parent.mkdir(parents=True, exist_ok=True)
    # DETERMINISTIC: a fixed timestamp, so rebuilding does not churn the bytes.
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        info = zipfile.ZipInfo("word/document.xml", date_time=(2026, 1, 1, 0, 0, 0))
        z.writestr(info, doc)


def main(argv) -> int:
    root = pathlib.Path(argv[1]) if len(argv) > 1 else (
        pathlib.Path(os.environ.get("COURSE_DATA", pathlib.Path.home() / "molly_data"))
        / "courses" / "stub")
    for h in HANDOUTS:
        # The TEMPLATE is the blank form. `segment` subtracts it from the
        # submission to find what the student wrote, so the submission must
        # repeat these lines verbatim and then add its own.
        prompt = [f"Stub handout {h}", f"S{h}. A stub question, answered by a stub slot."]
        _docx(root / "materials" / f"stub_handout{h}_template.docx", prompt)
        _docx(root / "submissions" / f"h{h}" / f"Stub Participant ID {PARTICIPANT}.docx",
              prompt + [f"This is participant {PARTICIPANT}'s stub answer to item S{h}."])
        (root / "out" / f"h{h}").mkdir(parents=True, exist_ok=True)
    print(f"  wrote the stub fixture under {root}")
    print(f"    materials/   {len(HANDOUTS)} template(s)")
    print(f"    submissions/ {len(HANDOUTS)} submission(s), participant {PARTICIPANT}")
    print(f"    out/         {len(HANDOUTS)} result director(ies)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
