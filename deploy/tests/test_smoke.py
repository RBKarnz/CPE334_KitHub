"""Offline unit tests for deploy/smoke_test.py (the network is mocked).

Run (repo root):  python3 -m unittest discover -s deploy/tests -p 'test_smoke.py'
CI runs it too (.github/workflows/ci-docker.yml).

Covers the KitHub checks (#5): public checks pass and login is skipped without
credentials; a DB that is not ready fails; /api/categories must answer 401 without
a session; the optional login uses {username, password} and the session cookie
(no Authorization header), reads /api/auth/me and a non-empty category list, and
always logs out; the password is never printed.
CHANGE ME: if you change the endpoints in smoke_test.py, update PUBLIC / SIGNED_IN below.
"""
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).parents[1] / 'smoke_test.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

BASE = 'https://kithub.example.test'
USERNAME = 'borrower1'
PASSWORD = 'test-only-not-a-real-password'
CREDENTIALS = {'SMOKE_USERNAME': USERNAME, 'SMOKE_PASSWORD': PASSWORD}

# (status, body) the real API returns without a session ...
PUBLIC = {
    '/api/health': (200, b'{"status":"ok"}'),
    '/api/ready': (200, b'{"status":"ready","db":"connected"}'),
    '/': (200, b'<!doctype html><html lang="en"></html>'),
    '/api/categories': (401, b'{"error":{"code":"UNAUTHENTICATED"}}'),
}
# ... and with the session cookie (calls made through the opener).
SIGNED_IN = {
    '/api/auth/login': (200, b'{"user":{"id":3,"username":"borrower1","role":"BORROWER"}}'),
    '/api/auth/me': (200, b'{"user":{"id":3,"username":"borrower1","role":"BORROWER"}}'),
    '/api/categories': (200, b'{"items":[{"id":1,"name":"Microcontrollers"}]}'),
    '/api/auth/logout': (204, b''),
}


class FakeApi:
    """Stands in for smoke.request. `overrides` maps (path, signed_in) to a result or an exception."""

    def __init__(self, overrides=None):
        self.calls = []
        self.overrides = overrides or {}

    def __call__(self, base, path, data=None, opener=None):
        self.calls.append({'path': path, 'data': data, 'opener': opener})
        result = self.overrides.get((path, opener is not None))
        if isinstance(result, Exception):
            raise result
        if result is not None:
            return result
        return (SIGNED_IN if opener is not None else PUBLIC)[path]

    def paths(self):
        return [call['path'] for call in self.calls]


def run_check(api):
    """Runs smoke.check against `api` with no real sleep. Returns what it printed."""
    out = io.StringIO()
    with patch.object(smoke, 'request', side_effect=api), patch.object(smoke.time, 'sleep'), \
            contextlib.redirect_stdout(out):
        try:
            smoke.check(BASE)
        finally:
            run_check.output = out.getvalue()
    return run_check.output


class PublicChecks(unittest.TestCase):
    @patch.dict('os.environ', {}, clear=True)
    def test_public_checks_pass_and_skip_optional_login(self):
        api = FakeApi()
        output = run_check(api)
        self.assertEqual(api.paths(), ['/api/health', '/api/ready', '/', '/api/categories'])
        self.assertIn('PASS /api/categories', output)
        self.assertIn('SKIP login: optional smoke credentials not configured', output)

    @patch.dict('os.environ', {}, clear=True)
    def test_db_not_ready_fails_even_when_http_responds(self):
        api = FakeApi({('/api/ready', False): (200, b'{"db":"disconnected"}')})
        with self.assertRaisesRegex(RuntimeError, '/api/ready'):
            run_check(api)

    @patch.dict('os.environ', {}, clear=True)
    def test_categories_without_session_must_not_return_data(self):
        api = FakeApi({('/api/categories', False): (200, b'{"items":[{"id":1}]}')})
        with self.assertRaisesRegex(RuntimeError, '/api/categories'):
            run_check(api)

    @patch.dict('os.environ', {}, clear=True)
    def test_categories_other_status_fails_after_retries(self):
        api = FakeApi({('/api/categories', False): (500, b'{}')})
        with self.assertRaisesRegex(RuntimeError, '/api/categories'):
            run_check(api)
        self.assertEqual(api.paths().count('/api/categories'), smoke.ATTEMPTS)

    @patch.dict('os.environ', {}, clear=True)
    def test_network_error_is_retried(self):
        api = FakeApi({('/api/health', False): urllib.error.URLError('cold start')})
        with self.assertRaisesRegex(RuntimeError, '/api/health'):
            run_check(api)
        self.assertEqual(api.paths().count('/api/health'), smoke.ATTEMPTS)


