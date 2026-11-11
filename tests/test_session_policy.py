"""Policy changes use isolated configuration/state; no system users or real SSH."""

import dataclasses
import json
import subprocess
import unittest
from unittest import mock

import test_support_session as sessions
import test_web_console as web
from test_support_console import BASTION_ACTION

SUPPORT = sessions.SUPPORT


class SessionPolicyTest(unittest.TestCase):
    tearDown = sessions.SupportSessionTest.tearDown
    save_issued_session = sessions.SupportSessionTest.save_issued_session
    def setUp(self):
        sessions.SupportSessionTest.setUp(self)
        self.config = self.settings.state_dir.parent / 'config.json'
        self.config.write_text(json.dumps(dataclasses.asdict(self.settings), default=str))
        self.config.chmod(0o640)

    def update(self, seconds, expected=7200):
        return SUPPORT.session_policy(self.config, self.store, seconds=seconds,
                                      expected=expected, updated_by='alice')

    def test_read_exposes_only_idle_policy(self):
        self.assertEqual(SUPPORT.session_policy(self.config, self.store), {
            'idle_timeout_seconds': 7200, 'minimum_seconds': 300, 'maximum_seconds': 28800,
        })

    def test_persistence_preserves_metadata_other_settings_and_existing_sessions(self):
        self.save_issued_session()
        old_session = self.store.load('012345abcdef')
        before = json.loads(self.config.read_text())
        metadata = self.config.stat()
        self.assertEqual(self.update(21600)['idle_timeout_seconds'], 21600)
        self.assertEqual(SUPPORT.Settings.load(self.config).session_ttl_seconds, 21600)
        before['session_ttl_seconds'] = 21600
        self.assertEqual(json.loads(self.config.read_text()), before)
        after = self.config.stat()
        self.assertEqual((after.st_uid, after.st_gid, after.st_mode & 0o777),
                         (metadata.st_uid, metadata.st_gid, 0o640))
        self.assertEqual(self.store.load('012345abcdef'), old_session)
        audit = json.loads((self.settings.state_dir / 'policy-audit.jsonl').read_text())
        self.assertEqual((audit['updated_by'], audit['before_seconds'], audit['requested_seconds']),
                         ('alice', 7200, 21600))

    def test_bounds_rejection_and_stale_update(self):
        for invalid in (True, '21600', 299, 28801):
            with self.subTest(invalid=invalid), self.assertRaises(SUPPORT.SupportError):
                self.update(invalid)
        self.update(300)
        with self.assertRaisesRegex(SUPPORT.SupportError, '已变化'):
            self.update(21600)
        self.assertEqual(self.update(28800, 300)['idle_timeout_seconds'], 28800)
        self.assertEqual(self.update(28800, 300)['idle_timeout_seconds'], 28800)

    def test_write_failure_preserves_config(self):
        before = self.config.read_bytes()
        with mock.patch.object(SUPPORT.os, 'replace', side_effect=OSError('disk failure')):
            with self.assertRaises(OSError):
                self.update(21600)
        self.assertEqual(self.config.read_bytes(), before)
        self.assertFalse(list(self.config.parent.glob('.session-policy-*')))

    def test_new_sessions_take_saved_policy_but_keep_short_claim_window(self):
        self.update(21600)
        store = SUPPORT.SessionStore(SUPPORT.Settings.load(self.config))
        with mock.patch.object(SUPPORT, 'create_tunnel_identity', return_value=(
            'fixture-user', 'PRIVATE', 'restrict,expiry-time="{expiry}" fixture\n'
        )), mock.patch.object(SUPPORT, 'create_key_pair', return_value=('PRIVATE', sessions.PUBLIC_KEY)), \
             mock.patch.object(SUPPORT, 'chown_to_user'), \
             mock.patch.object(SUPPORT, 'allocate_port', return_value=22000):
            created, _ = SUPPORT.create_session(store, 'customer-one', sessions.PUBLIC_KEY, 'alice')
        self.assertEqual(created['idle_timeout_seconds'], 21600)
        self.assertEqual(created['token_expires_at'] - created['created_at'], 900)


