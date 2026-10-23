"""Exercise the production React/JSON boundary with isolated SQLite and a mocked broker."""

import importlib.util
import io
import json
import subprocess
import sys
import unittest
import urllib.parse
from dataclasses import replace
from unittest import mock

import test_support_console as support_tests

CONSOLE, ROOT = support_tests.CONSOLE, support_tests.ROOT

SPEC = importlib.util.spec_from_file_location("tsuite_connect_web", ROOT / "console/tsuite_connect_web.py")
WEB = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = WEB
SPEC.loader.exec_module(WEB)


class WebConsoleTest(unittest.TestCase):
    setUp = support_tests.SupportConsoleTest.setUp
    tearDown = support_tests.SupportConsoleTest.tearDown
    local_settings = support_tests.SupportConsoleTest.local_settings

    def app(self, local=False):
        return WEB.WebApplication(
            CONSOLE.Application(self.local_settings() if local else self.settings), CONSOLE
        )

    def call(self, app, path, method="GET", data=None, cookie="", origin=None):
        path, _, query = path.partition("?")
        body = urllib.parse.urlencode(data or {}).encode()
        environ = {
            "PATH_INFO": path,
            "QUERY_STRING": query,
            "REQUEST_METHOD": method,
            "CONTENT_LENGTH": str(len(body)),
            "wsgi.input": io.BytesIO(body),
            "HTTP_COOKIE": cookie,
            "HTTP_ACCEPT": "application/json",
        }
        if origin:
            environ["HTTP_ORIGIN"] = origin
        captured = {}
        result = b"".join(
            app(environ, lambda status, headers: captured.update(status=status, headers=headers))
        )
        return captured, json.loads(result) if result and dict(captured["headers"])[
            "Content-Type"
        ].startswith("application/json") else result

    def signed_in(self, app, admin=True):
        sid, csrf = app.store.new_session("alice", "Alice", admin)
        return "tsuite_connect_session=" + sid, csrf

    def test_bootstrap_explains_github_requirements_without_exposing_secrets(self):
        response, value = self.call(self.app(), "/api/bootstrap")
        self.assertTrue(response["status"].startswith("200"))
        self.assertEqual(value["allowed_org"], "transinfosh")
        self.assertEqual(value["allowed_team"], "support")
        self.assertIsNone(value["user"])
        self.assertNotIn("client_secret", json.dumps(value))
        self.assertEqual(value["session_ttl_seconds"], 7 * 86400)

    def test_console_serves_spa_on_direct_navigation_and_no_store(self):
        app = self.app()
        for path in ("/", "/users", "/session/012345abcdef", "/invite?token=test"):
            response, body = self.call(app, path)
            self.assertIn(b'<div id="app"></div>', body)
            self.assertIn(("Cache-Control", "no-store"), response["headers"])
            self.assertIn("script-src 'self'", dict(response["headers"])["Content-Security-Policy"])
        response, _ = self.call(app, "/")
        self.assertTrue(response["status"].startswith("401"))

    def test_style_nonce_is_unique_and_bound_to_each_html_response(self):
        import re

        app = self.app()
        nonces = []
        for _ in range(2):
            response, body = self.call(app, "/")
            nonce = re.search(rb'<meta name="csp-nonce" content="([A-Za-z0-9_-]+)">', body)[1].decode()
            policy = dict(response["headers"])["Content-Security-Policy"]
            self.assertIn(f"style-src 'self' 'nonce-{nonce}'", policy)
            self.assertNotIn("unsafe-inline", policy)
            nonces.append(nonce)
        self.assertNotEqual(*nonces)

    def test_assets_cannot_read_arbitrary_files(self):
        response, _ = self.call(self.app(), "/assets/../../tsuite_connect_console.py")
        self.assertTrue(response["status"].startswith("404"))

    def test_private_api_has_json_auth_failure(self):
        response, value = self.call(self.app(), "/api/sessions")
        self.assertTrue(response["status"].startswith("401"))
        self.assertEqual(value["error"]["code"], "login_required")

    def test_active_sessions_are_structured_without_html(self):
        app = self.app()
        cookie, _ = self.signed_in(app)
        with mock.patch.object(
            CONSOLE,
            "manager",
            return_value="012345abcdef\t<customer>\tenrolled\t22000\nfedcba543210\told\tclosed\t22001\n",
        ):
            _, value = self.call(app, "/api/sessions", cookie=cookie)
        self.assertEqual(
            value["sessions"],
            [{"id": "012345abcdef", "customer": "<customer>", "status": "enrolled", "remote_port": "22000"}],
        )

    def test_create_and_close_require_csrf_and_keep_broker_attribution(self):
        app = self.app()
        cookie, csrf = self.signed_in(app)
        with mock.patch.object(CONSOLE, "manager", return_value="") as manager:
            response, _ = self.call(app, "/api/session/012345abcdef/close", "POST", {}, cookie)
            self.assertTrue(response["status"].startswith("403"))
            manager.assert_not_called()
            response, value = self.call(
                app, "/api/session/012345abcdef/close", "POST", {"csrf": csrf}, cookie
            )
        self.assertTrue(value["ok"])
        manager.assert_called_once_with("close", "012345abcdef", "--closed-by", "alice")

    def test_close_json_explains_failure_and_never_includes_raw_stderr(self):
        app = self.app()
        cookie, csrf = self.signed_in(app)
        with mock.patch.object(
            CONSOLE.subprocess,
            "run",
            return_value=subprocess.CompletedProcess(
                [], 1, "", "客户侧清理未确认 secret-token-must-not-leak"
            ),
        ):
            response, value = self.call(
                app, "/api/session/012345abcdef/close", "POST", {"csrf": csrf}, cookie
            )
        self.assertTrue(response["status"].startswith("409"))
        self.assertEqual(value["error"]["code"], "cleanup_unconfirmed")
        self.assertIn("客户侧清理未确认", value["error"]["message"])
        self.assertNotIn("secret-token", json.dumps(value))
        self.assertRegex(value["error"]["request_id"], "^[0-9a-f]{12}$")

    def test_unknown_broker_error_is_safe_and_has_exit_code(self):
        app = self.app()
        cookie, csrf = self.signed_in(app)
        with mock.patch.object(
            CONSOLE.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 42, "", "Authorization: secret-token"),
        ):
            response, value = self.call(
                app, "/api/session/012345abcdef/close", "POST", {"csrf": csrf}, cookie
            )
        self.assertTrue(response["status"].startswith("502"))
        self.assertIn("42", value["error"]["message"])
        self.assertNotIn("secret-token", json.dumps(value))

    def test_create_returns_both_commands_and_ai_instructions_once(self):
        app = self.app()
        cookie, csrf = self.signed_in(app)
        created = {
            "id": "012345abcdef",
            "platform": "linux",
            "token": "legacy-token",
            "operator_claim_token": "grant-token",
            "customer_command": "customer-command",
        }
        with mock.patch.object(CONSOLE, "manager", return_value=json.dumps(created)) as manager:
            _, value = self.call(
                app, "/api/session", "POST", {"customer": "customer-one", "purpose": "", "csrf": csrf}, cookie
            )
        manager.assert_called_once_with(
            "create", "customer-one", "--created-by", "alice", "--purpose", "", "--platform", "linux"
        )
        self.assertIn("grant-token", value["operator_command"])
        self.assertIn("hostname", value["ai_instructions"])
        self.assertEqual(value["customer_command"], "customer-command")
        self.assertNotIn("legacy-token", json.dumps(value))

    def test_operator_platform_switch_never_changes_customer_platform(self):
        app = self.app()
        cookie, csrf = self.signed_in(app)
        data = {
            "csrf": csrf,
            "platform": "linux",
            "current_platform": "linux",
            "operator_platform": "windows",
            "customer_command": "customer-command",
            "grant": json.dumps({"id": "012345abcdef", "token": "grant", "url": "https://untrusted.invalid"}),
        }
        with mock.patch.object(
            CONSOLE, "manager", return_value='{"id":"012345abcdef","platform":"linux","status":"enrolled"}'
        ) as manager:
            _, value = self.call(app, "/api/session/012345abcdef/platform", "POST", data, cookie)
        manager.assert_called_once_with("show", "012345abcdef")
        self.assertIn("PowerShell", value["ai_instructions"])
        self.assertEqual(value["platform"], "linux")
        self.assertTrue(value["customer_locked"])
        self.assertNotIn("untrusted.invalid", json.dumps(value))

    def test_non_admin_cannot_list_or_invite_users(self):
        app = self.app()
        cookie, csrf = self.signed_in(app, False)
        for path, method in (("/api/users", "GET"), ("/api/users/invite", "POST")):
            response, _ = self.call(app, path, method, {"csrf": csrf}, cookie)
            self.assertTrue(response["status"].startswith("403"))

    def test_local_password_and_totp_share_extended_cookie_and_logout_revokes_it(self):
        app = self.app(True)
        _, value = self.call(
            app,
            "/login/local",
            "POST",
            {"username": "support-admin", "password": "correct horse battery staple"},
        )
        self.assertEqual(value["step"], "totp")
        with app.store.connection() as connection:
            challenge_id = connection.execute("SELECT id FROM local_login_challenge").fetchone()[0]
        with mock.patch.object(CONSOLE, "verify_totp", return_value=True):
            response, value = self.call(
                app, "/login/local/totp", "POST", {"totp": "123456"}, "tsuite_connect_local=" + challenge_id
            )
        cookies = [v for k, v in response["headers"] if k == "Set-Cookie"]
        cookie = next(c for c in cookies if c.startswith("tsuite_connect_session="))
        self.assertIn("Max-Age=604800", cookie)
        for flag in ("Secure", "HttpOnly", "SameSite=Lax"):
            self.assertIn(flag, cookie)
        cookie = cookie.split(";", 1)[0]
        _, value = self.call(app, "/api/bootstrap", cookie=cookie)
        _, value = self.call(app, "/api/logout", "POST", {"csrf": value["user"]["csrf"]}, cookie)
        _, value = self.call(app, "/api/bootstrap", cookie=cookie)
        self.assertIsNone(value["user"])

    def test_cross_origin_post_is_rejected_before_credential_verification(self):
        app = self.app(True)
        with mock.patch.object(CONSOLE, "verify_password") as verify:
            response, _ = self.call(app, "/login/local", "POST", {}, origin="https://untrusted.invalid")
        self.assertTrue(response["status"].startswith("403"))
        verify.assert_not_called()

    def test_configurable_login_lifetime_is_bounded(self):
        for ttl in (True, "604800", -1, 30 * 86400 + 1):
            with self.assertRaises(CONSOLE.ConsoleError):
                replace(self.settings, session_ttl_seconds=ttl).validate()
        replace(self.settings, session_ttl_seconds=8 * 3600).validate()
        replace(self.settings, session_ttl_seconds=30 * 86400).validate()

    def test_detail_filters_credentials_and_user_lists_filter_passwords(self):
        app = self.app(True)
        cookie, _ = self.signed_in(app)
        with mock.patch.object(
            CONSOLE,
            "manager",
            return_value='{"id":"012345abcdef","status":"enrolled","private_key":"secret-private-key"}',
        ):
            _, value = self.call(app, "/api/session/012345abcdef", cookie=cookie)
        self.assertNotIn("private_key", json.dumps(value))
        _, value = self.call(app, "/api/users", cookie=cookie)
        self.assertNotIn("password_hash", json.dumps(value))
        self.assertNotIn("totp_secret", json.dumps(value))
