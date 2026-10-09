"""Exercise the installer's real configuration writer without touching /etc."""
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


class ControlConfigTests(unittest.TestCase):
    def test_secret_rotation_preserves_existing_local_login(self):
        installer = (pathlib.Path(__file__).resolve().parents[1] / "control" / "install-connect-console.sh").read_text()
        writer = installer.split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            existing = root / "existing.json"
            local = {"local_admin_user": "admin", "local_password_hash": "scrypt$stored", "local_totp_secret": "TESTSECRET"}
            existing.write_text(json.dumps({"github_client_secret": "old", "github_callback_url": "https://support.example.com/support/auth/github/callback", **local}))
            secret = root / "secret"
            secret.write_text("new-secret")
            output = root / "new.json"
            subprocess.run([sys.executable, "-c", writer, str(output), "client_id", str(secret), "example-org", "", "support.example.com", str(root), str(existing), "", "", ""], check=True)
            config = json.loads(output.read_text())
            self.assertEqual(config["github_client_secret"], "new-secret")
            self.assertEqual(config["github_callback_url"], "https://support.example.com/support/auth/github/callback")
            for name, value in local.items():
                self.assertEqual(config[name], value)
            self.assertEqual(config["listen_host"], "127.0.0.1")
            self.assertEqual(config["public_url"], "https://support.example.com/connect")
