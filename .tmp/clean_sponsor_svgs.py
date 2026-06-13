from pathlib import Path
import re
base = Path(r"C:\Users\congi\OneDrive\Desktop\Prodigy\assets\tech1-sponsor-logos")
acrc = base / "ACRC.svg"
buzz = base / "BuzzBreak.svg"
acrc_text = acrc.read_text(encoding="utf-8")
acrc_text = re.sub(r'<g stroke-width="2\.00" fill="none" stroke-linecap="butt">[\s\S]*?</g>\s*', '', acrc_text, count=1)
acrc_text = re.sub(r'<(?:path|rect) fill="#efefef"[\s\S]*?/>\s*', '', acrc_text)
acrc.write_text(acrc_text, encoding="utf-8")
buzz_text = buzz.read_text(encoding="utf-8")
buzz_text = re.sub(r'<g stroke-width="2\.00" fill="none" stroke-linecap="butt">[\s\S]*?</g>\s*', '', buzz_text, count=1)
buzz.write_text(buzz_text, encoding="utf-8")
print("cleaned")
