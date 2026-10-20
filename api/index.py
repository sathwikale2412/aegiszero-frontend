"""AegisZero dispatch service.

The browser used to POST straight to the Workato webhook, so the webhook URL — and the
tenant token embedded in it — had to be compiled into the public bundle behind a VITE_
prefix. Anyone who opened dev tools could then revoke enterprise access at will. The URL
now lives only in this function's environment; callers get an authenticated, validated
relay instead of the endpoint itself.
"""
import logging
import os
import re
import time
import uuid

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

WORKATO_WEBHOOK_URL = os.environ.get('WORKATO_WEBHOOK_URL', '').strip()
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '')

ALLOWED_EVENT_TYPES = {'employee.team_transferred', 'employee.access_revoked', 'bulk.batch_processed'}
MAX_BATCH_ROWS = 200
RATE_WINDOW_SECONDS = 60
RATE_MAX_DISPATCHES = 10
UPSTREAM_TIMEOUT_SECONDS = 25

ID_RE = re.compile(r'^[A-Za-z0-9_.-]{1,32}$')
EMAIL_RE = re.compile(r'^[^\s@]{1,64}@[^\s@]{1,255}\.[A-Za-z]{2,}$')

GENERIC_FAILURE = 'The automation pipeline did not accept the request. No access was changed.'
REFUSALS = {
    'auth-not-configured': 'This deployment cannot verify sign-in, so dispatch is disabled.',
    'no-token': 'Sign in before dispatching. Anonymous requests are not accepted.',
    'bad-token': 'Your session is no longer valid. Sign in again and retry.',
    'auth-unreachable': 'The identity service could not be reached. Try again shortly.',
}

_hits: dict[str, list[float]] = {}


def verify_caller():
    """Return the user id behind the bearer token, or None.

    The anon key cannot mint or inspect tokens, so this only ever asks Supabase who the
    caller already is. When Supabase is not configured the answer is nobody — an
    unauthenticated relay into an access-revocation endpoint is not a fallback worth
    having, so it fails closed.
    """
    if not (SUPABASE_URL and SUPABASE_ANON_KEY):
        return None, 'auth-not-configured'
    header = request.headers.get('Authorization', '')
    token = header[7:].strip() if header.startswith('Bearer ') else ''
    if not token:
        return None, 'no-token'
    try:
        response = requests.get(
            f'{SUPABASE_URL}/auth/v1/user',
            headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {token}'},
            timeout=10,
        )
    except requests.RequestException:
        return None, 'auth-unreachable'
    if response.status_code != 200:
        return None, 'bad-token'
    try:
        claims = response.json()
    except ValueError:
        return None, 'bad-token'
    user_id = str(claims.get('sub') or claims.get('id') or '')
    return (user_id, None) if user_id else (None, 'bad-token')


def rate_limited(key):
    """Best effort, and only per warm instance.

    A stateless function cannot hold a global counter. GoTrue already throttles the
    sign-in itself; this exists so one operator cannot script the dispatch button.
    """
    now = time.time()
    hits = [seen for seen in _hits.get(key, []) if now - seen < RATE_WINDOW_SECONDS]
    if len(hits) >= RATE_MAX_DISPATCHES:
        _hits[key] = hits
        return True
    hits.append(now)
    _hits[key] = hits
    return False


def _bad_id(value):
    return not isinstance(value, str) or not ID_RE.match(value)


def validate_single(data):
    problems = []
    if data.get('event_type') not in ('employee.team_transferred', 'employee.access_revoked'):
        problems.append('event_type must be a team transfer or an access revocation.')
    for field in ('employee_id', 'previous_team_id', 'new_team_id'):
        if _bad_id(data.get(field)):
            problems.append(f'{field} must be 1-32 letters, digits, dot, dash or underscore.')
    email = data.get('company_email')
    if not isinstance(email, str) or not EMAIL_RE.match(email):
        problems.append('company_email must be a valid address.')
    reason = data.get('justification')
    if not isinstance(reason, str) or not 5 <= len(reason.strip()) <= 500:
        problems.append('justification is required (5-500 characters); it is the audit record.')
    return problems


