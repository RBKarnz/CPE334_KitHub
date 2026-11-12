"""Public deployment checks for KitHub. Passwords, cookies and response bodies are never printed.

WHAT THIS SCRIPT DOES
    Run after a deployment (by hand in Lab 5 #5, by .github/workflows/deploy.yml from #7):
        python3 deploy/smoke_test.py SERVICE_URL
    It checks the live service and exits non-zero (failing the workflow) if any
    check fails. It only reads: no record is created or changed. Each public check
    is retried up to 5 times, 3 seconds apart, to tolerate Cloud Run cold starts.

    Public checks (in order)
      1. GET /api/health      -> 200 {"status": "ok"}
      2. GET /api/ready       -> 200 {"db": "connected"}   (proves the DB works)
      3. GET /                -> 200 HTML page (the built React app is served)
      4. GET /api/categories  -> 401 without a session. KitHub has no public data
         endpoint (SDS 9.7), so this proves the API routes and the auth guard are
         live. A 200 here fails: it would mean the guard is off.

    Optional login check, only when BOTH SMOKE_USERNAME and SMOKE_PASSWORD are set
    (set both or neither; one without the other is an error):
      5. POST /api/auth/login {"username", "password"} -> 200, sets the
         kithub_session cookie (HttpOnly; no token in the body)
      6. GET  /api/auth/me                             -> 200 with the cookie
      7. GET  /api/categories                          -> 200 {"items": [...]},
         non-empty (proves the migration and the seed ran)
      8. POST /api/auth/logout                         -> 204, always sent once
         signed in, even if 6 or 7 failed

IMPORTANT
    - Use a Borrower account (lowest role), never a Custodian. In deploy.yml (#7)
      SMOKE_USERNAME is an environment variable and SMOKE_PASSWORD an environment
      secret of the `demo` environment.
    - The session cookie is Secure in production, so the login check needs the
      HTTPS Cloud Run URL. Against a local http://localhost run it fails at 6.
    - Uses only the Python standard library (no pip install needed).
    - Offline unit tests: deploy/tests/test_smoke.py

REFERENCES
    - urllib.request    : https://docs.python.org/3/library/urllib.request.html
    - http.cookiejar    : https://docs.python.org/3/library/http.cookiejar.html
    - unittest.mock     : https://docs.python.org/3/library/unittest.mock.html
    - KitHub API        : docs/system-sds.md 6.7 (health), 8.2 to 8.5 (auth)
"""
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.request

ATTEMPTS = 5
RETRY_SECONDS = 3


# --- HTTP helper --------------------------------------------------------------
def request(base, path, data=None, opener=None):
    """GET base+path, or POST `data` as JSON. Returns (status, body).

    An HTTP error status (4xx/5xx) is returned, not raised, so a check can expect
    401. Network errors and timeouts still raise (OSError: URLError, TimeoutError).
    `opener` carries the session cookie for the login check; no Authorization header.
    """
    headers = {}
    payload = None
    if data is not None:
        # The API answers 415 to a POST without this header, even with an empty body.
        headers['Content-Type'] = 'application/json'
        payload = json.dumps(data).encode()
    req = urllib.request.Request(base + path, data=payload, headers=headers,
                                 method='POST' if data is not None else 'GET')
    open_url = opener.open if opener is not None else urllib.request.urlopen
    try:
        with open_url(req, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as err:
        try:
            return err.code, err.read()
        finally:
            err.close()


def json_value(body, key):
    """body[key] if body is a JSON object, else None."""
    try:
        data = json.loads(body)
    except ValueError:
        return None
    return data.get(key) if isinstance(data, dict) else None


PUBLIC_CHECKS = (
    ('/api/health', lambda status, body: status == 200 and json_value(body, 'status') == 'ok'),
    ('/api/ready', lambda status, body: status == 200 and json_value(body, 'db') == 'connected'),
    ('/', lambda status, body: status == 200 and b'<html' in body.lower()),
    # No session: only 401 passes (SDS 9.7). Any other status fails.
    ('/api/categories', lambda status, body: status == 401),
)


def check(base):
    # --- Public checks ----------------------------------------------------------
    for path, passes in PUBLIC_CHECKS:
        # Retry: a cold Cloud Run instance may need a few seconds to start.
        for attempt in range(ATTEMPTS):
            try:
                if not passes(*request(base, path)):
                    raise ValueError('Unexpected response')
                break
            except (OSError, ValueError):
                if attempt == ATTEMPTS - 1:
                    raise RuntimeError('Smoke check failed: ' + path) from None
                time.sleep(RETRY_SECONDS)
        print('PASS ' + path)

    # --- Optional login check (only when both values are provided) --------------
    username, password = os.getenv('SMOKE_USERNAME'), os.getenv('SMOKE_PASSWORD')
    if bool(username) != bool(password):
        raise RuntimeError('Set both SMOKE_USERNAME and SMOKE_PASSWORD, or neither.')
    if not username:
        print('SKIP login: optional smoke credentials not configured')
        return

    # The session lives only in this cookie jar (kithub_session, HttpOnly).
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    logged_in = logged_out = False
    try:
        status, _ = request(base, '/api/auth/login', {'username': username, 'password': password}, opener)
        if status != 200:
            raise ValueError('Login refused')
        logged_in = True
        status, _ = request(base, '/api/auth/me', opener=opener)
        if status != 200:
            raise ValueError('No session')
        print('PASS login and authenticated /api/auth/me')
        status, body = request(base, '/api/categories', opener=opener)
        items = json_value(body, 'items')
        if status != 200 or not isinstance(items, list) or not items:
            raise ValueError('No categories')
        print('PASS authenticated /api/categories')
    except (OSError, ValueError):
        # Fixed message only: never the response body, the cookie or the password.
        raise RuntimeError('Login smoke check failed') from None
    finally:
        # Always end the session, even when a check above failed.
        if logged_in:
            logged_out = end_session(base, opener)
    if not logged_out:
        raise RuntimeError('Logout smoke check failed')


def end_session(base, opener):
    """POST /api/auth/logout with the session cookie. True when the API answers 204."""
    try:
        status, _ = request(base, '/api/auth/logout', {}, opener)
    except OSError:
        return False
    if status != 204:
        return False
    print('PASS logout')
    return True


# --- Entry point ----------------------------------------------------------------
if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 deploy/smoke_test.py SERVICE_URL')
    check(sys.argv[1].rstrip('/'))