class LoginCheck(unittest.TestCase):
    @patch.dict('os.environ', CREDENTIALS, clear=True)
    def test_login_uses_username_and_session_cookie(self):
        api = FakeApi()
        output = run_check(api)
        signed_in = [call for call in api.calls if call['opener'] is not None]
        self.assertEqual([call['path'] for call in signed_in],
                         ['/api/auth/login', '/api/auth/me', '/api/categories', '/api/auth/logout'])
        self.assertEqual(signed_in[0]['data'], {'username': USERNAME, 'password': PASSWORD})
        # One cookie jar for the whole session.
        opener = signed_in[0]['opener']
        self.assertTrue(all(call['opener'] is opener for call in signed_in))
        self.assertTrue(any(isinstance(h, urllib.request.HTTPCookieProcessor) for h in opener.handlers))
        for line in ('PASS login and authenticated /api/auth/me', 'PASS authenticated /api/categories',
                     'PASS logout'):
            self.assertIn(line, output)
        self.assertNotIn(PASSWORD, output)

    @patch.dict('os.environ', CREDENTIALS, clear=True)
    def test_session_is_logged_out_even_if_me_fails(self):
        for failure in ((401, b'{"error":{}}'), urllib.error.URLError('reset')):
            with self.subTest(failure=failure):
                api = FakeApi({('/api/auth/me', True): failure})
                with self.assertRaisesRegex(RuntimeError, 'Login smoke'):
                    run_check(api)
                self.assertEqual(api.paths()[-1], '/api/auth/logout')
                self.assertNotIn(PASSWORD, run_check.output)

    @patch.dict('os.environ', CREDENTIALS, clear=True)
    def test_empty_category_list_fails_and_still_logs_out(self):
        api = FakeApi({('/api/categories', True): (200, b'{"items":[]}')})
        with self.assertRaisesRegex(RuntimeError, 'Login smoke'):
            run_check(api)
        self.assertEqual(api.paths()[-1], '/api/auth/logout')

    @patch.dict('os.environ', CREDENTIALS, clear=True)
    def test_refused_login_fails_without_logout(self):
        api = FakeApi({('/api/auth/login', True): (401, b'{"error":{"code":"INVALID_CREDENTIALS"}}')})
        with self.assertRaisesRegex(RuntimeError, 'Login smoke'):
            run_check(api)
        self.assertNotIn('/api/auth/logout', api.paths())
        self.assertNotIn(PASSWORD, run_check.output)

    @patch.dict('os.environ', CREDENTIALS, clear=True)
    def test_failed_logout_fails(self):
        api = FakeApi({('/api/auth/logout', True): (415, b'{}')})
        with self.assertRaisesRegex(RuntimeError, 'Logout smoke'):
            run_check(api)

    def test_only_one_credential_is_an_error(self):
        for env in ({'SMOKE_USERNAME': USERNAME}, {'SMOKE_PASSWORD': PASSWORD}):
            with self.subTest(env=sorted(env)), patch.dict('os.environ', env, clear=True):
                api = FakeApi()
                with self.assertRaisesRegex(RuntimeError, 'Set both SMOKE_USERNAME and SMOKE_PASSWORD'):
                    run_check(api)
                self.assertNotIn('/api/auth/login', api.paths())


class RequestHelper(unittest.TestCase):
    class Opener:
        """Records the urllib Request; answers with `result` (a response or an exception)."""

        def __init__(self, result):
            self.result = result
            self.sent = None

        def open(self, req, timeout=None):
            self.sent = req
            if isinstance(self.result, Exception):
                raise self.result
            return self.result

    class Response(io.BytesIO):
        def __init__(self, status, body):
            super().__init__(body)
            self.status = status

    def test_http_error_status_is_returned_not_raised(self):
        error = urllib.error.HTTPError(BASE + '/api/categories', 401, 'Unauthorized', {},
                                       io.BytesIO(b'{"error":{"code":"UNAUTHENTICATED"}}'))
        opener = self.Opener(error)
        self.assertEqual(smoke.request(BASE, '/api/categories', opener=opener),
                         (401, b'{"error":{"code":"UNAUTHENTICATED"}}'))
        self.assertEqual(opener.sent.get_method(), 'GET')

    def test_post_sends_json_and_no_authorization_header(self):
        opener = self.Opener(self.Response(204, b''))
        self.assertEqual(smoke.request(BASE, '/api/auth/logout', {}, opener), (204, b''))
        sent = opener.sent
        self.assertEqual(sent.get_method(), 'POST')
        self.assertEqual(sent.get_header('Content-type'), 'application/json')
        self.assertEqual(sent.data, b'{}')
        self.assertIsNone(sent.get_header('Authorization'))

    def test_network_error_still_raises(self):
        with self.assertRaises(urllib.error.URLError):
            smoke.request(BASE, '/api/health', opener=self.Opener(urllib.error.URLError('down')))


if __name__ == '__main__':
    unittest.main()
