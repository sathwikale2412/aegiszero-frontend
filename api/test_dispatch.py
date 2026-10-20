"""Exercise the aegiszero dispatch service without a live Supabase or Workato.

verify_caller and requests.post are patched so the checks cover this service's own
decisions: who may call, what is accepted, what a caller is told when upstream breaks.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))
os.environ['WORKATO_WEBHOOK_URL'] = 'https://workato.invalid/webhooks/rest/fake/employee_transfer'

import index  # noqa: E402


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=''):
        self.status_code = status_code
        self._payload = payload if payload is not None else {'status': 'ok'}
        self.text = text

    def json(self):
        return self._payload


def run(label, expect_status, mutate=None, **kwargs):
    if mutate:
        mutate()
    client = index.app.test_client()
    response = client.post('/api/dispatch', **kwargs)
    body = response.get_json()
    ok = 'PASS' if response.status_code == expect_status else 'FAIL'
    print(f'{ok}  {label}: {response.status_code} {str(body)[:130]}')
    return body


print('--- health never leaks the URL ---')
health = index.app.test_client().get('/api/health').get_json()
assert 'workato.invalid' not in str(health), 'health leaked the webhook host'
print('PASS  health:', health)

print('\n--- fails closed when auth is not configured ---')
index.SUPABASE_URL = ''
run('dispatch with no Supabase configured', 401, json={'kind': 'single', 'payload': {}})

print('\n--- with a verified caller ---')
index.SUPABASE_URL = 'https://fake.supabase.co'
index.SUPABASE_ANON_KEY = 'anon'
index.verify_caller = lambda: ('11111111-1111-1111-1111-111111111111', None)

GOOD = {
    'event_type': 'employee.team_transferred',
    'employee_id': 'EMP-101',
    'company_email': 'employee@company.example',
    'previous_team_id': 'TEAM-A',
    'new_team_id': 'TEAM-B',
    'justification': 'Role realignment and department restructuring',
}

print('\n--- server-side validation ---')
index._hits.clear()
run('missing everything', 422, json={'kind': 'single', 'payload': {}})
run('bad email', 422, json={'kind': 'single', 'payload': {**GOOD, 'company_email': 'not-an-email'}})
run('injected employee_id', 422, json={'kind': 'single', 'payload': {**GOOD, 'employee_id': 'EMP/../admin'}})
run('blank justification', 422, json={'kind': 'single', 'payload': {**GOOD, 'justification': '   '}})
run('unknown kind', 422, json={'kind': 'magic', 'payload': GOOD})
run('malformed body', 400, data='not json', content_type='text/plain')
run('oversized batch', 422, json={'kind': 'batch', 'payload': {'records': [{'employee_id': 'E1', 'company_email': 'a@b.co'}] * 201}})
run('batch row with bad email', 422, json={'kind': 'batch', 'payload': {'records': [{'employee_id': 'E1', 'company_email': 'nope'}]}})

print('\n--- accepted, and the body the recipe actually receives ---')
captured = {}


def fake_post(url, json=None, timeout=None):
    captured['url'] = url
    captured['body'] = json
    return FakeResponse(200, {'status': 'ok'})


index.requests.post = fake_post
body = run('valid single dispatch', 200, mutate=lambda: None,
           json={'kind': 'single', 'payload': {**GOOD, 'smuggled_instruction': 'drop everything'}})
assert 'smuggled_instruction' not in captured['body'], 'client smuggled a key into the recipe payload'
assert captured['body']['operator'] == '11111111-1111-1111-1111-111111111111', 'operator not bound to the token'
print('PASS  forwarded body keys:', sorted(captured['body']))

print('\n--- upstream failures become one generic sentence ---')
import requests as real_requests  # noqa: E402

index._hits.clear()


def boom(*a, **k):
    raise real_requests.ConnectionError('connection reset by peer')


bodies = [run('upstream network error', 502, mutate=lambda: setattr(index.requests, 'post', boom),
              json={'kind': 'single', 'payload': GOOD})]


def reject(url, json=None, timeout=None):
    return FakeResponse(500, text='Traceback: secret internal detail')


bodies.append(run('upstream 500', 502, mutate=lambda: setattr(index.requests, 'post', reject),
                  json={'kind': 'single', 'payload': GOOD}))
bodies.append(run('upstream 404', 502, mutate=lambda: setattr(index.requests, 'post',
                lambda url, json=None, timeout=None: FakeResponse(404, text='no such recipe')),
                json={'kind': 'single', 'payload': GOOD}))
for leaked in bodies:
    for phrase in ('Traceback', 'secret internal', 'workato.invalid', 'ConnectionError'):
        assert phrase not in str(leaked), f'the client was told about {phrase}'
    assert leaked['message'] == index.GENERIC_FAILURE, 'a failure message differed from the generic one'
print('PASS  all three upstream failures return one generic sentence')

print('\n--- rate limit ---')
index.requests.post = fake_post
index._hits.clear()
codes = [index.app.test_client().post('/api/dispatch', json={'kind': 'single', 'payload': GOOD}).status_code
         for _ in range(index.RATE_MAX_DISPATCHES + 2)]
print(f'PASS  {codes.count(200)} accepted then {codes.count(429)} refused:', codes)
assert 429 in codes and codes.count(200) == index.RATE_MAX_DISPATCHES

print('\n--- anonymous token is refused before any validation ---')
index._hits.clear()
index.verify_caller = lambda: (None, 'bad-token')
run('expired session', 401, json={'kind': 'single', 'payload': GOOD})

print('\nAll dispatch-service checks finished.')
