#!/usr/bin/env python3
"""Search the bot's archived and active Paseo conversations."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from discord_serve import find_runtime


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query')
    parser.add_argument('--all', action='store_true', help='Search entire timelines, not just recent entries')
    parser.add_argument('--limit', type=int, default=8)
    args = parser.parse_args()
    try:
        launch, module = find_runtime()
        env = dict(os.environ, ELECTRON_RUN_AS_NODE='1', PASEO_MULTI_HOST_CLIENT_MODULE=str(module))
        payload = json.dumps({'query': args.query, 'all': args.all, 'limit': args.limit}, ensure_ascii=False).encode('utf-8')
        result = subprocess.run(launch + [str(Path(__file__).with_name('history.mjs')), '--run'], input=payload,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, timeout=180)
        sys.stdout.buffer.write(result.stdout)
        return result.returncode
    except (OSError, ValueError, subprocess.SubprocessError):
        print('{"ok":false,"error":"history unavailable"}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
