#!/usr/bin/env python3
"""One webhook attempt, isolated in the SDK venv. Only a safe receipt is emitted."""
import argparse
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from sdk_secrets import Vault, silent_sdk


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def post(secret, payload, delivery_id):
    key = secret['key'].strip()
    if key.lower().startswith('authorization:'):
        key = key.partition(':')[2].strip()
    authorization = key if ' ' in key else 'Bearer ' + key
    request = Request(secret['url'], data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
                      headers={'Content-Type': 'application/json', 'Authorization': authorization,
                               'Idempotency-Key': delivery_id}, method='POST')
    try:
        with build_opener(NoRedirect()).open(request, timeout=10) as response:
            status = response.status
        return {'outcome': 'delivered' if 200 <= status < 300 else 'rejected', 'http_status': status}
    except HTTPError as error:
        status = error.code
        error.close()  # Never read, log or persist response bodies or Location headers.
        return {'outcome': 'retry' if status == 429 or 500 <= status < 600 else 'rejected', 'http_status': status}
    except (URLError, TimeoutError, OSError):
        # The receiver may have accepted the POST. Do not blindly replay it.
        return {'outcome': 'uncertain'}


def main():
    # Only the non-secret broker config path is accepted on argv.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--broker-config')
    args = parser.parse_args()
    try:
        raw = sys.stdin.buffer.read(262145)
        if len(raw) > 262144:
            raise ValueError('Input too large.')
        job = json.loads(raw)
        with silent_sdk():
            secret = Vault(args.broker_config).read()
    except Exception:
        print('{"outcome":"retry","category":"secret-read"}')
        return
    try:
        receipt = post(secret, job['payload'], job['delivery_id'])
    except Exception:
        receipt = {'outcome': 'uncertain'}
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
