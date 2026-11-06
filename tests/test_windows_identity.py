"""Account binding and routing regressions; no real sessions or users are modified."""

import json
import io
import pathlib
import tempfile
import unittest
from unittest import mock

import test_support_console as console
import test_support_session as sessions
from test_portable_support import PORTABLE

SUPPORT = sessions.SUPPORT
REMOTE = console.REMOTE
CLI = console.CLI


class WindowsIdentityEnrollmentTest(unittest.TestCase):
    setUp = sessions.SupportSessionTest.setUp
    tearDown = sessions.SupportSessionTest.tearDown

    def enroll(self, user, platform="windows"):
        token = sessions.SupportSessionTest.save_issued_session(self)
        state = self.store.load("012345abcdef")
        state["platform"] = platform
        self.store.save(state)
        return SUPPORT.enroll(self.store, token, "a" * 32, sessions.PUBLIC_KEY,
                              customer_ssh_user=user)

    def test_existing_windows_identity_is_bound_and_returned(self):
        payload = self.enroll("operator@corp.example")
        state = self.store.load("012345abcdef")
        self.assertEqual(state["customer_ssh_user"], "operator@corp.example")
        self.assertEqual(payload["customer_ssh_user"], "operator@corp.example")
        self.assertEqual(SUPPORT.public_session(state)["customer_ssh_user"], "operator@corp.example")
        self.assertEqual(SUPPORT.enroll(self.store, "one-time-token", "a" * 32,
                         sessions.PUBLIC_KEY, customer_ssh_user="operator@corp.example"), payload)
        for changed in ("other-user", None):
            with self.subTest(changed=changed), self.assertRaises(SUPPORT.SupportError):
                SUPPORT.enroll(self.store, "one-time-token", "a" * 32,
                               sessions.PUBLIC_KEY, customer_ssh_user=changed)
        self.assertEqual(self.store.load("012345abcdef"), state)

    def test_malformed_identity_is_rejected_before_enrollment_mutation(self):
        for user in ("", "*", "!admin", "a@@host", "a\nb", "a\x00b", 'a"b', "a\\b\\c", True, 12, [], "operator o'brien", "corp\\operator"):
            with self.subTest(user=user), self.assertRaises(SUPPORT.SupportError):
                self.enroll(user)
            self.assertEqual(self.store.load("012345abcdef")["status"], "issued")

    def test_linux_cannot_request_windows_account_binding(self):
        with self.assertRaises(SUPPORT.SupportError):
            self.enroll("administrator", platform="linux")

    def test_legacy_enrollment_preserves_original_username_contract(self):
        self.assertNotIn("customer_ssh_user", self.enroll(None))

    def test_forced_enrollment_uses_codepage_independent_json(self):
        sessions.SupportSessionTest.save_issued_session(self)
        state=self.store.load("012345abcdef")
        state.update(platform="windows", auth_mode="enrollment-key")
        self.store.save(state)
        request={"nonce":"a"*32,"customer_host_key":sessions.PUBLIC_KEY,"customer_ssh_user":"操作员"}
        stdin=io.TextIOWrapper(io.BytesIO(json.dumps(request, ensure_ascii=False).encode()))
        output=io.StringIO()
        with mock.patch.dict(SUPPORT.os.environ,{"SSH_ORIGINAL_COMMAND":"enroll"}), \
             mock.patch.object(SUPPORT.sys,"stdin",stdin),mock.patch.object(SUPPORT.sys,"stdout",output):
            SUPPORT.enroll_ssh(self.store,"012345abcdef")
        output.getvalue().encode("ascii")
        self.assertEqual(json.loads(output.getvalue())["customer_ssh_user"],"操作员")
        stdin.close()


class WindowsIdentityRoutingTest(unittest.TestCase):
    tearDown = console.SupportOperatorBrokerTest.tearDown

    def setUp(self):
        console.SupportOperatorBrokerTest.setUp(self)
        self.session_id = "012345abcdef"
        self.local = {"id": self.session_id, "identity_file": str(REMOTE.identity_path(self.settings, self.session_id))}
        REMOTE.atomic_write(REMOTE.identity_path(self.settings, self.session_id), "synthetic identity")
        REMOTE.atomic_write(REMOTE.session_state_path(self.settings, self.session_id), json.dumps(self.local))
        self.remote = {"id": self.session_id, "status": "enrolled", "tunnel_reachable": True,
                       "remote_port": 22000, "customer_host_key": sessions.PUBLIC_KEY, "platform": "windows"}

    def arguments(self, kind, remote, root):
        if kind == "broker":
            return REMOTE.customer_ssh_args(self.settings, self.session_id, remote, root / "known")
        if kind == "cli":
            with mock.patch.object(CLI, "SESSIONS_DIR", root):
                return CLI.customer_ssh_args({"bastion": "edge"}, self.local, remote)[0]
        settings = {"id": self.session_id, "host": "edge.example.com", "port": 22, "user": "tsuite-operator"}
        relay = "def connect(arguments, *args, **kwargs):\n    return arguments\n"
        with mock.patch.object(PORTABLE, "ACTIVITY_SOURCE", relay):
            return PORTABLE.connect(root, settings, remote, None)

    def test_all_operator_paths_route_exact_bound_identity_as_data(self):
        for kind in ("broker", "cli", "portable"):
            for user in ("administrator", "operator@corp.example", "support user", "操作员"):
                with self.subTest(kind=kind, user=user), tempfile.TemporaryDirectory() as temporary:
                    args = self.arguments(kind, self.remote | {"customer_ssh_user": user}, pathlib.Path(temporary))
                    self.assertEqual(args[-3:], ["-l", user, "127.0.0.1"])

    def test_legacy_operator_targets_are_unchanged(self):
        for kind in ("broker", "cli", "portable"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                args = self.arguments(kind, self.remote, pathlib.Path(temporary))
                self.assertEqual(args[-1], "tsuite-ops-012345ab@127.0.0.1")

    def test_malformed_or_cross_platform_metadata_never_reaches_ssh(self):
        for kind in ("broker", "cli", "portable"):
            for value in (None, "", "a\nb", "*", "a@@host", 'a"b', True):
                with self.subTest(kind=kind, value=value), tempfile.TemporaryDirectory() as temporary:
                    with self.assertRaises((ValueError, REMOTE.RemoteActionError, CLI.CliError)):
                        self.arguments(kind, self.remote | {"customer_ssh_user": value}, pathlib.Path(temporary))
            with self.subTest(kind=kind, platform="linux"), tempfile.TemporaryDirectory() as temporary:
                with self.assertRaises((ValueError, REMOTE.RemoteActionError, CLI.CliError)):
                    self.arguments(kind, self.remote | {"platform": "linux", "customer_ssh_user": "admin"}, pathlib.Path(temporary))
