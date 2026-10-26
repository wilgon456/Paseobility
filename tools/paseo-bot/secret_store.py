#!/usr/bin/env python3
"""Store the Grok webhook JSON from stdin using the official Bitwarden SDK."""
import argparse
import json
import sys
from sdk_secrets import Vault, silent_sdk, validate_secret


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError('Invalid command.')


def main(argv=None, stream=None, vault_factory=Vault):
    try:
        parser = Parser(description=__doc__)
        parser.add_argument('command', choices=['check', 'store', 'verify'])
        parser.add_argument('--broker-config')  # Public path only; never a credential.
        args = parser.parse_args(argv)
        value = None
        if args.command == 'store':
            source = stream or sys.stdin.buffer
            if source.isatty():
                raise ValueError('Piped stdin required.')
            raw = source.read(20001)
            if len(raw) > 20000:
                raise ValueError('Input too large.')
            value = validate_secret(json.loads(raw.decode('utf-8')))
        with silent_sdk():
            vault = vault_factory(args.broker_config)
            if args.command == 'store':
                vault.store(value)
            elif args.command == 'verify':
                vault.read()
        print(json.dumps({'ok': True, 'operation': args.command}))
        return 0
    except Exception:
        print('{"ok":false,"error":"secret-store-failed"}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