class PolicyApiTest(unittest.TestCase):
    setUp = web.WebConsoleTest.setUp
    tearDown = web.WebConsoleTest.tearDown
    local_settings = web.WebConsoleTest.local_settings
    app = web.WebConsoleTest.app
    call = web.WebConsoleTest.call
    signed_in = web.WebConsoleTest.signed_in

    def test_conflict_is_reported_without_leaking_remote_errors(self):
        app = self.app()
        cookie, csrf = self.signed_in(app)
        with mock.patch.object(web.CONSOLE.subprocess, 'run', return_value=
                               subprocess.CompletedProcess([], 1, '', '闲置设置已变化 secret-must-not-leak')):
            response, result = self.call(app, '/api/settings', 'POST', {
                'csrf': csrf, 'idle_timeout_seconds': '21600', 'expected_seconds': '7200',
            }, cookie)
        self.assertTrue(response['status'].startswith('409'))
        self.assertEqual(result['error']['code'], 'policy_conflict')
        self.assertNotIn('secret-must-not-leak', json.dumps(result))

    def test_operator_and_anonymous_cannot_read_or_write_policy(self):
        app = self.app()
        cookie, csrf = self.signed_in(app, False)
        with mock.patch.object(web.CONSOLE, 'manager') as manager:
            for method in ('GET', 'POST'):
                response, _ = self.call(app, '/api/settings', method, {'csrf': csrf}, cookie)
                self.assertTrue(response['status'].startswith('403'))
            response, _ = self.call(app, '/api/settings')
            self.assertTrue(response['status'].startswith('401'))
            manager.assert_not_called()

    def test_admin_uses_trusted_identity_and_validated_seconds(self):
        app = self.app()
        cookie, csrf = self.signed_in(app)
        policy = {'idle_timeout_seconds': 21600, 'minimum_seconds': 300, 'maximum_seconds': 28800}
        with mock.patch.object(web.CONSOLE, 'manager', return_value=json.dumps(policy)) as manager:
            response, result = self.call(app, '/api/settings', 'POST', {
                'csrf': csrf, 'idle_timeout_seconds': '21600', 'expected_seconds': '7200',
                'updated_by': 'forged-user',
            }, cookie)
            self.assertTrue(response['status'].startswith('200'))
            self.assertEqual(result, policy)
            manager.assert_called_once_with('policy-set', '--seconds', '21600',
                                            '--expected', '7200', '--updated-by', 'alice')

    def test_csrf_origin_and_invalid_values_do_not_reach_broker(self):
        app = self.app()
        cookie, csrf = self.signed_in(app)
        with mock.patch.object(web.CONSOLE, 'manager') as manager:
            for value in ('299', '28801', 'true', '21600.0', '-1', 'NaN', '1;id'):
                response, _ = self.call(app, '/api/settings', 'POST', {
                    'csrf': csrf, 'idle_timeout_seconds': value, 'expected_seconds': '7200',
                }, cookie)
                self.assertTrue(response['status'].startswith('400'))
            for data, origin in (({}, None), ({'csrf': csrf}, 'https://attacker.example')):
                response, _ = self.call(app, '/api/settings', 'POST', data, cookie, origin)
                self.assertTrue(response['status'].startswith('403'))
            manager.assert_not_called()


class PolicyBridgeTest(unittest.TestCase):
    def test_only_validated_fixed_policy_arguments_reach_root_manager(self):
        with mock.patch.object(BASTION_ACTION, 'run_manager', return_value=0) as manager:
            self.assertEqual(BASTION_ACTION.main(['policy-set', '--seconds', '21600',
                '--expected', '7200', '--updated-by', 'alice']), 0)
            manager.assert_called_once_with('policy-set', '--seconds', '21600',
                                            '--expected', '7200', '--updated-by', 'alice')
        with mock.patch.object(BASTION_ACTION, 'run_manager') as manager:
            for seconds, actor in (('299', 'alice'), ('28801', 'alice'), ('21600', 'alice;id')):
                with self.assertRaises(BASTION_ACTION.ActionError):
                    BASTION_ACTION.main(['policy-set', '--seconds', seconds,
                        '--expected', '7200', '--updated-by', actor])
            manager.assert_not_called()

