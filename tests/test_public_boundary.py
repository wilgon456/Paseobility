from __future__ import annotations

import json
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
MANAGER = ROOT / "skills" / "paseo-skill-save" / "manager"


class PublicBoundaryTests(unittest.TestCase):
    def test_public_manager_has_only_its_router_catalog(self) -> None:
        registry = json.loads((MANAGER / "registry.json").read_text(encoding="utf-8"))
        self.assertEqual(
            [(item.get("catalog_id"), item.get("source_id")) for item in registry["skills"]],
            [("core.skill-hub-router", "core-router")],
        )
        self.assertFalse((MANAGER / "catalog" / "items" / "private-library.json").exists())
        self.assertFalse((MANAGER / "catalog" / "sources" / "private-library.json").exists())

    def test_public_git_tree_contains_no_private_catalog_or_payload_paths(self) -> None:
        result = subprocess.run(
            ["git", "-C", str(ROOT), "ls-files"],
            check=True,
            capture_output=True,
            text=True,
        )
        forbidden = {
            "catalog/items/private-library.json",
            "catalog/sources/private-library.json",
            "skills/paseo-skill-save/manager/catalog/items/private-library.json",
            "skills/paseo-skill-save/manager/catalog/sources/private-library.json",
        }
        paths = set(result.stdout.splitlines())
        self.assertTrue(forbidden.isdisjoint(paths))
        self.assertFalse(any(path.endswith("/private-library.json") for path in paths))


if __name__ == "__main__":
    unittest.main()
