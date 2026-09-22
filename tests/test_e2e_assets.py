"""Offline tests for the E2E fixture server.

The report template is an honest manual record and has no automated validator,
so nothing here validates report contents. This only proves the reusable
fixture server starts, prints its URL with a flush (bounded by a watchdog
thread), and serves the expected page. No browser or Cua session is involved.
"""
import re
from pathlib import Path
import subprocess
import sys
import threading
import unittest
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
SERVE = ROOT / "e2e" / "serve-fixture.py"


def read_first_line(process, timeout):
    """Read one stdout line without blocking forever (watchdog thread)."""
    result = {}

    def reader():
        try:
            result["line"] = process.stdout.readline()
        except Exception:  # pragma: no cover - defensive
            result["line"] = ""

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    thread.join(timeout)
    if thread.is_alive():
        return None
    return result.get("line", "")


class FixtureMarkupTests(unittest.TestCase):
    def test_bottom_marker_is_document_bottom(self):
        html = (ROOT / "e2e" / "browser-fixture" / "index.html").read_text()
        self.assertLess(html.index('id="spacer-bottom"'),
                        html.index('id="marker-bottom"'),
                        "BOTTOM marker must come after the last spacer")
        self.assertLess(html.index('id="marker-bottom"'), html.index("</main>"),
                        "BOTTOM marker must be the last element in main")


class FixtureServerTests(unittest.TestCase):
    def test_serves_fixture_on_localhost(self):
        process = subprocess.Popen(
            [sys.executable, str(SERVE), "--bind", "127.0.0.1", "--port", "0"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        try:
            line = read_first_line(process, timeout=20)
            self.assertIsNotNone(line, "fixture did not print a URL in time")
            match = re.search(r"http://(\S+):(\d+)/", line or "")
            self.assertIsNotNone(match, "fixture did not print a URL: %r" % line)
            url = "http://%s:%s/" % (match.group(1), match.group(2))
            with urllib.request.urlopen(url, timeout=10) as response:
                body = response.read().decode("utf-8", "replace")
            self.assertIn("Paseobility E2E browser fixture", body)
            self.assertIn('id="compute"', body)
            self.assertIn('id="marker-bottom"', body)
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
            if process.stdout:
                process.stdout.close()


if __name__ == "__main__":
    unittest.main()
