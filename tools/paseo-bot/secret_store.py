#!/usr/bin/env python3
"""Store or read a secret JSON value; values never cross a command-line boundary."""
import argparse
import json
import sys
from sdk_secrets import VALIDATORS, Vault, silent_sdk, validate


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError('Invalid command.')


def main(argv=None, stream=None, vault_factory=Vault, out=None):
    output = out if out is not None else sys.stdout
    try:
        parser = Parser(description=__doc__)
        parser.add_argument('command', choices=['check', 'store', 'read', 'verify'])
        parser.add_argument('--broker-config')  # Public path only; never a credential.
        parser.add_argument('--kind', choices=sorted(VALIDATORS), default='discord-bot')
        parser.add_argument('--name')  # Optional Bitwarden item name; never a credential.
        args = parser.parse_args(argv)
        value = None
        if args.command == 'store':
            source = stream or sys.stdin.buffer
            if source.isatty():
                raise ValueError('Piped stdin required.')
            raw = source.read(20001)
            if len(raw) > 20000:
                raise ValueError('Input too large.')
            value = validate(args.kind, json.loads(raw.decode('utf-8')))
        if args.command == 'read' and getattr(output, 'isatty', lambda: True)():
            # A value printed to a terminal would leak into scrollback and history.
            raise ValueError('Non-terminal stdout required.')
        secret = None
        with silent_sdk():
            vault = vault_factory(args.broker_config, name=args.name, kind=args.kind)
            if args.command == 'store':
                vault.store(value)
            elif args.command == 'read':
                secret = validate(args.kind, vault.read())
            elif args.command == 'verify':
                vault.read()
        if args.command == 'read':
            print(json.dumps(secret, ensure_ascii=False, separators=(',', ':')), file=output)
            secret = None
        else:
            print(json.dumps({'ok': True, 'operation': args.command}), file=output)
        return 0
    except Exception:
        print('{"ok":false,"error":"secret-store-failed"}', file=output)
        return 1


if __name__ == '__main__':
    sys.exit(main())