def validate_batch(data):
    rows = data.get('records')
    if not isinstance(rows, list) or not rows:
        return ['records must be a non-empty list.'], []
    if len(rows) > MAX_BATCH_ROWS:
        return [f'A batch is limited to {MAX_BATCH_ROWS} rows.'], []
    problems = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            problems.append(f'row {index + 1} must be an object.')
            continue
        for field in ('employee_id', 'company_email'):
            value = row.get(field)
            if field == 'employee_id' and _bad_id(value):
                problems.append(f'row {index + 1}: employee_id is not a valid identifier.')
            if field == 'company_email' and (not isinstance(value, str) or not EMAIL_RE.match(value)):
                problems.append(f'row {index + 1}: company_email is not a valid address.')
    return problems, rows


@app.route('/', defaults={'path': ''}, methods=['GET', 'POST'])
@app.route('/<path:path>', methods=['GET', 'POST'])
def gateway(path):
    action = path.rstrip('/').split('/')[-1]

    if action in ('', 'health'):
        return jsonify({
            'status': 'ok',
            'service': 'aegiszero-dispatch',
            'pipeline': 'configured' if WORKATO_WEBHOOK_URL else 'missing env',
            'auth': 'enforced' if (SUPABASE_URL and SUPABASE_ANON_KEY) else 'not configured',
        })

    if action != 'dispatch':
        return jsonify({'status': 'error', 'message': f'Unknown endpoint: /{action}'}), 404

    request_id = uuid.uuid4().hex[:8]
    user_id, refusal = verify_caller()
    if user_id is None:
        app.logger.warning('dispatch refused id=%s reason=%s', request_id, refusal)
        return jsonify({'status': 'error', 'message': REFUSALS[refusal], 'request_id': request_id}), 401

    if rate_limited(user_id):
        app.logger.warning('rate limited id=%s user=%s', request_id, user_id)
        return jsonify({
            'status': 'error',
            'message': f'Too many dispatches. Wait {RATE_WINDOW_SECONDS} seconds and retry.',
            'request_id': request_id,
        }), 429

    data = request.get_json(silent=True) or {}
    kind = data.get('kind')
    payload = data.get('payload')
    if not isinstance(payload, dict):
        return jsonify({'status': 'error', 'message': 'Malformed request.', 'request_id': request_id}), 400

    if kind == 'single':
        problems = validate_single(payload)
    elif kind == 'batch':
        problems, _rows = validate_batch(payload)
    else:
        problems = ['kind must be either single or batch.']
    if problems:
        return jsonify({'status': 'error', 'message': problems[0], 'problems': problems[:8],
                        'request_id': request_id}), 422

    # Rebuilt here rather than forwarded, so a caller cannot smuggle extra keys into the
    # automation recipe by adding them to the request body.
    event_type = payload.get('event_type') if kind == 'single' else 'bulk.batch_processed'
    body = {
        'kind': kind,
        'event_type': event_type,
        'operator': user_id,
        'source': 'aegiszero_enterprise_portal',
        'correlation_id': request_id,
        'effective_at': payload.get('effective_at'),
    }
    if kind == 'single':
        body.update({
            'employee_id': payload['employee_id'],
            'company_email': payload['company_email'],
            'previous_team_id': payload['previous_team_id'],
            'new_team_id': payload['new_team_id'],
            'justification': payload['justification'].strip(),
            'action': event_type.rsplit('.', 1)[-1].upper(),
        })
    else:
        body['batch_size'] = len(payload['records'])
        body['records'] = payload['records']

    if not WORKATO_WEBHOOK_URL:
        return jsonify({
            'status': 'error',
            'message': 'No automation pipeline is configured on this deployment.',
            'request_id': request_id,
        }), 503

    try:
        upstream = requests.post(WORKATO_WEBHOOK_URL, json=body, timeout=UPSTREAM_TIMEOUT_SECONDS)
    except requests.RequestException as err:
        app.logger.error('upstream failed id=%s user=%s error=%s', request_id, user_id, err)
        return jsonify({'status': 'error', 'message': GENERIC_FAILURE, 'request_id': request_id}), 502

    if upstream.status_code >= 400:
        app.logger.error('upstream rejected id=%s user=%s status=%s body=%.400s',
                         request_id, user_id, upstream.status_code, upstream.text)
        return jsonify({'status': 'error', 'message': GENERIC_FAILURE, 'request_id': request_id}), 502

    app.logger.info('dispatched id=%s user=%s kind=%s', request_id, user_id, kind)
    return jsonify({'status': 'ok', 'accepted': True, 'request_id': request_id,
                    'event_type': event_type})


logging.getLogger(__name__).info('aegiszero dispatch service loaded')
